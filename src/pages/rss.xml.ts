import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";

export async function GET(context: APIContext) {
  const posts = (await getCollection("posts", ({ data }) => !data.draft)).sort(
    (a, b) => (b.data.date?.getTime() ?? 0) - (a.data.date?.getTime() ?? 0),
  );

  return rss({
    title: "Adrian Sager — Writing",
    description: "Notes from Adrian Sager on applied AI, software, systems, and the things worth learning.",
    site: context.site ?? "https://sager611.github.io",
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description || "A note from Adrian Sager.",
      link: `/post/${post.id}/`,
      pubDate: post.data.date ?? new Date(),
    })),
  });
}
