import fs from "node:fs";
import path from "node:path";

const [gtfsDir, outputFile] = process.argv.slice(2);
if (!gtfsDir || !outputFile) throw new Error("Usage: node tools/extract-bus-stops.mjs GTFS_DIR OUTPUT_FILE");

function csv(text) {
  const rows = []; let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i += 1; } else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift();
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

const read = (name) => csv(fs.readFileSync(path.join(gtfsDir, name), "utf8"));
const routes = read("routes.txt").filter((route) => ["3", "9"].includes(route.route_short_name));
const routeById = new Map(routes.map((route) => [route.route_id, route.route_short_name]));
const trips = read("trips.txt").filter((trip) => routeById.has(trip.route_id));
const tripInfo = new Map(trips.map((trip) => [trip.trip_id, trip]));
const timesByTrip = new Map();
for (const time of read("stop_times.txt")) {
  if (!tripInfo.has(time.trip_id)) continue;
  if (!timesByTrip.has(time.trip_id)) timesByTrip.set(time.trip_id, []);
  timesByTrip.get(time.trip_id).push(time);
}
const stops = new Map(read("stops.txt").map((stop) => [stop.stop_id, stop]));
const groups = {};
for (const trip of trips) {
  const route = routeById.get(trip.route_id), direction = /DOWNTOWN/i.test(trip.trip_headsign) ? "south" : "north";
  const key = `${route}-${direction}`, times = timesByTrip.get(trip.trip_id) || [];
  if (!groups[key] || times.length > groups[key].times.length) groups[key] = { route, direction, headsign: trip.trip_headsign, times };
}
const result = { generatedFrom: "Miami-Dade GTFS 2026-07-31", routes: {} };
for (const group of Object.values(groups)) {
  const key = `${group.route}-${group.direction}`;
  result.routes[key] = {
    route: group.route, direction: group.direction, headsign: group.headsign,
    stops: group.times.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence)).map((time) => {
      const stop = stops.get(time.stop_id);
      return { id: time.stop_id, name: stop.stop_name, lat: Number(stop.stop_lat), lng: Number(stop.stop_lon), sequence: Number(time.stop_sequence) };
    }),
  };
}
fs.writeFileSync(outputFile, `window.MiamiBusStops = ${JSON.stringify(result)};\n`);
