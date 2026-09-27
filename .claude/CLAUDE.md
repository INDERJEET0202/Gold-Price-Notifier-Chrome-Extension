# Gold Price Drop Notifier

A Chrome extension (Manifest V3, plain JavaScript) that shows India's IBJA benchmark gold rate for 24K and 22K and sends a desktop notification when the rate for the user's chosen purity drops below their target. There is no build step and no backend, and the extension has no dependencies: Chrome loads the files in the repo root as they are. npm is only used for the dev-only Playwright test suite.

@docs/architecture.md
@docs/ibja-rates.md
@docs/popup-ui.md
@docs/testing.md

## Files

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest. Permissions: `alarms`, `notifications`, `storage`. Host permissions: `ibjarates.com` (with and without `www`). |
| `background.js` | Service worker. Schedules refreshes, fetches and parses ibjarates.com, stores rates, sends notifications, updates the toolbar badge. |
| `popup.html`, `popup.css`, `popup.js` | Toolbar popup. Renders what is in storage and saves the user's purity and target rates. |
| `welcome.html`, `welcome.css` | Getting-started page opened once on install. Static, no script. |
| `theme.css` | Colour variables (light and dark) and base styles shared by the popup and the welcome page. |
| `format.js` | `formatRupees()`, `GST_RATE` and `withGst()`, shared by the service worker (`importScripts`) and the popup (`<script>`). |
| `Icons/logo.png` | Notification icon. The `logo*.png` files in the root are the extension icons. |
| `README.md` | User-facing overview. Its code snippets are copies of functions in `background.js`; update them when those functions change. |
| `tests/` | Playwright end-to-end tests: `fixtures.js` (launches Chromium with the extension, plus helpers), `ibja-pages.js` (fake ibjarates.com pages), and `*.spec.js`. |
| `package.json`, `playwright.config.js` | Dev-only test tooling. `@playwright/test` is the only npm package. |

## Working on this repo

- Keep the extension dependency-free: no runtime npm packages, bundlers, frameworks, or remote scripts, stylesheets or fonts. MV3's CSP blocks remote scripts and the popup has to work offline. Ask before adding any of these. (`@playwright/test` is a dev dependency for the tests only.)
- Run `npm test` before committing, and add or update tests for any behaviour change. Setup is `npm install`, plus `npx playwright install chromium` on a machine without Playwright's Chromium (cloud sessions have it preinstalled).
- Code style: 4-space indentation, single quotes, semicolons, `async`/`await`, and short comments that explain why rather than what. Match the surrounding code.
- Show every rupee amount through `formatRupees()` so it uses Indian digit grouping (₹1,57,739), and through `withGst(amount, includeGst)` first, so it follows the user's GST choice. Rates and alert prices are always stored without GST.
- The default branch is `master`.
- To try a change: open `chrome://extensions`, turn on Developer mode, click "Load unpacked" and choose the repo root. After editing, click the reload icon on the extension's card and reopen the popup.
- `manifest.json` `version` is bumped for user-visible releases (currently 1.2.0).

## Gotchas

- MV3 service workers are shut down after about 30 seconds idle. Never keep state in globals or rely on `setInterval`/`setTimeout` in `background.js`; use `chrome.storage.local` and `chrome.alarms`.
- Service workers have no `DOMParser`, so ibjarates.com is parsed with regular expressions.
- IBJA publishes nothing on Saturdays, Sundays and central government holidays. Any change to parsing must keep the weekend fallback working.
- `chrome.notifications.create` loads `iconUrl` with the service worker's own `fetch`. A test that stubs `fetch` has to pass other URLs through, or notifications silently fail.
- Cloud sandboxes usually can't reach ibjarates.com (the egress proxy blocks it), and the tests block all DNS anyway. Test against fake pages from `tests/ibja-pages.js`, then ask the user to check the popup against the live site.
- An old metalpriceapi.com API key is still in early git history. It is no longer used and should be treated as leaked; never put API keys in the code.
