const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const TRACKER_URL = "https://publictransportation.tsomobile.com/rest/PubTrans/GetModuleInfoPublic";
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };
const ALLOWED_KEYS = new Set(["ROUTES_BYTKN", "UNITS_LOCATION_ROUTE", "STOPINFO_WITHOVERLAPS"]);

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

async function proxyTracker(reqUrl, res) {
  const key = reqUrl.searchParams.get("Key");
  if (!ALLOWED_KEYS.has(key)) return send(res, 400, JSON.stringify({ error: "Unsupported tracker request." }));

  const upstream = new URL(TRACKER_URL);
  for (const [name, value] of reqUrl.searchParams) upstream.searchParams.set(name, value);
  upstream.searchParams.set("callback", "x");
  upstream.searchParams.set("_", Date.now().toString());

  try {
    // The legacy service returns HTTP 500 to browsers and Node's HTTP client.
    // execFile passes the URL as a literal argument; no shell is involved.
    const { stdout: text } = await execFileAsync("curl", ["-L", "--fail", "--silent", "--show-error", "--max-time", "10", upstream.toString()], { maxBuffer: 5 * 1024 * 1024 });
    const match = text.match(/^x\((.*)\);?\s*$/s);
    if (!match) throw new Error("Unexpected upstream response");
    const payload = JSON.parse(match[1]);
    const data = typeof payload === "string" ? JSON.parse(payload) : payload;
    send(res, 200, JSON.stringify(data));
  } catch (error) {
    console.error("Tracker request failed:", error.message);
    send(res, 502, JSON.stringify({ error: "The City tracker did not respond. Try again shortly." }));
  }
}

function serveFile(reqUrl, res) {
  const requested = reqUrl.pathname === "/" ? "/index.html" : reqUrl.pathname;
  const file = path.join(ROOT, path.normalize(requested).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(ROOT)) return send(res, 403, "Forbidden", "text/plain");
  fs.readFile(file, (error, data) => {
    if (error) return send(res, 404, "Not found", "text/plain");
    send(res, 200, data, MIME[path.extname(file)] || "application/octet-stream");
  });
}

http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  if (reqUrl.pathname === "/api/tracker") return void proxyTracker(reqUrl, res);
  serveFile(reqUrl, res);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Biscayne Trolley Live: http://localhost:${PORT}`);
});
