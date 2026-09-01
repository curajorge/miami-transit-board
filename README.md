# Miami Transit Board

[![CI](https://github.com/curajorge/miami-transit-board/actions/workflows/ci.yml/badge.svg)](https://github.com/curajorge/miami-transit-board/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A deterministic, mobile-first decision board for trips from Edgewater toward Downtown Miami and Brickell. It combines the Biscayne trolley with nearby Metrobus 3 and 9 arrivals and answers a practical question: **when should I leave, where should I board, and when should I expect to arrive?**

No AI is used for trip recommendations. Every recommendation comes from explicit timing, walking, direction, and reliability rules in [`engine.js`](engine.js).

## What works

- Live City of Miami Biscayne trolley positions, refreshed every 30 seconds
- Metrobus 3 and 9 arrivals for the common Home-to-Downtown trip in both directions
- Leave-now and arrive-by planning for Downtown and Brickell
- Direction-aware return trips
- All 60 Biscayne trolley stops
- Metrobus 3 and 9 stops generated from Miami-Dade GTFS and scoped to the Edgewater–Downtown corridor
- Map filters organized by Trolley, Bus 3, and Bus 9
- Map-based From/To selection that preserves service, direction, and stop
- Clear live, stale, headway, and schedule-estimate labels
- An Android WebView wrapper with only the Internet permission

See [Transit data sources](DATA_SOURCES.md) for the provenance and limitations of each feed.

## Run the web app

Requirements: Node.js 24 or newer and `curl`.

```bash
npm start
```

Open <http://localhost:4173>. The local server proxies the legacy public tracker endpoints and serves only an allowlist of application assets.

Run verification with:

```bash
npm run verify
```

## Build the Android app

Requirements: JDK 17 and an Android SDK with API 35 installed.

```bash
cd android
./gradlew assembleDebug
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

## Refresh Metrobus stops

Download and extract Miami-Dade's current GTFS archive, then run:

```bash
node tools/extract-bus-stops.mjs PATH_TO_EXTRACTED_GTFS bus-stops.js
```

Review the generated diff and run `npm run verify` before committing it.

## Project structure

| Path | Purpose |
| --- | --- |
| `engine.js` | Deterministic trip comparison and timing rules |
| `app.js` | Map, public-feed adapters, and interface state |
| `server.js` | Local static server and constrained feed proxies |
| `bus-stops.js` | Generated full Route 3 and 9 catalog; the app selects the Edgewater–Downtown segment |
| `android/` | Minimal Android WebView wrapper |
| `tools/` | Reproducible data-generation utilities |

## Contributing and security

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Please report security issues privately as described in [SECURITY.md](SECURITY.md).

## Disclaimer

This is an independent prototype, not an official City of Miami or Miami-Dade County application. Transit information can be late, stale, incomplete, or unavailable. Allow extra time for important trips.

Licensed under the [MIT License](LICENSE).
