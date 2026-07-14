import { describe, expect, it } from "vitest";
import { htmlToText } from "@/lib/connectors/http";
import { parseGithubRepo } from "@/lib/connectors/github";

describe("htmlToText", () => {
  it("strips tags, scripts, and styles", () => {
    const html = `<html><head><style>.a{color:red}</style><script>alert(1)</script></head>
      <body><h1>Title</h1><p>Hello <b>world</b> &amp; friends</p></body></html>`;
    const text = htmlToText(html);
    expect(text).toContain("Title");
    expect(text).toContain("Hello world & friends");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
  });

  it("decodes common entities", () => {
    expect(htmlToText("<p>a &lt;b&gt; &quot;c&quot; &#39;d&#39;</p>")).toBe(
      "a <b> \"c\" 'd'",
    );
  });
});

describe("parseGithubRepo", () => {
  it("extracts owner/repo from URLs", () => {
    expect(parseGithubRepo("https://github.com/vercel/next.js")).toEqual({
      owner: "vercel",
      repo: "next.js",
    });
    expect(parseGithubRepo("https://github.com/a/b.git")).toEqual({
      owner: "a",
      repo: "b",
    });
  });

  it("returns null for non-GitHub URLs", () => {
    expect(parseGithubRepo("https://example.com/foo")).toBeNull();
  });
});
