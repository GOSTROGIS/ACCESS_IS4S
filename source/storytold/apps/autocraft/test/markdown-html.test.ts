// Raw HTML in untrusted bodies: <img> and friends become Markdown nodes, and
// nothing else gets through.
import assert from "node:assert/strict";
import { test } from "node:test";
import { htmlBlock, inlineChildren, proxiedImage, safeUrl, type MdNode } from "../web/src/ui/markdownHtml.ts";

const ALLOWED = new Set(["paragraph", "text", "image", "link", "break", "strong", "emphasis", "inlineCode"]);
const IMG = "https://github.com/user-attachments/assets/52cc3f06-06ec-404f-94b5-74a9af1e1c7e";

function all(nodes: MdNode[]): MdNode[] {
  return nodes.flatMap((n) => [n, ...all(n.children ?? [])]);
}
const of = (nodes: MdNode[], type: string) => all(nodes).filter((n) => n.type === type);

test("an <img> in a block becomes a proxied image", () => {
  const out = htmlBlock(`<p align="center"><a href="${IMG}"><img width="1202" height="761" alt="Screen" src="${IMG}" onerror="alert(1)" /></a></p>`);
  const [img] = of(out, "image");
  assert.deepEqual(img, { type: "image", url: IMG, alt: "Screen", title: null });
  assert.equal(proxiedImage(safeUrl(img!.url!)), `/img?${new URLSearchParams({ u: IMG })}`);
  assert.ok(all(out).every((n) => ALLOWED.has(n.type)));
  assert.ok(!JSON.stringify(out).includes("onerror"));
});

test("no other HTML gets through", () => {
  const out = htmlBlock(`<div onclick="x()"><script>alert(1)</script><style>p{}</style><iframe src="https://evil.example"></iframe>
    <details><summary>More &amp; less</summary><span style="color:red">kept text</span><br><code>&lt;b&gt;</code></details></div>`);
  assert.ok(all(out).every((n) => ALLOWED.has(n.type)), JSON.stringify(out));
  const text = JSON.stringify(out);
  for (const bad of ["alert", "p{}", "evil", "onclick", "style"]) assert.ok(!text.includes(bad), bad);
  assert.ok(all(out).every((n) => Object.keys(n).every((k) => ["type", "value", "url", "alt", "title", "children"].includes(k))));
  assert.equal(of(out, "strong")[0]!.children![0]!.value, "More & less");
  assert.ok(of(out, "text").some((n) => n.value === "kept text"));
  assert.equal(of(out, "inlineCode")[0]!.value, "<b>");
});

test("a javascript: or foreign src stays a chip or link, never a proxied image", () => {
  for (const src of ["javascript:alert(1)", "https://evil.example/a.png", "http://github.com/user-attachments/assets/x", "data:image/png;base64,AAAA"]) {
    const [img] = of(htmlBlock(`<img src="${src}" alt="x">`), "image");
    assert.equal(proxiedImage(safeUrl(img!.url!)), null, src);
  }
  const [link] = of(htmlBlock(`<a href="javascript:alert(1)">click</a>`), "link");
  assert.equal(safeUrl(link!.url!), "");
});

test("inline tags inside a paragraph", () => {
  const kids = inlineChildren([
    { type: "text", value: "before " },
    { type: "html", value: `<img src="${IMG}" alt="a">` },
    { type: "html", value: "<br/>" },
    { type: "html", value: '<a href="https://example.com/x">' },
    { type: "text", value: "link text" },
    { type: "html", value: "</a>" },
    { type: "html", value: "<sub>" },
    { type: "text", value: " after" },
    { type: "html", value: "</sub>" },
  ]);
  assert.deepEqual(kids.map((k) => k.type), ["text", "image", "break", "link", "text"]);
  assert.equal(kids[3]!.children![0]!.value, "link text");
});

