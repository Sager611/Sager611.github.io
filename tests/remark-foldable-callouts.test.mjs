import assert from 'node:assert/strict'
import test from 'node:test'
import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import remarkFoldableCallouts from '../src/plugins/remark-foldable-callouts.mjs'

const processor = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(remarkFoldableCallouts)
  .use(remarkRehype)
  .use(rehypeStringify)

function render(markdown) {
  return String(processor.processSync(markdown))
}

test('renders closed and open callouts with stable metadata', () => {
  const closed = render('> [!note]- Proof\n> Body.')
  const open = render('> [!warning]+ Warning\n> Body.')

  assert.match(closed, /^<details class="foldable-callout" data-callout-type="note">/)
  assert.match(closed, /<summary>Proof<\/summary>\s*<p>Body\.<\/p>/)
  assert.doesNotMatch(closed, / open[> ]/)
  assert.match(open, /^<details class="foldable-callout" data-callout-type="warning" open>/)
  assert.match(open, /<summary>Warning<\/summary>\s*<p>Body\.<\/p>/)
})

test('renders unsigned notes as static asides', () => {
  const html = render('> [!note]\n> Body.')

  assert.match(html, /^<aside class="callout" data-callout-type="note" role="note">/)
  assert.match(html, /<p class="callout-title">Note<\/p>\s*<div class="callout-body"><p>Body\.<\/p><\/div>/)
  assert.doesNotMatch(html, /<details>/)
})

test('renders warning titles with the default or custom text and sprite icon', () => {
  const defaultTitle = render('> [!warning]\n> Body.')
  const customTitle = render('> [!warning] Custom warning\n> Body.')
  const icon = '<svg class="article-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="/icons/heroicons.svg#warning"></use></svg>'

  assert.match(defaultTitle, new RegExp(`<p class="callout-title">${icon}Warning<\\/p>`))
  assert.match(customTitle, new RegExp(`<p class="callout-title">${icon}Custom warning<\\/p>`))
})

test('keeps an adjacent first body line out of the summary', () => {
  const html = render('> [!note]- Proof\n> The first body line.\n>\n> More body.')

  assert.match(html, /<summary>Proof<\/summary>\s*<p>The first body line\.<\/p>\s*<p>More body\.<\/p>/)
  assert.doesNotMatch(html, /<summary>[^<]*The first body line/)
})

test('preserves rich inline summary content', () => {
  const html = render('> [!note]+ *Proof* with [a link](https://example.test) and $x$\n> Body.')

  assert.match(
    html,
    /<summary><em>Proof<\/em> with <a href="https:\/\/example\.test">a link<\/a> and <code class="language-math math-inline">x<\/code><\/summary>/
  )
})

test('preserves rich inline title and body markdown', () => {
  const html = render('> [!note]- **Proof** with $x$ and `code`\n> Body with *emphasis*, $y$, and `inline`.')

  assert.match(
    html,
    /<summary><strong>Proof<\/strong> with <code class="language-math math-inline">x<\/code> and <code>code<\/code><\/summary>/
  )
  assert.match(
    html,
    /<p>Body with <em>emphasis<\/em>, <code class="language-math math-inline">y<\/code>, and <code>inline<\/code>\.<\/p>/
  )
})

test('preserves body markdown, fenced code, and display math', () => {
  const html = render('> [!note]- Details\n>\n> ## Heading\n>\n> - item\n>\n> ```js\n> code()\n> ```\n>\n> $$\n> x^2\n> $$')

  assert.match(html, /<h2>Heading<\/h2>\s*<ul>\s*<li>item<\/li>\s*<\/ul>/)
  assert.match(html, /<pre><code class="language-js">code\(\)\n<\/code><\/pre>/)
  assert.match(html, /<pre><code class="language-math math-display">x\^2<\/code><\/pre>/)
})

test('converts nested static and signed folds without changing their nesting', () => {
  const html = render('> [!note]- Outer\n>\n> Outer text\n>\n> > [!tip]+ Inner\n> > Inner text')

  assert.match(
    html,
    /<details class="foldable-callout" data-callout-type="note">[\s\S]*<summary>Outer<\/summary>[\s\S]*<details class="foldable-callout" data-callout-type="tip" open>[\s\S]*<summary>Inner<\/summary>\s*<p>Inner text<\/p>\s*<\/details>[\s\S]*<\/details>/
  )
})

test('leaves ordinary quotes and literal markers untouched', () => {
  const ordinary = render('> An ordinary quote\n> still a quote')
  const literal = render('> ```md\n> [!note]- Literal\n> ```')

  assert.match(ordinary, /^<blockquote>/)
  assert.doesNotMatch(ordinary, /<details>/)
  assert.match(literal, /<blockquote>[\s\S]*<pre><code class="language-md">\[!note\]- Literal\n<\/code><\/pre>[\s\S]*<\/blockquote>/)
  assert.doesNotMatch(literal, /<details>/)
})

test('uses the callout type when the title is empty', () => {
  assert.match(render('> [!tip]-\n> Body.'), /<summary>tip<\/summary>\s*<p>Body\.<\/p>/)
})
