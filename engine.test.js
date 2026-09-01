const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeStops, planTrip } = require("./engine");
const NOW = new Date("2026-08-31T18:00:00-04:00");
const stops = [
  { ID:"920851", Name:"NE 29 St (SB)", StopNumber:"6 - NE 29 St (SB)", Latitude:"25.804565", Longitude:"-80.193634" },
  { ID:"920869", Name:"Bayfront Metromover (SB)", StopNumber:"24 - Bayfront Metromover (SB)", Latitude:"25.773203", Longitude:"-80.187495" },
  { ID:"920876", Name:"Brickell Metromover", StopNumber:"30 - Brickell Metromover", Latitude:"25.763316", Longitude:"-80.195167" },
  { ID:"921010", Name:"Fin. District Metromover", StopNumber:"34 - Fin. District Metromover", Latitude:"25.760705", Longitude:"-80.192013" },
  { ID:"921016", Name:"Bayfront Park Metromover (NB)", StopNumber:"40 - Bayfront Park Metromover (NB)", Latitude:"25.772571", Longitude:"-80.187160" },
  { ID:"921033", Name:"NE 2 Ave (WB)", StopNumber:"56 - NE 2 Ave (WB)", Latitude:"25.804127", Longitude:"-80.191638" },
];
test("normalizes official stop sequence", () => assert.equal(normalizeStops(stops)[0].sequence, 6));
test("southbound shortcut resolves exact stops", () => { const p=planTrip({from:"place:home",to:"place:brickell",stops,now:NOW}); assert.equal(p.direction,"south"); assert.equal(p.boarding.id,"920851"); assert.equal(p.alighting.id,"920876"); });
test("return trip resolves northbound stops", () => { const p=planTrip({from:"place:brickell",to:"place:home",stops,now:NOW}); assert.equal(p.direction,"north"); assert.equal(p.boarding.id,"921010"); assert.equal(p.alighting.id,"921033"); });
test("arrive-by subtracts total duration", () => { const d=new Date("2026-08-31T19:00:00-04:00"),p=planTrip({from:"place:home",to:"place:downtown",stops,mode:"arrive",arriveBy:d,now:NOW}); assert.equal(Math.round((d-p.leaveAt)/60000),p.best.total); });
test("Biscayne-only plan has no bus or walking alternatives", () => { const p=planTrip({from:"place:home",to:"place:downtown",stops,now:NOW}); assert.deepEqual(p.options.map((o)=>o.id),["trolley"]); });
test("leave-now subtracts walking and safety from trolley wait", () => { const p=planTrip({from:"place:home",to:"place:downtown",stops,now:NOW}); assert.equal(p.minutesUntilLeave,8); });
test("rejects opposite-direction exact stop pairs", () => assert.equal(planTrip({from:"stop:920851",to:"stop:921016",stops,now:NOW}),null));
