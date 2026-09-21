const calloutPattern = /^\[!([A-Za-z0-9_-]+)\](?:([+-])[ \t]*|[ \t]*)/
const warningCalloutTypes = new Set(['warning', 'caution', 'attention', 'danger', 'error'])

/**
 * Turn Obsidian's callout blockquotes into details or aside elements.
 *
 * Ordinary blockquotes and literal code markers stay untouched.
 */
export default function remarkFoldableCallouts() {
  return function transformFoldableCallouts(tree) {
    walk(tree)
  }
}

function walk(node) {
  if (!node || typeof node !== 'object') return

  if (node.type === 'blockquote') convertCallout(node)

  if (Array.isArray(node.children)) {
    for (const child of node.children) walk(child)
  }
}

function convertCallout(node) {
  if (node.data?.hName) return

  const first = node.children?.[0]
  const markerNode = first?.type === 'paragraph' ? first.children?.[0] : null

  if (first?.type !== 'paragraph' || !Array.isArray(first.children)) return
  if (markerNode?.type !== 'text') return

  const match = markerNode.value.match(calloutPattern)
  if (!match) return

  const type = match[1]
  const foldable = typeof match[2] === 'string'
  const open = match[2] === '+'
  markerNode.value = markerNode.value.slice(match[0].length)
  if (markerNode.value.length === 0) first.children.shift()

  const split = splitAtFirstLineBreak(first.children)
  let titleChildren = split.before
  const bodyChildren = split.after

  if (inlineText(titleChildren).trim().length === 0) {
    titleChildren = [{type: 'text', value: foldable ? type : capitalizeType(type)}]
  }

  if (!foldable) {
    if (warningCalloutTypes.has(type.toLowerCase())) {
      titleChildren = [createWarningIcon(), ...titleChildren]
    }

    first.children = titleChildren
    first.data = {
      ...first.data,
      hName: 'p',
      hProperties: withClass(first.data?.hProperties, 'callout-title')
    }

    const body = []
    if (bodyChildren.length > 0) {
      body.push({type: 'paragraph', children: bodyChildren})
    }
    body.push(...node.children.slice(1))

    node.children = [first, {
      type: 'callout-body',
      children: body,
      data: {
        hName: 'div',
        hProperties: {className: ['callout-body']}
      }
    }]

    const existingProperties = node.data?.hProperties
    node.data = {
      ...node.data,
      hName: 'aside',
      hProperties: {
        ...withClass(existingProperties, 'callout'),
        'data-callout-type': type,
        role: 'note'
      }
    }
    return
  }

  first.children = titleChildren
  first.data = {...first.data, hName: 'summary'}

  if (bodyChildren.length > 0) {
    node.children.splice(1, 0, {type: 'paragraph', children: bodyChildren})
  }

  const existingProperties = node.data?.hProperties
  const existingClasses = Array.isArray(existingProperties?.className)
    ? existingProperties.className
    : existingProperties?.className
      ? [existingProperties.className]
      : []
  const hProperties = {
    ...existingProperties,
    className: [...new Set([...existingClasses, 'foldable-callout'])],
    'data-callout-type': type
  }

  if (open) hProperties.open = true
  else delete hProperties.open

  node.data = {
    ...node.data,
    hName: 'details',
    hProperties
  }
}

function capitalizeType(type) {
  return type.charAt(0).toUpperCase() + type.slice(1)
}

function createWarningIcon() {
  return {
    type: 'callout-icon',
    children: [{
      type: 'callout-icon-use',
      data: {
        hName: 'use',
        hProperties: {href: '/icons/heroicons.svg#warning'}
      }
    }],
    data: {
      hName: 'svg',
      hProperties: {
        className: ['article-icon'],
        viewBox: '0 0 24 24',
        'aria-hidden': 'true',
        focusable: 'false'
      }
    }
  }
}

function withClass(properties, className) {
  const existingClasses = Array.isArray(properties?.className)
    ? properties.className
    : properties?.className
      ? [properties.className]
      : []

  return {
    ...properties,
    className: [...new Set([...existingClasses, className])]
  }
}

function splitAtFirstLineBreak(children) {
  const before = []
  const after = []
  let found = false

  for (const child of children) {
    if (found) {
      after.push(child)
      continue
    }

    const split = splitInlineNode(child)
    before.push(...split.before)
    if (split.found) {
      found = true
      after.push(...split.after)
    }
  }

  return {before, after}
}

function splitInlineNode(node) {
  if (node.type === 'break') return {before: [], after: [], found: true}

  if (node.type === 'text') {
    const match = /\r?\n/.exec(node.value)
    if (!match) return {before: [node], after: [], found: false}

    const index = match.index
    const lineBreakEnd = index + match[0].length
    return {
      before: index > 0 ? [{...node, value: node.value.slice(0, index)}] : [],
      after: lineBreakEnd < node.value.length
        ? [{...node, value: node.value.slice(lineBreakEnd)}]
        : [],
      found: true
    }
  }

  if (!Array.isArray(node.children)) return {before: [node], after: [], found: false}

  const beforeChildren = []
  const afterChildren = []
  let found = false

  for (const child of node.children) {
    if (found) {
      afterChildren.push(child)
      continue
    }

    const split = splitInlineNode(child)
    beforeChildren.push(...split.before)
    if (split.found) {
      found = true
      afterChildren.push(...split.after)
    }
  }

  if (!found) return {before: [node], after: [], found: false}

  const before = beforeChildren.length
    ? [{...withoutPosition(node), children: beforeChildren}]
    : []
  const after = afterChildren.length
    ? [{...withoutPosition(node), children: afterChildren}]
    : []

  return {before, after, found: true}
}

function withoutPosition(node) {
  const copy = {...node}
  delete copy.position
  return copy
}

function inlineText(nodes) {
  let value = ''

  for (const node of nodes) {
    if (typeof node.value === 'string') value += node.value
    if (node.type === 'image' && typeof node.alt === 'string') value += node.alt
    if (Array.isArray(node.children)) value += inlineText(node.children)
  }

  return value
}
