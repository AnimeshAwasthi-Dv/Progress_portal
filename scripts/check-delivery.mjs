import tls from "node:tls";

const site = new URL(process.argv[2] || "https://task.admindectrocel.online/");
let failed = false;
const check = (name, passed, value) => {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}: ${value}`);
  if (!passed) failed = true;
};
const get = (path) => fetch(new URL(path, site), {
  headers: { "Accept-Encoding": "gzip" }, signal: AbortSignal.timeout(15000),
});
const protocol = await new Promise((resolve, reject) => {
  const socket = tls.connect({ host: site.hostname, port: Number(site.port || 443),
    servername: site.hostname, ALPNProtocols: ["h2", "http/1.1"] });
  socket.setTimeout(15000, () => socket.destroy(new Error("TLS negotiation timed out")));
  socket.once("secureConnect", () => { resolve(socket.alpnProtocol); socket.destroy(); });
  socket.once("error", reject);
});
check("HTTP/2 negotiation", protocol === "h2", protocol || "none");
const home = await get("/");
const html = await home.text();
const script = html.match(/<script[^>]+src="([^\"]+\.js)"/i)?.[1];
if (!script || new URL(script, site).origin !== site.origin) throw new Error("Same-origin application bundle not found");
const bundle = await get(script);
const cache = bundle.headers.get("cache-control") || "none";
check("JavaScript compression", bundle.headers.get("content-encoding") === "gzip", bundle.headers.get("content-encoding") || "none");
check("Fingerprinted asset caching", cache.includes("immutable") && cache.includes("max-age=31536000"), cache);
await bundle.arrayBuffer();
const robots = await get("/robots.txt");
check("Plain-text robots.txt", robots.ok && robots.headers.get("content-type")?.includes("text/plain") && /^User-agent:/m.test(await robots.text()), robots.status);
check("Missing asset returns 404", (await get("/assets/missing-delivery-check.js")).status === 404, "missing asset request");
process.exitCode = failed ? 1 : 0;
