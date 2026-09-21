import { defineConfig } from 'astro/config';
import rehypeMathjax from 'rehype-mathjax/svg';
import remarkMath from 'remark-math';
import remarkFoldableCallouts from './src/plugins/remark-foldable-callouts.mjs';

export default defineConfig({
  output: 'static',
  devToolbar: { enabled: false },
  site: 'https://sager611.github.io',
  trailingSlash: 'always',
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      defaultColor: false,
    },
    remarkPlugins: [remarkMath, remarkFoldableCallouts],
    rehypePlugins: [rehypeMathjax],
  },
});
