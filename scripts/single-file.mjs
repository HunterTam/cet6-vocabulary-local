import { readFile, writeFile } from "node:fs/promises";

const dist = new URL("../dist/", import.meta.url);
let html = await readFile(new URL("index.html",dist),"utf8");
const scripts = Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>/g));
const styles = Array.from(html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g));
if (scripts.length !== 1 || styles.length !== 1) throw new Error("Expected one JavaScript bundle and one stylesheet.");
for (const [tag,path] of scripts) {
  const js = await readFile(new URL(path.replace(/^\//,""),dist),"utf8");
  html = html.replace(tag,()=>"<script type=\"module\">"+js.replace(/<\/script/gi,"<\\/script")+"</script>");
}
for (const [tag,path] of styles) {
  const css = await readFile(new URL(path.replace(/^\//,""),dist),"utf8");
  html = html.replace(tag,()=>"<style>"+css.replace(/<\/style/gi,"<\\/style")+"</style>");
}
await writeFile(new URL("study.html",dist),html);
