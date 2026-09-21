import { Buffer } from "node:buffer";

/**
 * @typedef {object} TagEntry
 * @property {string} collection
 * @property {string} id
 * @property {{tags?: readonly string[], draft?: boolean}} data
 */

/**
 * Normalize a tag label without changing its display casing.
 *
 * @param {string} tag
 * @returns {string}
 */
export function normalizeTag(tag) {
  return tag.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

/**
 * Return the first normalized spelling of each case-insensitive tag.
 *
 * @param {readonly string[]} tags
 * @returns {string[]}
 */
export function getUniqueTags(tags) {
  const seen = new Set();
  const uniqueTags = [];

  for (const tag of tags) {
    const normalizedTag = normalizeTag(tag);
    const key = normalizedTag.toLowerCase();

    if (key === "" || seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueTags.push(normalizedTag);
  }

  return uniqueTags;
}

/**
 * Build a stable, collision-resistant archive slug for a tag.
 *
 * @param {string} tag
 * @returns {string}
 */
export function getTagSlug(tag) {
  const key = normalizeTag(tag).toLowerCase();

  if (key === "") {
    throw new Error("Tag cannot be blank");
  }

  if (/^[a-z0-9]+(?: [a-z0-9]+)*$/.test(key)) {
    return key.replaceAll(" ", "-");
  }

  return `~${Buffer.from(key, "utf8").toString("base64url")}`;
}

/**
 * Build the trailing-slash URL for a tag archive.
 *
 * @param {string} tag
 * @returns {string}
 */
export function getTagHref(tag) {
  return `/tags/${getTagSlug(tag)}/`;
}

/**
 * Return published post and project entries carrying a tag.
 *
 * @template {TagEntry} Entry
 * @param {readonly Entry[]} entries
 * @param {string} tag
 * @returns {Entry[]}
 */
export function getTaggedEntries(entries, tag) {
  const key = normalizeTag(tag).toLowerCase();

  if (key === "") {
    return [];
  }

  return entries.filter((entry) => {
    if (entry.collection !== "posts" && entry.collection !== "projects") {
      return false;
    }

    if (entry.data.draft) {
      return false;
    }

    return (entry.data.tags ?? []).some((entryTag) => normalizeTag(entryTag).toLowerCase() === key);
  });
}
