const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const TransitEngine = require("./engine");

async function boot(fetch) {
  const context = vm.createContext({ TransitEngine, fetch, AbortController, URLSearchParams, Event,
    document: { hidden: false, addEventListener() {} },
    window: { setTimeout, clearTimeout, setInterval() {}, dispatchEvent() {} },
  });
  for (const file of ["bus-stops.js", "trolley-stops.js", "app.js"]) vm.runInContext(fs.readFileSync(file, "utf8"), context);
  await new Promise(resolve => setImmediate(resolve));
  return context;
}
test("standalone startup works without legacy DOM and with every feed offline", async () => {
  const context = await boot(async () => { throw new Error("offline"); });
  const state = vm.runInContext("state", context);
  assert.equal(state.refreshing, false);
  assert.equal(state.stops.length, 60);
  assert.ok(state.locations.some(location => location.services.includes("bus-3")));
  assert.ok(state.locations.some(location => location.services.includes("trolley")));
  assert.match(state.lastError, /unavailable/);
});
test("malformed positions and arrival minutes cannot poison the planner", async () => {
  const context = await boot(async url => ({ ok: true, json: async () => url.includes("/api/bus")
    ? { route: "3", stop: "6706", minutes: [null, "", "bad", -1, 300, 8, "4"] }
    : [null, { Lat: "bad" }, { Lat: 25.8, Lng: -80.19, Tim: Date.now()/1000, Hea: 180 }] }));
  const state = vm.runInContext("state", context);
  assert.equal(state.vehicles.length, 1);
  assert.deepEqual(Array.from(state.buses[0].minutes), [4, 8]);
  assert.equal(state.refreshing, false);
});
test("released page has one interface and no prototype navigation", () => {
  const html = fs.readFileSync("index.html", "utf8");
  assert.doesNotMatch(html, /data-view-tab|boardPlanner|timelineControls|TEST VIEWS/);
  assert.match(html, /<h1>Plan your ride<\/h1>/);
  assert.equal((html.match(/id="goPanel"/g) || []).length, 1);
});
