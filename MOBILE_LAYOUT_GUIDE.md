# UniSpace mobile layout guide

The website includes responsive layouts for tablets and phones. `website/index.html` includes the required viewport meta tag, and the final responsive overrides are at the bottom of `website/styles.css`.

## Mobile behavior
- The sidebar becomes a compact sticky header with a horizontally scrollable navigation row.
- Main content and cards use the available screen width without forcing the whole page to scroll sideways.
- Forms stack into one column and inputs/buttons have touch-friendly heights.
- Wide data tables remain inside their own horizontally scrollable containers.
- The 3D explorer stacks the canvas above the building/floor controls. The canvas supports touch drag to rotate and pinch/scroll-style zoom gestures where supported by the browser.
- The seven-day calendar intentionally scrolls horizontally on narrow screens so each day remains readable instead of compressing all seven columns.

## How to test on a phone
1. Open the Pages preview/site in Chrome or Safari.
2. Sign in and check the dashboard, navigation, rooms, schedules, and reservations.
3. Swipe the navigation row left/right to reach every section.
4. Open 3D Campus Explorer. Drag on the model to rotate; use two fingers to zoom if the browser supports it.
5. Open the weekly calendar and swipe the calendar area horizontally to view all seven days.
6. Check that tables scroll inside their cards and that the overall page does not have unwanted horizontal scrolling.

## Notes
- Three.js needs an internet connection because it is loaded as a module from a CDN.
- A phone/browser must support WebGL for the 3D explorer. If WebGL is unavailable, the app displays its fallback message.
- For best 3D performance, use a recent phone browser and close other heavy tabs.
