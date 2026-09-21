# Personal website

Astro site content is recovered from the original static HTML preserved in Git history; no Markdown source was available. The migration keeps authored project and profile prose in Markdown and keeps legacy URL-compatible assets in `public/`.

## Local commands

```sh
npm install
npm run dev -- --port 4322       # http://localhost:4322
npm run check
npm run build
```

The dev server uses 127.0.0.1 and port 4322 for this site; Astro's default is 4321. Run `npm run preview` after a build when you want to inspect the production output.

## Content

- `src/content/posts/` — blog posts
- `src/content/projects/` — project pages
- `src/content/pages/` — standalone pages such as About

Content frontmatter is intentionally portable YAML: use `title`, `description`, an optional ISO `date`, a `tags` list, and optional `draft`. Keep links as normal Markdown links (for example `[text](https://example.com)`), not Obsidian `[[wikilinks]]`.

Frontmatter `tags` create shared cross-post/project archives: published posts and projects with the same tag appear together. `description` remains metadata for cards, feeds, and document metadata; it is not body content.

The dedicated `src/content/` folder can be opened in Obsidian as its own folder; do not open it as a private vault or add private-vault metadata. Legacy files needed by migrated content live at root-relative paths under `public/`, including `/media/`, `/uploads/`, `/project/`, `/post/`, `/author/`, and `/bib/`. Use those public paths for migrated assets. New content-local relative assets may be used when the Astro content pipeline supports them; keep the link relative to the Markdown file and verify with `npm run check` and a production build.

This repository does not configure automatic content syncing or a newsletter. Pushes to `main` deploy automatically through GitHub Actions; see GitHub Pages deployment below.

## Callouts

Unsigned callouts are static and remain visible. Titles are optional and can use rich Markdown such as emphasis, links, and inline math:

````md
> [!note] **A rich title** with [a link](https://example.com)
> Always visible.
````

Obsidian foldable callouts use `-` for closed and `+` for open summaries:

````md
> [!note]- Closed summary
> Hidden until opened.

> [!note]+ Open summary
> Visible by default.
````

Static and foldable callouts can contain multiple Markdown blocks, including math and fenced code:

````md
> [!note]- Details
>
> $$
> x^2 + y^2 = z^2
> $$
>
> ```js
> console.log('syntax colors follow the fenced language')
> ```
````

The rendered `<summary>` is a native disclosure control with keyboard support (focus it, then press `Enter` or `Space`). Code syntax colors come from the language on the fenced code block, not from the callout type.

## Local SVG icons

Reuse a decorative symbol from the local Heroicons sprite in article prose:

````html
<svg class="article-icon" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <use href="/icons/heroicons.svg#move"></use>
</svg>
````

Replace `#move` with another symbol ID from `/icons/heroicons.svg` as needed.

## GitHub Pages deployment

In `Sager611/Sager611.github.io`, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions** (not the legacy `main` branch source). The workflow is `.github/workflows/deploy.yml`.

Once enabled and merged, each push to `main` runs Node.js 24 with `npm ci`, `npm test`, `npm run check`, and `npm run build`, then deploys `dist/` through the official GitHub Pages actions. You can also run **Deploy GitHub Pages** manually from the Actions tab. The deploy job uses the `github-pages` environment and reports the deployment URL.

The configured destination is <https://sager611.github.io/> at the domain root; no custom domain is configured. Adding this workflow does not itself enable the Pages source or confirm a successful deployment: verify the first Actions run and its published URL. Content must still be committed and pushed; this is not an Obsidian/content-sync integration.
