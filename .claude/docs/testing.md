# Testing

`npm test` runs the Playwright end-to-end suite in `tests/` (about 20 seconds). Each test loads the real unpacked extension into Chromium and drives its service worker and popup.

## Setup

```bash
npm install
npx playwright install chromium   # only on machines without Playwright's Chromium
npm test                          # or: npx playwright test tests/parsing.spec.js -g "weekend"
```

`@playwright/test` is pinned to 1.56.1, which matches the Chromium preinstalled in cloud sessions (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`). If you bump the version there, the browser has to match.

## Files

| File | What it covers |
|---|---|
| `tests/fixtures.js` | `launchBrowser()` and the `Extension` helper; the `context`, `extension` and `userDataDir` fixtures |
| `tests/ibja-pages.js` | `ibjaPage({ am, pm, amHistory, pmHistory })` builds fake ibjarates.com pages; `saturdayPage` is a ready-made weekend page |
| `tests/parsing.spec.js` | PM/AM selection, the weekend/holiday history fallback, date formats, error messages, keeping the last good rates |
| `tests/alerts.spec.js` | When notifications are and aren't sent, and their text |
| `tests/popup.spec.js` | Every popup state, saving targets, the purity switch, layout width and both themes |
| `tests/lifecycle.spec.js` | Install alarm and fetch, surviving a browser restart |
| `tests/refresh-schedule.spec.js` | How often `refreshIfStale(now)` fetches inside and outside IBJA's publishing windows and at weekends |
| `tests/welcome.spec.js` | The welcome page opening on install and fitting the window |
| `tests/badge.spec.js` | The toolbar badge's text, colour and tooltip, following the purity and alert price, and after a restart |
| `tests/notification-click.spec.js` | Clicking a price alert opens ibjarates.com (calls the `onClicked` handler directly, since tests can't click a desktop notification) |

## How the fixtures work

- **Isolation:** every test gets a fresh Chromium profile under `test-results/`, launched with `channel: 'chromium'` (extensions need the new headless mode) and `--host-resolver-rules=MAP * ~NOTFOUND`. That blocks all DNS, so nothing reaches the real ibjarates.com.
- **Clean start:** the `extension` fixture waits for the extension's own install-time fetch to fail, then clears storage. Use the plain `context` fixture with `Extension.attach()` to test install behaviour itself.
- **Waiting for the worker:** `Extension.attach()` waits until `chrome.*` and `background.js` are ready, because Playwright can reach the worker before Chrome has run it (this made tests flaky before).
- **`extension.serveIbja(html, status)`** replaces `fetch` inside the service worker for ibjarates.com URLs. Other URLs pass through, because `chrome.notifications` loads its icon with `fetch`.
- **Driving the worker:** `extension.refresh()` and `extension.refreshIfStale(now)` call the worker's own top-level functions; pass `now` (e.g. `'2026-09-28T06:45:00Z'`) to test the schedule at a fixed time. `storage()`, `setStorage()` (replaces everything) and `updateStorage()` (merges, like the popup does) read and write `chrome.storage.local`.
- **Notifications:** `chrome.notifications.create` is wrapped to record messages. `notifications()` returns them and `clearNotifications()` resets the list. Alerts triggered through storage changes are asynchronous, so check them with `expect.poll(...)`, and call `extension.settle()` before asserting that nothing was sent.
- **Popup:** `extension.openPopup({ colorScheme })` opens `popup.html` at 376px wide. Uncaught popup errors fail the test automatically.

## Adding a test

```js
test('describes the behaviour', async ({ extension }) => {
    await extension.serveIbja(ibjaPage({ pm: { 999: '157739', 916: '144489' } }));
    await extension.refresh();
    expect(await extension.storage()).toMatchObject({ goldRates: { '24K': 157739, '22K': 144489 } });
});
```

If the real ibjarates.com markup turns out to differ from `tests/ibja-pages.js`, capture it with the console snippet in ibja-rates.md. Then update the page builder, or add the real HTML as a fixture, before changing the parser, so a test covers the fix.

## Manual check on the live site

1. Load or reload the unpacked extension and open the popup.
2. Compare the popup's value with the Gold 999 (24K) and Gold 916 (22K) rows on ibjarates.com for the session shown in the pill. On weekends, compare with the last working day's history row.
3. Set a target above the current rate. A "Gold Price Drop Alert" notification should appear immediately. If it doesn't, check that Chrome notifications are allowed in the OS settings.
4. Switch between 24K and 22K; each purity keeps its own target.
