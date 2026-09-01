# Biscayne Trolley Live

A mobile-first prototype showing live vehicle positions for the City of Miami's Biscayne trolley route.

## Run locally

```bash
node server.js
```

Then open <http://localhost:4173>.

The small local server reads route geometry and vehicle positions from the public endpoint used by the City of Miami's official trolley tracker. This avoids the tracker's browser compatibility problem, so the app must be run with `node server.js` rather than opened directly as a file.

## Current scope

- Biscayne route only (public route ID `71276`)
- Live vehicle positions refreshed every 30 seconds
- Vehicle update age and stale-data warning
- User location control
- Responsive mobile and desktop layout
- Deterministic comparison of trolley, Bus 3, and walking
- Leave-now and arrive-by planning for Downtown and Brickell
- Expandable arithmetic/source explanation for every recommendation
- All 60 official Biscayne trolley stops on an interactive map
- Map-based From/To assignment: tap either trip card, then tap a stop
- Stop popups with direction, next-trolley estimate, and From/To actions
- Direction-aware saved places for Whole Foods, Downtown, and Brickell
- One-tap outbound/return trip reversal
- Locally remembered From/To selections

## Open source

This project is licensed under the MIT License. Contributions are welcome; see `CONTRIBUTING.md`. Live transit information can be delayed or unavailable, so recommendations should be treated as estimates rather than guarantees.

The trolley option uses live positions when a fresh approaching vehicle can be identified. Bus 3 currently uses a clearly labeled 15-minute schedule model because Miami-Dade's real-time API requires a developer key. The rule engine is isolated in `engine.js` so a live bus adapter can replace that input without changing recommendation behavior.

This is an independent prototype and is not affiliated with or endorsed by the City of Miami.
