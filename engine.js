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
  const stopDirection = (stop) => stop.sequence <= 32 ? "south" : "north";
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
  function planTrip({ from = "place:home", to = "place:downtown", stops = [], mode = "now", arriveBy, vehicles = [], buses = [], now = new Date() }) {
    const normalized = normalizeStops(stops), fromPoint = basePoint(from, normalized), toPoint = basePoint(to, normalized);
    if (!fromPoint || !toPoint || from === to) return null;
    const fromStop = from.startsWith("stop:") ? fromPoint : null, toStop = to.startsWith("stop:") ? toPoint : null;
    if (fromStop && toStop && stopDirection(fromStop) !== stopDirection(toStop)) return null;
    const direction = fromStop ? stopDirection(fromStop) : toStop ? stopDirection(toStop) : toPoint.lat < fromPoint.lat ? "south" : "north";
    const origin = endpoint(from, normalized, direction), destination = endpoint(to, normalized, direction);
    if (!origin.stop || !destination.stop) return null;
    const stopCount = destination.stop.sequence - origin.stop.sequence;
    if (stopCount <= 0) return null;
    const rideMinutes = Math.max(3, Math.round(stopCount * 1.18));
    const live = trolleyWait(vehicles, origin.stop, direction, now);
    const walkToStop = from.startsWith("place:") ? 3 : 1, walkFromStop = to.startsWith("place:") ? 4 : 1;
    const safety = live.source === "live" ? 2 : 4;
    const leaveIn = Math.max(0, live.minutes - walkToStop - safety);
    const tripAfterLeaving = walkToStop + Math.max(safety, live.minutes - leaveIn) + rideMinutes + walkFromStop;
    const trolley = { id: "trolley", label: "Biscayne trolley", wait: live.minutes, ride: rideMinutes, walkToStop, walkFromStop, buffer: safety, cost: 0, data: live.source, vehicle: live.vehicle, confidence: live.confidence, total: tripAfterLeaving, arrivalMinutes: live.minutes + rideMinutes + walkFromStop, boarding: origin.stop.name };
    const options = [trolley];
    if (mode === "now" && from === "place:home" && to === "place:downtown" && direction === "south") {
      buses.forEach((bus) => {
        const wait = Number(bus.minutes?.[0]);
        if (!Number.isFinite(wait)) return;
        const route9 = String(bus.route) === "9", busWalk = route9 ? 2 : 4, busRide = route9 ? 22 : 20, busBuffer = 2;
        const busLeaveIn = Math.max(0, wait - busWalk - busBuffer);
        options.push({ id: `bus-${bus.route}`, label: `Metrobus ${bus.route}`, wait, ride: busRide, walkToStop: busWalk, walkFromStop: 4, buffer: busBuffer, cost: 2.25, data: "live-bus", confidence: "Good", total: busWalk + Math.max(busBuffer, wait - busLeaveIn) + busRide + 4, arrivalMinutes: wait + busRide + 4, boarding: route9 ? "NE 2 Ave & NE 29 St" : "Biscayne Blvd & NE 29 St", leaveIn: busLeaveIn });
      });
    }
    options.forEach((option) => { if (option.leaveIn == null) option.leaveIn = Math.max(0, option.wait - option.walkToStop - option.buffer); });
    options.sort((a, b) => a.arrivalMinutes - b.arrivalMinutes || a.cost - b.cost);
    const best = options[0], bestDuration = best.total;
    const leaveAt = mode === "arrive" && arriveBy ? addMinutes(new Date(arriveBy), -bestDuration) : addMinutes(roundMinute(now), best.leaveIn);
    const arrival = mode === "arrive" && arriveBy ? new Date(arriveBy) : addMinutes(now, best.wait + best.ride + best.walkFromStop);
    const bestReason = best.id === "trolley" ? `${live.source === "live" ? `Trolley ${live.vehicle} is approaching` : "Using the Biscayne route's published headway"}.` : `Miami-Dade BusTime reports Route ${best.id.slice(4)} approaching.`;
    return { origin, destination, direction, mode, leaveAt, arrival, best, options, boarding: origin.stop, alighting: destination.stop, walkToStop: best.walkToStop, nextTrolleyMinutes: live.minutes,
      reason: `${bestReason} Leave time includes a ${best.buffer}-minute boarding cushion.`,
      minutesUntilLeave: Math.max(0, Math.round((leaveAt - now) / 60000)) };
  }
  return { PLACES, normalizeStops, haversineMiles, trolleyWait, planTrip };
});
