import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const workflowPath = new URL('../.github/workflows/deploy.yml', import.meta.url)
const readmePath = new URL('../README.md', import.meta.url)
const workflow = fs.readFileSync(workflowPath, 'utf8')
const readme = fs.readFileSync(readmePath, 'utf8')

function lineIndex(source, needle) {
  const index = source.indexOf(needle)
  assert.notEqual(index, -1, `missing ${needle}`)
  return source.slice(0, index).split('\n').length
}

test('blocks every reported dependency severity before tests and build', () => {
  const installLine = lineIndex(workflow, 'run: npm ci')
  const auditLine = lineIndex(workflow, 'run: npm audit --audit-level=info --include=dev')
  const testLine = lineIndex(workflow, 'run: npm test')
  const checkLine = lineIndex(workflow, 'run: npm run check')
  const buildLine = lineIndex(workflow, 'run: npm run build')

  assert.ok(installLine < auditLine, 'audit follows npm ci')
  assert.ok(auditLine < testLine, 'audit runs before tests')
  assert.ok(auditLine < checkLine, 'audit runs before checks')
  assert.ok(auditLine < buildLine, 'audit runs before build')
  assert.match(workflow, /run: npm audit --audit-level=info --include=dev/)
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/)
  assert.doesNotMatch(workflow, /\|\|\s*true/)
  assert.doesNotMatch(workflow, /npm audit(?![^\n]*--include=dev)/)
})

test('keeps deploy gated by build success and preserves manual push triggers', () => {
  assert.match(workflow, /deploy:\n\s+needs: build\n/)
  assert.match(workflow, /on:\n\s+push:\n\s+branches: \[main\]\n\s+workflow_dispatch:/)
  assert.match(workflow, /permissions:\n\s+contents: read\n/)
  assert.match(workflow, /concurrency:\n\s+group: github-pages\n\s+cancel-in-progress: false/)
  assert.match(readme, /The workflow is `\.github\/workflows\/deploy\.yml`\./)
  assert.match(readme, /blocking dependency audit \(`npm audit --audit-level=info --include=dev`\)/)
  assert.match(readme, /Any reported vulnerability, including in dev or build-time dependencies, blocks a new deploy; audit service failures block new deploys too, but they do not affect the last published site\./)
})
