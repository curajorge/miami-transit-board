(function (root, factory) {
  const engine = factory();
  if (typeof module === "object" && module.exports) module.exports = engine;
  else root.TransitEngine = engine;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PLACES = {
    home: { name: "Whole Foods", detail: "Edgewater", lat: 25.8043, lng: -80.1917, south: "920851", north: "921033" },
    downtown: { name: "Downtown", detail: "Bayfront", lat: 25.7732, lng: -80.1875, south: "920869", north: "921016" },
    brickell: { name: "Brickell", detail: "Metromover", lat: 25.7633, lng: -80.1930, south: "920876", north: "921010" },
  };
  const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60000);
  const roundMinute = (date) => new Date(Math.round(date.getTime() / 60000) * 60000);

  function haversineMiles(a, b) {
    const rad = (n) => n * Math.PI / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 3958.8 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function normalizeStops(rawStops) {
    return rawStops.map((stop) => {
      const match = String(stop.StopNumber || "").match(/^(\d+)/);
      return { id: String(stop.ID), name: stop.Name, label: stop.StopNumber || stop.Name, lat: Number(stop.Latitude), lng: Number(stop.Longitude), sequence: match ? Number(match[1]) : 0 };
    }).filter((stop) => stop.id && stop.sequence && Number.isFinite(stop.lat));
  }
  function basePoint(value, stops) {
    if (value.startsWith("place:")) return PLACES[value.slice(6)];
    return stops.find((item) => item.id === value.replace("stop:", ""));
  }
  function endpoint(value, stops, direction) {
    if (value.startsWith("place:")) {
      const key = value.slice(6), place = PLACES[key], stop = stops.find((item) => item.id === place[direction]);
      return { ...place, key, value, stop, displayName: place.name };
    }
    const stop = stops.find((item) => item.id === value.replace("stop:", ""));
    return { name: stop?.name || "Selected stop", detail: stop?.label || "", lat: stop?.lat, lng: stop?.lng, stop, value, displayName: stop?.name || "Selected stop" };
  }
  function nextBusWait(now) {
    const minute = now.getHours() * 60 + now.getMinutes(), offset = 4;
    return Math.max(2, (15 - ((minute - offset) % 15 + 15) % 15) % 15 || 15);
  }
  function trolleyWait(vehicles, origin, direction, now) {
    const headingMatches = direction === "south" ? (h) => h >= 110 && h <= 250 : (h) => h <= 70 || h >= 290;
    const candidates = vehicles.map((vehicle) => {
      const point = { lat: Number(vehicle.Lat), lng: Number(vehicle.Lng) }, age = now.getTime() / 1000 - Number(vehicle.Tim), distance = haversineMiles(point, origin) * 1.25;
      const correctSide = direction === "south" ? point.lat >= origin.lat - .002 : point.lat <= origin.lat + .002;
      return { vehicle, distance, valid: age < 240 && distance < 4.5 && correctSide && headingMatches(Number(vehicle.Hea)) };
    }).filter((item) => item.valid).sort((a, b) => a.distance - b.distance);
    if (!candidates.length) return { minutes: 15, source: "scheduled", vehicle: null, confidence: "Fair" };
    const closest = candidates[0];
    return { minutes: Math.max(2, Math.min(25, Math.round(closest.distance / 11 * 60))), source: "live", vehicle: closest.vehicle.ShortName || closest.vehicle.ID, confidence: closest.distance < 1.5 ? "Good" : "Fair" };
  }
  function planTrip({ from = "place:home", to = "place:downtown", stops = [], mode = "now", arriveBy, vehicles = [], now = new Date() }) {
    const normalized = normalizeStops(stops), fromPoint = basePoint(from, normalized), toPoint = basePoint(to, normalized);
    if (!fromPoint || !toPoint || from === to) return null;
    const direction = toPoint.lat < fromPoint.lat ? "south" : "north", origin = endpoint(from, normalized, direction), destination = endpoint(to, normalized, direction);
    if (!origin.stop || !destination.stop) return null;
    const stopCount = (destination.stop.sequence - origin.stop.sequence + 60) % 60, rideMinutes = Math.max(3, Math.round(stopCount * 1.18));
    const live = trolleyWait(vehicles, origin.stop, direction, now), walkDirect = Math.round(haversineMiles(origin, destination) * 1.18 / 3.1 * 60), commonWalk = (from.startsWith("place:") ? 3 : 1) + (to.startsWith("place:") ? 4 : 1);
    const options = [
      { id: "trolley", label: "Biscayne trolley", wait: live.minutes, ride: rideMinutes, walk: commonWalk, buffer: live.source === "live" ? 4 : 7, cost: 0, data: live.source, vehicle: live.vehicle, confidence: live.confidence },
      { id: "walk", label: "Walk", wait: 0, ride: 0, walk: walkDirect, buffer: 2, cost: 0, data: "distance estimate", confidence: "Good" },
    ];
    if (from.startsWith("place:") && to.startsWith("place:") && from !== to) options.push({ id: "bus", label: "Bus 3", wait: nextBusWait(now), ride: Math.max(8, rideMinutes - 4), walk: commonWalk, buffer: 7, cost: 2.25, data: "schedule estimate", confidence: "Fair" });
    options.forEach((item) => item.total = item.wait + item.ride + item.walk + item.buffer);
    options.sort((a, b) => a.total - b.total || a.cost - b.cost);
    let best = options[0], trolley = options.find((item) => item.id === "trolley");
    if (trolley.total <= best.total + 4) best = trolley;
    const leaveAt = mode === "arrive" && arriveBy ? addMinutes(new Date(arriveBy), -best.total) : roundMinute(now), arrival = mode === "arrive" && arriveBy ? new Date(arriveBy) : addMinutes(leaveAt, best.total);
    return { origin, destination, direction, mode, leaveAt, arrival, best, options: [best, ...options.filter((item) => item.id !== best.id)], boarding: origin.stop, alighting: destination.stop,
      reason: best.id === "trolley" ? `${live.source === "live" ? `Trolley ${live.vehicle} is approaching` : "The 15-minute published headway is being used"}. It is free and within four minutes of the fastest option.` : best.id === "bus" ? "The scheduled bus option is faster after walking and reliability buffers." : "Walking is faster than waiting for transit.",
      minutesUntilLeave: Math.round((leaveAt - now) / 60000) };
  }
  return { PLACES, normalizeStops, haversineMiles, nextBusWait, trolleyWait, planTrip };
});
