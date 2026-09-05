const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const TRACKER_URL = "https://publictransportation.tsomobile.com/rest/PubTrans/GetModuleInfoPublic";
const MIME = { ".png": "image/png", ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };
const BUS_STOPS = { "3": { south: "6706", north: "103" }, "9": { south: "6774", north: "6635" } };
const PUBLIC_FILES = new Set(["index.html", "styles.css", "engine.js", "app.js", "go.js", "go.css", "bus-stops.js", "trolley-stops.js", "vendor/leaflet.css", "vendor/leaflet.js"]);
const responseCache = new Map();
PUBLIC_FILES.add("assets/brand/miami-transit-after-hours.png");
const inFlight = new Map();

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY" });
  res.end(body);
}

async function cachedCurl(key, args, ttl = 15_000) {
  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.time < (cached.error ? 1000 : ttl)) {
    if (cached.error) throw new Error(cached.error);
    return cached.text;
  }
  if (inFlight.has(key)) return inFlight.get(key);
  const request = execFileAsync("curl", args, { maxBuffer: 5 * 1024 * 1024 }).then(({ stdout }) => {
    responseCache.set(key, { time: Date.now(), text: stdout });
    return stdout;
  }).catch((error) => {
    responseCache.set(key, { time: Date.now(), error: error.message });
    throw error;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

async function proxyTracker(reqUrl, res) {
  const key = reqUrl.searchParams.get("Key");
  if (!new Set(["ROUTES_BYTKN", "UNITS_LOCATION_ROUTE"]).has(key)) return send(res, 400, JSON.stringify({ error: "Unsupported tracker request." }));

  const upstream = new URL(TRACKER_URL);
  if (key === "ROUTES_BYTKN") {
    upstream.searchParams.set("Key", key); upstream.searchParams.set("id", "-1"); upstream.searchParams.set("f1", "81E39EC9-D773-447E-BE29-D7F30AB177BC"); upstream.searchParams.set("f2", ""); upstream.searchParams.set("f3", ""); upstream.searchParams.set("lan", "en");
  } else {
    upstream.searchParams.set("Key", key); upstream.searchParams.set("id", "71276"); upstream.searchParams.set("lan", "en");
  }
  upstream.searchParams.set("callback", "x");
  upstream.searchParams.set("_", Date.now().toString());

  try {
    // The legacy service returns HTTP 500 to browsers and Node's HTTP client.
    // execFile passes the URL as a literal argument; no shell is involved.
    const text = await cachedCurl(`tracker:${key}`, ["--proto", "=https", "--proto-redir", "=https", "-L", "--fail", "--silent", "--show-error", "--max-time", "8", "--retry", "1", "--retry-delay", "1", "--retry-max-time", "18", "--max-filesize", "5242880", upstream.toString()]);
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

async function proxyBus(reqUrl, res) {
  const route = reqUrl.searchParams.get("route");
  const direction = reqUrl.searchParams.get("direction");
  const stop = BUS_STOPS[route]?.[direction];
  if (!stop) return send(res, 400, JSON.stringify({ error: "Unsupported bus request." }));
  const upstream = `https://transitbustime.miamidade.gov/bustime/wireless/html/eta.jsp?direction=MetroBus%3A${direction.toUpperCase()}BOUND&id=MetroBus%3A${stop}&route=MetroBus%3A${route}&showAllBusses=off`;
  try {
    const html = await cachedCurl(`bus:${route}:${direction}`, ["--proto", "=https", "--proto-redir", "=https", "-L", "--fail", "--silent", "--show-error", "--max-time", "10", "--max-filesize", "1048576", upstream], 20_000);
    const minutes = [...html.matchAll(/<strong class="larger">\s*(\d+)(?:&nbsp;|\s)*MIN/gi)].map((match) => Number(match[1]));
    send(res, 200, JSON.stringify({ route, stop, direction, minutes, source: "Miami-Dade BusTime" }));
  } catch (error) {
    send(res, 502, JSON.stringify({ error: "Miami-Dade bus arrivals are unavailable." }));
  }
}

async function proxyBusPositions(res) {
  // Fixed public County query: no user-supplied URL, SQL, or fields.
  const query = new URLSearchParams({ f: "json", where: "RouteID IN (3,9)", outFields: "BusID,BusName,RouteID,Latitude,Longitude,BusTimeStampUTC,DirectionName,TripHeadsign", returnGeometry: "false" });
  try {
    const url = "https://gis.miamidade.gov/arcgis/rest/services/BusMetro_RealTime/BusRealTime/MapServer/0/query?" + query;
    const raw = await cachedCurl("bus-positions", ["--proto", "=https", "--proto-redir", "=https", "-L", "--fail", "--silent", "--show-error", "--max-time", "10", "--max-filesize", "1048576", url], 20_000);
    const data = JSON.parse(raw);
    if (!Array.isArray(data.features) || data.error || data.exceededTransferLimit) throw new Error("Invalid bus positions");
    send(res, 200, JSON.stringify(data));
  } catch { send(res, 502, JSON.stringify({ error: "County bus positions unavailable" })); }
}

function serveFile(reqUrl, res) {
  const requested = reqUrl.pathname === "/" ? "index.html" : reqUrl.pathname.replace(/^\/+/, "");
  if (!PUBLIC_FILES.has(requested)) return send(res, 404, "Not found", "text/plain");
  const file = path.join(ROOT, requested);
  fs.readFile(file, (error, data) => {
    if (error) return send(res, 404, "Not found", "text/plain");
    send(res, 200, data, MIME[path.extname(file)] || "application/octet-stream");
  });
}

http.createServer((req, res) => {
  let reqUrl;
  try { reqUrl = new URL(req.url, "http://127.0.0.1"); }
  catch { return send(res, 400, "Bad request", "text/plain"); }
  if (reqUrl.pathname === "/api/tracker") return void proxyTracker(reqUrl, res);
  if (reqUrl.pathname === "/api/bus") return void proxyBus(reqUrl, res);
  if (reqUrl.pathname === "/api/bus-positions") return void proxyBusPositions(res);
  serveFile(reqUrl, res);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Miami Transit Board: http://localhost:${PORT}`);
});
