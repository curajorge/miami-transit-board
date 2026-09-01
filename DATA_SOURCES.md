# Transit data sources

Miami Transit Board is an independent project and is not affiliated with or endorsed by the City of Miami or Miami-Dade County.

## City of Miami trolley

- Biscayne route geometry, stops, and public vehicle positions come from the City of Miami public trolley tracker.
- A last-known catalog of the route's 60 public stops is bundled as a fallback. Fresh tracker data replaces it whenever the route endpoint is available.
- Trolley vehicle arrivals are estimates calculated from public positions, heading, distance, and data age. They are not official stop predictions.
- When no fresh approaching vehicle can be identified, the app labels its fallback as a published-headway estimate.

## Miami-Dade Metrobus

- Route 3 and Route 9 stop catalogs are generated from Miami-Dade's public GTFS schedule feed.
- The Home-to-Downtown experience reads public arrival estimates near NE 29th Street and Downtown in both directions from Miami-Dade BusTime.
- When a live bus arrival is unavailable, the app labels the result as a schedule estimate.

Miami-Dade describes its transit feeds as open data intended for third-party applications. The repository's MIT License covers the project code; it does not relicense source transit data, which remains subject to the publisher's applicable terms. See the [Miami-Dade transit open-data page](https://www.miamidade.gov/global/transportation/open-data-feeds.page) and [County website user agreement](https://www.miamidade.gov/global/disclaimer/disclaimer.page).

Transit data can be incomplete, stale, delayed, or changed by its publisher. Do not use this prototype as the sole basis for time-critical travel.
