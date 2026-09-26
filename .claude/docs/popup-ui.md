# Popup UI

`popup.html` + `popup.css` + `popup.js`, 360px wide. Chrome sizes the popup to its content, up to 800×600. There is no CSS framework: everything is in `popup.css`, with system fonts only.

## Layout and element ids

1. Header: `logo48x48.png`, the extension name and "India's IBJA benchmark rate".
2. Purity switch: radio inputs `#purity-24K` and `#purity-22K` (`name="purity"`) styled as a segmented control (`.segmented`).
3. `#error-banner`: shown while `lastError` is set; the last good rate stays visible below it.
4. Rate card (`.rate-card`):
   - `#rate-label` ("24K gold · per 10 g") and the `#rate-session` pill ("IBJA PM rate");
   - `#rate-loading`: a shimmer shown until the first fetch finishes;
   - `#rate-value`: the price, or "—" when the first fetch failed;
   - `#rate-meta`: "Today · checked 5 min ago", or "Fri, 25 Sept · checked 2 h ago" when the rate is from an earlier day;
   - `#target-diff`: "✓ ₹261 below your alert price" (green, `.is-below`) or "₹739 above your alert price".
5. Alert form `#rate-form`: `#user-input-label` ("Alert me when 24K drops below"), `#user-input` (number) with a ₹ prefix, the `#submit` button ("Set alert", which shows "Saved ✓" for 1.5 s after saving) and `#target-hint`.
6. Footer: "Per 10 g, excl. GST" and a link to ibjarates.com.

`render()` in `popup.js` redraws everything from storage and runs on open and on every `chrome.storage.onChanged`. Write text with `textContent` only, never `innerHTML`, because `lastError` can contain text from the fetched page.

## Theming

- Colours are CSS custom properties on `:root` (`--bg`, `--surface`, `--surface-strong`, `--border`, `--text`, `--muted`, `--accent`, `--accent-strong`, `--accent-soft`, `--on-accent`, `--good`, `--warn`, `--warn-soft`, `--shadow`).
- A `@media (prefers-color-scheme: dark)` block redefines them, so the popup follows the OS or Chrome theme with no JavaScript. `color-scheme: light dark` makes native controls match.
- When adding UI, use the variables rather than literal colours, and check both themes.
- Animations respect `prefers-reduced-motion`.
- `[hidden] { display: none !important; }` is needed because some components set `display` themselves.

## Constraints

- The popup window's outer corners and frame are drawn by Chrome and can't be changed by the extension. Rounded looks have to come from elements inside the page.
- Flex children that contain inputs need `min-width: 0`, otherwise the input's intrinsic width pushes the row past 360px.
