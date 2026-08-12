#!/usr/bin/env node
/* ALKAHEST -- build: fold the game into one boot-anywhere HTML file.
 *
 * Reads index.html (the single source of truth for module order + chrome) and
 * inlines every <script src="src/..."> as a literal <script> block, emitting
 * dist/alkahest.html -- a zero-dependency file:// double-click build, rebuilt
 * every milestone per the STACK contract.
 *
 * Usage: node scripts/build.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const SRC_RE = /<script src="(src\/[^"]+)"><\/script>/g;
const inlined = [];

const out = html.replace(SRC_RE, function (_m, rel) {
  const code = fs.readFileSync(path.join(root, rel), "utf8");
  inlined.push(rel);
  // guard against an accidental </script> in source closing the tag early
  const safe = code.replace(/<\/script>/g, "<\\/script>");
  return "<script>\n/* " + rel + " */\n" + safe + "\n</script>";
});

if (inlined.length === 0) throw new Error("build: no src scripts inlined -- index.html changed?");
if (/<script src="src\//.test(out)) throw new Error("build: external src refs remain after inlining");

const distDir = path.join(root, "dist");
fs.mkdirSync(distDir, { recursive: true });
const dest = path.join(distDir, "alkahest.html");
fs.writeFileSync(dest, out);

console.log("built " + path.relative(process.cwd(), dest) +
  " (" + inlined.length + " modules, " + (out.length / 1024).toFixed(1) + " KB)");
console.log("  inlined: " + inlined.join(", "));
