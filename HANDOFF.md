# Handoff: Gold Price Drop Notifier

Written 2026-09-27. Repo: `INDERJEET0202/Gold-Price-Notifier-Chrome-Extension`, default branch `master`.
Read `.claude/CLAUDE.md` and `.claude/docs/*.md` first. They describe the architecture, the IBJA parsing, the popup, and the test suite.

## Goal

Modernise the Chrome extension and publish it on the Chrome Web Store. Publishing costs a one-time US$5 developer registration fee. There is no yearly fee and nothing per extension.

The user asked for these enhancements, **each as its own PR with a meaningful name**:

| # | Enhancement | Status |
|---|---|---|
| 1 | Hourly checks around IBJA's publishing times | PR #6 open |
| 2 | Rate on the toolbar badge | Branch pushed, **docs and PR still to do** |
| 3 | Alert once per dip, not on every new rate | PR #7 open |
| 4 | Clicking a notification opens ibjarates.com | PR #8 open |
| 6 | Trend plus a 7-day sparkline in the popup | Not started |
| 7 | GST toggle plus per-gram price | Not started |
| 10 | Built-in welcome page instead of the stock-image install and uninstall tabs | PR #5 open |
| 11 | Remove the unused stock images in `Icons/` | PR #4 open |
| 13 | Chrome Web Store readiness: original icon, listing, privacy, package | Not started |

User preferences:
- They don't want to install Playwright or Chromium locally.
- They declined GitHub Actions CI.
- They test by loading the unpacked extension in Chrome.

## Done: merged into master

- PR #1 (merge `d388017`):
  - IBJA scraping instead of metalpriceapi;
  - MV3 fixes;
  - 24K/22K switch;
  - weekend and holiday fallback to the history tables;
  - modern popup;
  - `.claude` docs.
- PR #2 (merge `b97c427`): rounded `.app` panel and pill-shaped controls.
- PR #3 (merge `5e894f2`): Playwright end-to-end suite (`npm test`).

## Open PRs: a stack, to merge in order and only when the user says "merge"

| PR | Branch | Head | Change |
|---|---|---|---|
| [#4](https://github.com/INDERJEET0202/Gold-Price-Notifier-Chrome-Extension/pull/4) | `claude/remove-unused-stock-images` | `6b8e189` | Deletes 4 unused images: an iStock bell and an Amazon coin photo, each as .png and .jpg |
| [#5](https://github.com/INDERJEET0202/Gold-Price-Notifier-Chrome-Extension/pull/5) | `claude/welcome-page` | `0064c92` | `welcome.html`/`welcome.css` opens on install; updates open nothing; `setUninstallURL('')`; colour tokens moved into a shared `theme.css` |
| [#6](https://github.com/INDERJEET0202/Gold-Price-Notifier-Chrome-Extension/pull/6) | `claude/smart-refresh-schedule` | `ad16f83` | `refreshIfStale(now)` plus `refreshIntervalMs(now)` (details below) |
| [#7](https://github.com/INDERJEET0202/Gold-Price-Notifier-Chrome-Extension/pull/7) | `claude/alert-once-per-dip` | `bb66cbd` | Stores `alertedDips` (the alert price that already fired, per purity); `checkPriceDrop()` queues `runPriceDropCheck()` on `alertCheckQueue` |
| [#8](https://github.com/INDERJEET0202/Gold-Price-Notifier-Chrome-Extension/pull/8) | `claude/open-ibja-on-alert-click` | `81a3d79` | `chrome.notifications.onClicked` runs `openIbjaFromNotification()`: opens `IBJA_URL` and clears the alert |

The refresh intervals in PR #6:
- 55 minutes on weekdays inside the IST windows 11:30–14:00 and 16:30–19:30;
- 6 hours at other weekday times;
- 12 hours at weekends.

How the stack is set up and merged:
- Each branch is built on the previous one.
- Every PR targets `master` and says "Merge after #N" in its description, so its "Files changed" tab also shows the earlier PRs' changes until those are merged.
- Merge with the **merge-commit** method, passing `expectedHeadSha`. After each merge, check that the next PR is still mergeable and its checks (GitGuardian) are green.

## In progress: #2 toolbar badge

Branch `claude/toolbar-badge` (built on #8) is pushed at `7dc30c2`. The code and tests are finished; the full suite passes (**54 tests**).

What `background.js` does:
- `updateBadge()` shows the selected purity's rate in thousands, e.g. `158K` for ₹1,57,739. Chrome only fits about 4 characters, so "1.58L" could be cut off.
- The badge background is gold (`BADGE_COLOR` `#a16207`), or green (`BADGE_COLOR_BELOW_TARGET` `#15803d`) while the rate is below the alert price.
- The tooltip (`setTitle`) shows the full rate, the session, and the distance to the alert price.
- `updateBadge()` is called:
  - on install and on startup, because Chrome clears the badge on restart;
  - on storage changes to `goldRates`, `targetRates` or `purity`.

`tests/badge.spec.js` has 5 tests: empty badge, the rate after a fetch, green below the target, following the purity, and surviving a restart.

**To finish:**
1. Update the docs:
   - README feature bullet;
   - `.claude/docs/architecture.md`: a "Toolbar badge" section;
   - `.claude/docs/testing.md`: a `badge.spec.js` row;
   - one line in `welcome.html`, e.g. "The toolbar icon shows the rate: 158K = ₹1,58,000, green when below your alert price".
2. Run `npm test`, commit, and push.
3. Open the PR "Show the gold rate on the toolbar icon" against `master`, with "Merge after #8" in the description.

## Next PRs: planned design

Build each new branch on the previous one: #6 on `claude/toolbar-badge`, and so on.

1. **#6 Trend and sparkline** (`claude/rate-trend-chart`)
   - Generalise the history parsing (`historyRows`, `parseLatestHistoryRates`) so it returns every row.
   - Store `rateHistory`: the last 10 working days as `{ date, '24K', '22K' }`, preferring PM for each date, with today's rate merged in at its IST date.
   - In the popup:
     - show "▼ ₹420 since Thu" in green when the rate went down, or in the `--warn` colour when it went up;
     - draw an inline SVG sparkline of the last 7 points (no library), with a dashed line at the alert price when one is set;
     - hide both when there are fewer than 2 points.
   - Add tests for the parsing, the storage and the popup in both themes.
2. **#7 GST and per-gram** (`claude/gst-and-per-gram`)
   - Add an `includeGst` setting, off by default. When on, show rate × 1.03, plus the per-gram price (rate / 10).
   - Alert prices stay stored **excluding GST**, the IBJA basis, so alerts never change meaning. The input converts to and from the chosen basis.
   - The badge, tooltip and notification text use the chosen basis. Update the footer's "excl. GST" text to match.
   - Add tests.
3. **#13a Original icon** (`claude/original-icon`)
   - The current `logo16/32/48/128.png` and `Icons/logo.png` are a composite of an iStock bell and an Amazon Lakshmi-coin photo, so they **can't be published**.
   - Draw an original SVG gold coin with a ₹ drawn as paths, not a font glyph. Render the PNG sizes with Playwright and replace the notification icon too.
4. **#13b Web Store release** (`claude/chrome-web-store-release`)
   - Manifest:
     - `version` to 1.3.0;
     - `description` of 132 characters or fewer (the current one is too long).
   - Packaging:
     - package with `git archive` into `dist/`, with an npm script alias, and add `dist/` to `.gitignore`;
     - add a static test that the package includes every file referenced by the manifest, the HTML pages and `importScripts`.
   - Listing and privacy documents:
     - `store/listing.md`: name, summary, description, category, single purpose, a justification for each permission, the data-usage answers, and "Not affiliated with IBJA";
     - `PRIVACY.md`: no data is collected; settings stay in `chrome.storage.local`.
   - Store images, generated from the real popup with Playwright:
     - 3–5 screenshots at 1280×800;
     - the required 440×280 small promo tile;
     - an optional 1400×560 marquee.
   - README "Publishing" section: the $5 fee, 2-step verification, uploading the zip, and filling in the listing and privacy tabs.

## Key decisions and why

- **Scrape ibjarates.com.** There's no official API, and metalpriceapi, metals.dev and similar only give the international spot price or IBJA in USD/oz, not the Indian ₹ rate.
- **Regex parsing.** MV3 service workers have no `DOMParser`.
- **Weekend fallback to the `#tab-am`/`#tab-pm` history tables.** IBJA publishes nothing on Saturdays, Sundays or holidays.
- **`chrome.storage.local` as the single source of truth, plus `chrome.alarms`.** The service worker is killed when idle. The one exception is `alertCheckQueue`, an in-flight promise used only to serialise checks.
- **Alert once per dip.** Without it, every hourly fetch during a dip would re-alert. The queue fixed a double alert that happened when a fetch finished just as the user saved a target; it was verified over 230 full-suite runs.
- **Stacked branches.** The same files (`background.js`, docs) change in every PR, so separate branches off `master` would conflict.
- **Hermetic tests.** `--host-resolver-rules=MAP * ~NOTFOUND` blocks all DNS and fake pages come from `tests/ibja-pages.js`. The sandbox can't reach ibjarates.com anyway.
- **Badge in thousands.** "158K" fits Chrome's roughly 4-character badge; the tooltip has the exact rate.

## Files and where they live

- Extension, in the repo root:
  - `manifest.json`, `background.js`, `format.js` (`formatRupees`);
  - `popup.html`/`popup.css`/`popup.js`;
  - `theme.css` and `welcome.html`/`welcome.css` (from #5 on);
  - `logo*.png` and `Icons/logo.png`.
- Tests:
  - `tests/fixtures.js`: the `Extension` helper, `serveIbja`, `refresh`, `refreshIfStale(now)`, `storage`, `openPopup` and `openPage`;
  - `tests/ibja-pages.js`: fake IBJA pages;
  - `tests/*.spec.js`.
- Context docs: `.claude/CLAUDE.md` and `.claude/docs/{architecture,ibja-rates,popup-ui,testing}.md`. Update them in the same PR as the behaviour they describe.
- The storage keys are listed in `.claude/docs/architecture.md`; `alertedDips` is added by #7.

## Open issues

- **The live-site parsing error may still exist.** The user saw "the 24K and 22K rates are missing from ibjarates.com (the page may have changed)" on the `chrome://extensions` Errors page. It might be an old entry from before the weekend fallback.
  1. Ask them to click "Clear all", reload the extension, and check again.
  2. If the error persists, have them run this in the service worker console and paste the output:
     ```js
     const html = await (await fetch('https://ibjarates.com/')).text();
     const at = (re) => { const i = html.search(re); return i < 0 ? 'NOT FOUND' : html.slice(i, i + 1500); };
     copy([`length: ${html.length}`, `title: ${html.match(/<title>[^<]*/i)?.[0]}`, 'TODAY:', at(/lblGold999/), 'PM HISTORY:', at(/id=["']tab-pm/i)].join('\n\n'));
     ```
  3. Put the real markup into `tests/ibja-pages.js` before changing the parser.
- **Leaked key.** An old metalpriceapi key is in early git history. The user should revoke it in their metalpriceapi account.
- **No live access from the sandbox.** Always test against fake pages, then ask the user to check the popup against the live site.

## Working rules

- Follow `.claude/CLAUDE.md`:
  - the extension stays dependency-free;
  - run `npm test` before committing and add tests for every behaviour change;
  - 4-space indentation, single quotes;
  - format rupee amounts with `formatRupees()`;
  - write popup text with `textContent`.
- End every commit message with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017xUKgPWAEKJM1Xsx5EnLcB
  ```
- End every PR body with "🤖 Generated with [Claude Code](https://claude.com/claude-code)" and the session link.
- Put no model names in commits or PRs.
- Merge only when the user explicitly says "merge".
