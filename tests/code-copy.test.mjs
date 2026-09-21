import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { parseHTML } from "linkedom";

const source = readFileSync(new URL("../src/components/CodeCopy.astro", import.meta.url), "utf8");
const script = source.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
assert.ok(script, "CodeCopy script not found");

const { outputText } = ts.transpileModule(script, {
  compilerOptions: {
    module: ts.ModuleKind.None,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: "CodeCopy.astro",
});

function makeTimers() {
  let nextId = 1;
  const timers = new Map();

  return {
    clearTimeout(id) {
      timers.delete(id);
    },
    runAll() {
      for (const [id, callback] of timers) {
        timers.delete(id);
        callback();
      }
    },
    setTimeout(callback) {
      const id = nextId++;
      timers.set(id, callback);
      return id;
    },
  };
}

function fixture({ clipboard } = {}) {
  const window = parseHTML(`
    <main>
      <section class="prose">
        <pre id="direct"><code>  direct\n</code></pre>
        <details>
          <summary>Outer</summary>
          <details>
            <summary>Inner</summary>
            <pre id="nested"><code>nested\n</code></pre>
          </details>
        </details>
      </section>
      <pre id="outside"><code>outside\n</code></pre>
    </main>
  `);
  const timers = makeTimers();
  const navigator = { clipboard };
  // Linkedom's window proxies Node globals; do not replace its real timers.
  const browserWindow = {
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  };
  const context = vm.createContext({ document: window.document, navigator, window: browserWindow });

  vm.runInContext(outputText, context, { filename: "CodeCopy.astro", timeout: 1000 });
  return { document: window.document, timers };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function buttonFor(document, id) {
  return document.querySelector(`#${id}`).parentElement.querySelector("button");
}

test("adds one button to every prose code block, including closed nested details", () => {
  const { document } = fixture();
  const direct = document.querySelector("#direct");
  const nested = document.querySelector("#nested");
  const outside = document.querySelector("#outside");

  for (const pre of [direct, nested]) {
    assert.equal(pre.parentElement.dataset.codeCopy, "");
    assert.equal(pre.parentElement.querySelectorAll(":scope > button").length, 1);
  }
  assert.equal(outside.parentElement.tagName, "MAIN");
  assert.equal(outside.closest("[data-code-copy]"), null);
  assert.equal(outside.textContent, "outside\n");
});

test("page-load reinitialization is idempotent", () => {
  const { document } = fixture();
  const prose = document.querySelector(".prose");

  document.dispatchEvent(new document.defaultView.Event("astro:page-load"));

  assert.equal(prose.querySelectorAll("[data-code-copy]").length, 2);
  assert.equal(prose.querySelectorAll("[data-code-copy] > button").length, 2);
});

test("copies exact code text and resets success feedback", async () => {
  const copied = [];
  const { document, timers } = fixture({
    clipboard: { writeText: async (value) => copied.push(value) },
  });
  const code = document.querySelector("#direct code");
  code.textContent = '  <tag attr="&">\n  value\n</tag>  ';
  const button = buttonFor(document, "direct");

  button.click();
  await flushMicrotasks();

  assert.deepEqual(copied, [code.textContent]);
  assert.equal(button.dataset.state, "success");
  assert.equal(button.textContent.includes("Code copied."), false);
  assert.equal(button.parentElement.querySelector('[role="status"]').textContent, "Code copied.");
  assert.equal(button.disabled, false);

  timers.runAll();
  assert.equal(button.dataset.state, "idle");
  assert.equal(button.getAttribute("aria-label"), "Copy code");
  assert.equal(button.parentElement.querySelector('[role="status"]').textContent, "");
});

test("reports rejected and unavailable clipboard errors and re-enables the button", async () => {
  for (const clipboard of [
    { writeText: async () => { throw new Error("denied"); } },
    undefined,
  ]) {
    const { document } = fixture({ clipboard });
    const button = buttonFor(document, "direct");

    button.click();
    await flushMicrotasks();

    assert.equal(button.dataset.state, "error");
    assert.equal(button.getAttribute("aria-label"), "Copy failed. Try again.");
    assert.equal(button.parentElement.querySelector('[role="status"]').textContent, "Unable to copy code. Try again.");
    assert.equal(button.disabled, false);
  }
});
