import assert from "node:assert/strict";
import test from "node:test";
import {
  getTagHref,
  getTaggedEntries,
  getTagSlug,
  getUniqueTags,
  normalizeTag,
} from "../src/lib/tags.mjs";

test("normalizes and deduplicates tag labels", () => {
  assert.equal(normalizeTag("  AI\u00a0  systems\n"), "AI systems");
  assert.deepEqual(
    getUniqueTags(["  AI\u00a0 systems ", "ai systems", "", "   ", "ＡＩ systems", "C++"]),
    ["AI systems", "C++"],
  );
});

test("creates readable slugs and archive hrefs", () => {
  assert.equal(getTagSlug("  Applied   AI 2 "), "applied-ai-2");
  assert.equal(getTagHref("Applied AI 2"), "/tags/applied-ai-2/");
  assert.throws(() => getTagSlug(" \t\n "), /blank/);
});

test("keeps special-character and Unicode slugs safe and distinct", () => {
  const labels = ["C++", "C#", "AI/ML", "foo-bar", "foo bar", "café"];
  const slugs = labels.map(getTagSlug);

  assert.equal(new Set(slugs).size, labels.length);
  assert.ok(slugs.filter((_, index) => labels[index] !== "foo bar").every((slug) => slug.startsWith("~")));
  assert.notEqual(getTagSlug("C++"), getTagSlug("C#"));
  assert.notEqual(getTagSlug("foo-bar"), getTagSlug("foo bar"));
  assert.equal(getTagSlug("CAFÉ"), getTagSlug("café"));
});

test("matches published posts and projects without duplicate entries", () => {
  const post = { collection: "posts", id: "post", data: { tags: ["AI", " ai ", "Systems"], draft: false } };
  const project = { collection: "projects", id: "project", data: { tags: ["systems"], draft: false } };
  const draft = { collection: "posts", id: "draft", data: { tags: ["AI"], draft: true } };
  const page = { collection: "pages", id: "page", data: { tags: ["AI"], draft: false } };
  const entries = [post, project, draft, page];

  assert.deepEqual(getTaggedEntries(entries, "  SYSTEMS "), [post, project]);
  assert.deepEqual(getTaggedEntries(entries, "AI"), [post]);
  assert.deepEqual(getTaggedEntries(entries, "missing"), []);
  assert.deepEqual(getTaggedEntries(entries, "   "), []);
});
