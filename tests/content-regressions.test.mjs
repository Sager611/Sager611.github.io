import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkMath from 'remark-math'

const markdownPath = new URL('../src/content/projects/epfl-master-thesis.md', import.meta.url)
const markdown = fs.readFileSync(markdownPath, 'utf8')
const tree = unified().use(remarkParse).use(remarkMath).parse(markdown)

const expectedWhyNotSumMath = String.raw`\max_{y\in\mathcal{C}_\text{sust}} p(y\vert\pmb{x},\mathcal{D}) \leq p(\cup_{\mathcal{C}_\text{sust}}y\vert \pmb{x},\mathcal{D}) \leq \sum_{y\in\mathcal{C}_\text{sust}} p(y\vert\pmb{x},\mathcal{D})`

function isWhyNotSumCallout(node) {
  return node.type === 'blockquote' && node.children?.some((child) =>
    child.type === 'paragraph' && child.children?.some((inline) =>
      inline.type === 'text' && inline.value.includes('[!note]- Why not sum over')
    )
  )
}

test('preserves the Why-not-sum display math inside its fold', () => {
  const callout = tree.children.find(isWhyNotSumCallout)

  assert.ok(callout, 'Why-not-sum fold is present')
  const displayMath = callout.children.filter((child) => child.type === 'math')

  assert.equal(displayMath.length, 1, 'Why-not-sum fold has one display-math node')
  assert.equal(displayMath[0].value, expectedWhyNotSumMath)
  assert.ok(callout.children.includes(displayMath[0]), 'display math remains inside the fold')
})
