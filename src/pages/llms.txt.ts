import { getCollection } from "astro:content";
import type { APIContext } from "astro";

type Entry = Awaited<ReturnType<typeof getCollection>>[number];

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const formatLink = (entry: Entry, url: string) => {
  const description = entry.data.description.trim().replace(/\s+/g, " ");
  return `- [${entry.data.title}](${url})${description ? `: ${description}` : ""}`;
};

export async function GET(context: APIContext): Promise<Response> {
  try {
    const site = context.site ?? new URL("https://sager611.github.io");
    const [pages, posts, projects] = await Promise.all([
      getCollection("pages", ({ data }) => !data.draft),
      getCollection("posts", ({ data }) => !data.draft),
      getCollection("projects", ({ data }) => !data.draft),
    ]);

    const about = pages.find((entry) => entry.id === "about");
    const writing = [...posts].sort((a, b) => {
      const dateOrder = (b.data.date?.getTime() ?? 0) - (a.data.date?.getTime() ?? 0);
      return dateOrder || compareStrings(a.id, b.id);
    });
    const work = [...projects].sort(
      (a, b) => compareStrings(a.data.title, b.data.title) || compareStrings(a.id, b.id),
    );
    const absolute = (path: string) => new URL(path, site).href;

    const lines = [
      "# Adrian Sager",
      "",
      "> Founder & Computational Scientist with an MSc from EPFL.",
      "",
      ...(about ? ["## About", "", formatLink(about, absolute("/about/")), ""] : []),
      "## Writing",
      "",
      ...writing.map((entry) => formatLink(entry, absolute(`/post/${entry.id}/`))),
      "",
      "## Projects",
      "",
      ...work.map((entry) => formatLink(entry, absolute(`/project/${entry.id}/`))),
      "",
      "## Optional",
      "",
      `- [RSS](${absolute("/rss.xml")})`,
      "",
    ];

    return new Response(lines.join("\n"), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (cause) {
    throw new Error("Unable to generate llms.txt from published content", { cause });
  }
}
