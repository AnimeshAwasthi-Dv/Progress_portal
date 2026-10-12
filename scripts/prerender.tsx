import { readFile, readdir, writeFile } from "node:fs/promises";
import React from "react";
import { renderToString } from "react-dom/server";
import Entry from "../src/Entry";

const assets = await readdir("dist/assets");
const logo = assets.find((name) => /^logo-.*\.png$/.test(name));
if (!logo) throw new Error("Built company logo not found.");
const markup = renderToString(<Entry />).replaceAll(
  new URL("../images/logo.png", import.meta.url).href, `/assets/${logo}`,
);
let html = await readFile("dist/index.html", "utf8");
// The small compressed stylesheet is needed on every route. Inlining it removes
// a render-blocking round trip on first navigation (especially on mobile).
const stylesheet = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if (!stylesheet) throw new Error("Built stylesheet not found.");
const css = await readFile(`dist${stylesheet[1]}`, "utf8");
html = html.replace(stylesheet[0], `<style>${css.replaceAll("</style", "<\\/style")}</style>`);
await writeFile("dist/index.html", html.replace('<div id="root"></div>', `<div id="root">${markup}</div>`));
