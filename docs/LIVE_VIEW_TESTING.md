# Live trolley regression checks

The vehicle view and stop picker are separate. These checks cover visibility as well as DOM marker creation.

## Automated data checks

Run `npm run verify`. Tests cover offline startup, malformed positions, wrong-route/out-of-area positions, preserving actual timestamps after failed refreshes, and distinguishing empty successful responses from outages. Existing deterministic trip-planning tests remain in place.

## Mobile browser checks

Use an isolated browser; do not inject test positions into a user's session or public feed.

- Open Live trolleys before a response arrives. When the first fresh positions arrive, verify their marker bounds fall inside the visible map.
- Pan manually and refresh. Do not pull the map away from the rider's chosen view. Show all trolleys explicitly restores the vehicle bounds.
- Tap a vehicle row; verify its popup and focus. Close/reopen the dialog and verify focus returns to the opener.
- Supply fresh, >4-minute-old, and future-dated positions. Only fresh positions should render.
- Fail a refresh after a successful response. Recent last-known positions must retain their ages and show the failed-refresh warning.
- Supply an empty successful response. Clear the markers, disable Show all, and avoid claiming service has stopped.
- Block tile requests. Keep vehicle details available and show a tile-loading warning.
- Check 390 × 844 and 320 × 640, in light and dark mode; verify From/To still works separately.

## Android before release

Build with JDK 17: `cd android && ./gradlew assembleDebug`.

On an authorized test phone, verify real feed refreshes, retry failure, opening before data arrives, system-bar spacing, and dialog navigation. Do not disable TLS validation to work around a provider certificate problem. Browser validation does not replace testing Android's separate network wrapper.
