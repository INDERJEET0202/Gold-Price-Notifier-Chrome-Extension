# Popup UI

`popup.html` + `popup.css` + `popup.js`. The body is 376px wide: an 8px tinted frame (`--frame`) around a 360px rounded panel (`.app`, 18px radius) that holds everything. Chrome sizes the popup to its content, up to 800×600. There is no CSS framework: everything is in `popup.css`, with system fonts only.

## Layout and element ids

1. Header: `logo48x48.png`, the extension name and "India's IBJA benchmark rate".
2. Purity switch: radio inputs `#purity-24K` and `#purity-22K` (`name="purity"`) styled as a pill-shaped segmented control (`.segmented`).
3. `#error-banner`: shown while `lastError` is set; the last good rate stays visible below it.
4. Rate card (`.rate-card`):
   - `#rate-label` ("24K gold · per 10 g", plus " · incl. GST" with GST on) and the `#rate-session` pill ("IBJA PM rate");
   - `#rate-loading`: a shimmer shown until the first fetch finishes;
   - `.rate-row`: `#rate-value`, the price (or "—" when the first fetch failed), with the `#rate-chart` sparkline beside it;
   - `#rate-chart`: an inline SVG (120×40 viewBox) of the last 7 days of `rateHistory` for the selected purity, drawn by `drawChart()`. It has a shaded area, a line and an end dot, plus a dashed `--good` line at the alert price when that is within the rates' range (or 1%) of them. Its `aria-label` and `<title>` (hover) give the date range, low and high. It sits beside the price, not below it, because Chrome caps the popup at 600px high;
   - `#rate-trend`: "▼ ₹420 (0.27%) since Thu" (green, `.is-down`) or "▲ …" (`--warn`, `.is-up`), comparing the last two days of `rateHistory`. It names the date ("since 15 Sept") when the previous rate is a week or more older;
   - the chart and the trend are hidden until `rateHistory` has 2 days;
   - `#rate-meta`: the price per gram, then when the rate is from, e.g. "₹15,774/g · Today · checked 5 min ago" or "₹15,774/g · Fri, 25 Sept · checked 2 h ago" when the rate is from an earlier day;
   - `#target-diff`: "✓ ₹261 below your alert price" (green, `.is-below`) or "₹739 above your alert price".
5. Alert form `#rate-form`: `#user-input-label` ("Alert me when 24K drops below"), `#user-input` (number) with a ₹ prefix, the `#submit` button ("Set alert", which shows "Saved ✓" for 1.5 s after saving) and `#target-hint`.
6. Footer: the "Include 3% GST" switch (`#include-gst`, a checkbox with `role="switch"` drawn as `.toggle`) and a link to ibjarates.com.

Every amount goes through `shown()` in `render()` (`withGst()` from `format.js`), so it follows the GST switch. Stored figures never include GST: `fillUserInput()` adds GST to the saved alert price for the input, and `saveUserRate()` takes it off again before saving.

`render()` in `popup.js` redraws everything from storage and runs on open and on every `chrome.storage.onChanged`. Write text with `textContent` only, never `innerHTML`, because `lastError` can contain text from the fetched page.

## Theming

- Colours are CSS custom properties on `:root` in `theme.css`, which the popup and `welcome.html` both load first (`--frame`, `--bg`, `--surface`, `--surface-strong`, `--border`, `--text`, `--muted`, `--accent`, `--accent-strong`, `--accent-soft`, `--on-accent`, `--good`, `--warn`, `--warn-soft`, `--shadow`).
- A `@media (prefers-color-scheme: dark)` block redefines them, so the popup follows the OS or Chrome theme with no JavaScript. `color-scheme: light dark` makes native controls match.
- When adding UI, use the variables rather than literal colours, and check both themes.
- Animations respect `prefers-reduced-motion`.
- `[hidden] { display: none !important; }` is needed because some components set `display` themselves.

## Constraints

- The popup window's outer corners and frame are drawn by Chrome and can't be changed by the extension, which is why the content sits in the rounded `.app` panel on the `--frame` background.
- Shape language: pills (`border-radius: 999px`) for the switch, input and button; 20px for the rate card; 14px for the banner.
- Flex children that contain inputs need `min-width: 0`, otherwise the input's intrinsic width pushes the row past 360px.
- Chrome caps the popup at 600px high and scrolls anything taller. With the longest error message, GST on and the trend showing, the popup is about 595px, so new UI must not add height (the GST switch went in the footer for this reason). Keep one-line texts like `#target-hint` from wrapping. The layout test checks the height.
- SVG elements have no `.hidden` property, so toggle the attribute instead (`toggleAttribute('hidden', …)`).
