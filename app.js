/* Transit data only. The single rider interface lives in go.js. */
const ROUTE_ID = "71276";
const BUS_STOPS = TransitEngine.busStopsForCorridor(window.MiamiBusStops?.routes);
const state = { refreshing: false, vehicles: [], buses: [], stops: window.MiamiTrolleyStops?.stops || [], locations: [], lastError: "", trolleyStatus: "loading", trolleyCheckedAt: null };
const serviceName = service => service === "trolley" ? "Trolley" : service === "bus-3" ? "Bus 3" : "Bus 9";
const locationServices = location => location.services.map(serviceName).join(" · ");
function friendlyStopName(value) {
  return String(value || "Transit stop").trim().replace(/\s+/g, " ").replace(/\s*\((SB|NB)\)\s*$/i, "").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\b(Ne|Nw|Se|Sw|Sb|Nb)\b/g, (word) => word.toUpperCase())
    .replace(/\bBd\b/g, "Blvd").replace(/\bAv\b/g, "Ave");
}

function locationDirection(location) {
  const directions = [...new Set(location.members.map((member) => member.direction).filter(Boolean))];
  if (directions.length > 1) return "Both directions";
  return directions[0] ? `${directions[0][0].toUpperCase()}${directions[0].slice(1)}bound` : "Saved place";
}


function buildLocations() {
  const minLat = TransitEngine.PLACES.brickell.lat - .004, maxLat = TransitEngine.PLACES.home.lat + .004;
  const trolleyStops = TransitEngine.normalizeStops(state.stops).filter((stop) => stop.lat >= minLat && stop.lat <= maxLat);
  const locations = TransitEngine.mergeTransitLocations(trolleyStops, BUS_STOPS).map((location) => ({ ...location, placeKeys: [] }));

  Object.entries(TransitEngine.PLACES).forEach(([key, place]) => {
    const closest = locations.map((location) => ({ location, distance: TransitEngine.haversineMiles(place, location) })).sort((a, b) => a.distance - b.distance)[0];
    if (closest && closest.distance <= .2) closest.location.placeKeys.push(key);
    else locations.push({ id: `place-${key}`, lat: place.lat, lng: place.lng, members: [], services: [], placeKeys: [key] });
  });

  state.locations = locations.map((location) => {
    const place = location.placeKeys.length ? TransitEngine.PLACES[location.placeKeys[0]] : null;
    const namedMember = location.members.find((member) => member.service === "trolley") || location.members[0];
    return {
      ...location,
      name: place?.name || friendlyStopName(namedMember?.name),
      detail: place ? `${place.detail} · ${locationServices(location)}` : `${locationDirection(location)} · ${locationServices(location)}`,
    };
  }).sort((a, b) => b.lat - a.lat || a.lng - b.lng);

}


async function requestData(url) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), url.includes("/api/tracker") ? 22000 : 12000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error("Live transit data is temporarily unavailable.");
    return await response.json();
  } finally { window.clearTimeout(timeout); }
}
async function loadStops() {
  try {
    const query = new URLSearchParams({ Key: "ROUTES_BYTKN", id: "-1", f1: "81E39EC9-D773-447E-BE29-D7F30AB177BC", f2: "", f3: "", lan: "en" });
    const data = await requestData("/api/tracker?" + query);
    const stops = Array.isArray(data?.[1]) ? data[1].filter(stop => stop && String(stop.RouteID) === ROUTE_ID) : [];
    if (TransitEngine.normalizeStops(stops).length) { state.stops = stops; buildLocations(); }
  } catch { /* Bundled stops keep selection available during outages. */ }
  window.dispatchEvent(new Event("transit-data"));
}
async function refreshVehicles() {
  if (state.refreshing) return;
  state.refreshing = true;
  window.dispatchEvent(new Event("transit-data"));
  try {
    const results = await Promise.allSettled([
      requestData("/api/tracker?Key=UNITS_LOCATION_ROUTE&id=" + ROUTE_ID + "&lan=en"),
      ...["3", "9"].flatMap(route => ["south", "north"].map(direction => requestData("/api/bus?route=" + route + "&direction=" + direction))),
    ]);
    const [vehicles, ...buses] = results;
    if (vehicles.status === "fulfilled" && Array.isArray(vehicles.value)) {
      state.vehicles = vehicles.value.filter(vehicle => vehicle && [vehicle.Lat, vehicle.Lng, vehicle.Tim, vehicle.Hea].every(value => value != null && value !== "" && Number.isFinite(Number(value))) && Number(vehicle.Lat) >= 25.6 && Number(vehicle.Lat) <= 26 && Number(vehicle.Lng) >= -80.4 && Number(vehicle.Lng) <= -80 && (vehicle.RouteID == null || String(vehicle.RouteID) === ROUTE_ID));
      state.trolleyStatus = "ready";
      state.trolleyCheckedAt = Date.now();
    } else state.trolleyStatus = "unavailable";
    state.buses = buses.filter(result => result.status === "fulfilled" && Array.isArray(result.value?.minutes)).map(({ value }) => ({ ...value, minutes: value.minutes.filter(minute => (typeof minute === "number" || (typeof minute === "string" && minute.trim() !== "")) && Number.isFinite(Number(minute)) && Number(minute) >= 0 && Number(minute) <= 240).map(Number).sort((a, b) => a - b) }));
    state.lastError = results.some(result => result.status === "rejected") ? "Some live feeds are unavailable. Estimates and saved stops remain available." : "";
  } finally {
    state.refreshing = false;
    window.dispatchEvent(new Event("transit-data"));
  }
}
buildLocations();
loadStops();
refreshVehicles();
window.setInterval(() => { if (!document.hidden) refreshVehicles(); }, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshVehicles(); });
