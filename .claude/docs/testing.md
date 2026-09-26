# Testing

There is no test suite in the repo yet. Changes have been verified with throwaway Playwright scripts that load the unpacked extension in Chromium. The approach is below, so it can be repeated or turned into a committed suite.

## Automated checks with Playwright

```js
const { chromium } = require('playwright');
const ctx = await chromium.launchPersistentContext(profileDir, {
    channel: 'chromium', // extensions need the new headless mode
    args: [`--disable-extensions-except=${repoRoot}`, `--load-extension=${repoRoot}`],
});
const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent('serviceworker');
const extensionId = sw.url().split('/')[2];
```

- **Fake ibjarates.com:** replace `fetch` inside the service worker and pass other URLs through, because the notification icon is loaded with `fetch` too:
  ```js
  await sw.evaluate((body) => {
      self.__realFetch ??= self.fetch;
      self.fetch = async (url, ...rest) => String(url).includes('ibjarates.com')
          ? new Response(body, { status: 200 })
          : self.__realFetch(url, ...rest);
  }, fixtureHtml);
  ```
- **Drive the worker:** top-level functions in `background.js` are globals in the service worker, so `sw.evaluate(() => refreshGoldRate())`, `refreshIfStale()` and `checkPriceDrop()` can be called directly. Read state with `chrome.storage.local.get(null)` and alerts with `chrome.notifications.getAll()`.
- **Popup:** open `chrome-extension://<id>/popup.html` in a page with `setViewportSize({ width: 360, height: 100 })` and screenshot with `fullPage: true`. Use `page.emulateMedia({ colorScheme: 'dark' })` for the dark theme.
- **Popup states without fetching:** clear storage and set the keys from architecture.md directly with `chrome.storage.local.set(...)`.
- **Restart:** close the context and relaunch with the same `profileDir` to check that storage and the alarm survive.

Fixture pages should mirror the structure in ibja-rates.md. Cover at least these cases:
- PM rates present;
- PM empty so AM is used;
- both empty with history tables, in newest-first and oldest-first order, with SAT/SUN/Holiday rows;
- dates with month names;
- a "not published" page with no history;
- an unrelated page;
- HTTP 403.

## Manual check on the live site

1. Load or reload the unpacked extension and open the popup.
2. Compare the popup's value with the Gold 999 (24K) and Gold 916 (22K) rows on ibjarates.com for the session shown in the pill. On weekends, compare with the last working day's history row.
3. Set a target above the current rate. A "Gold Price Drop Alert" notification should appear immediately. If it doesn't, check that Chrome notifications are allowed in the OS settings.
4. Switch between 24K and 22K; each purity keeps its own target.
