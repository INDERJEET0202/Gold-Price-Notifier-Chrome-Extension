# Architecture

The service worker and the popup never message each other. `chrome.storage.local` is the single source of truth: the service worker writes rates, the popup writes user settings, and each reacts to the other through `chrome.storage.onChanged`.

```
ibjarates.com ──fetch──► background.js ──set──► chrome.storage.local ◄──set── popup.js
                              │                        │  onChanged              │
                              └── notification ◄───────┴─────────► re-render ◄───┘
```

## Storage keys (`chrome.storage.local`)

| Key | Written by | Value |
|---|---|---|
| `goldRates` | background | `{ '24K': number, '22K': number }` in ₹ per 10 g, rounded |
| `rateSession` | background | `'AM'` or `'PM'`: which IBJA rate the numbers are |
| `rateDate` | background | `'YYYY-MM-DD'` when the rate came from the history tables (no rate on the day of the fetch), otherwise `null` |
| `rateHistory` | background | `[{ date: 'YYYY-MM-DD', goldRates: { '24K', '22K' } }, …]`: one rate per working day, oldest first, at most `HISTORY_DAYS` (10). The last entry is the current rate. Feeds the popup's trend and chart. |
| `lastFetched` | background | `Date.now()` of the last successful fetch. Not updated on failure. |
| `lastError` | background | Message of the last failed fetch, `null` after a success |
| `purity` | popup | `'24K'` or `'22K'`; defaults to `'24K'` when unset |
| `targetRates` | popup | `{ '24K'?: number, '22K'?: number }`: a separate alert price for each purity |
| `alertedDips` | background | `{ '24K'?: number, '22K'?: number }`: for each purity currently below its alert price, the alert price that has already alerted during this dip |

## When the rate is fetched (`background.js`)

- `refreshIfStale(now)` fetches only if `lastFetched` is older than `refreshIntervalMs(now)`:
  - 55 minutes inside IBJA's publishing windows on weekdays (11:30–14:00 and 16:30–19:30 IST, `PUBLISHING_WINDOWS_IST`), so every hourly alarm there fetches and a new rate is picked up within about an hour;
  - 6 hours at other times on weekdays;
  - 12 hours on Saturdays and Sundays.
  That is about 10 requests on a weekday and 2 on a weekend day. IST is computed with a fixed +5:30 offset (India has no daylight saving).
- It runs on `runtime.onInstalled` (install, update or reload), on `runtime.onStartup`, and on an hourly `chrome.alarms` alarm named `refresh-gold-rate` (`ALARM_PERIOD_MINUTES = 60`).
- `ensureRefreshAlarm()` recreates the alarm on install and startup, because Chrome doesn't guarantee alarms survive a browser restart.
- A failed fetch leaves `lastFetched` unchanged, so it is retried at the next hourly alarm.
- Each successful fetch merges into `rateHistory` (`mergeRateHistory()`): every day in the page's history tables, then the current rate at `rateDate`, or at today's date in India (`istDate()`) when it is today's rate. Later entries replace earlier ones for the same date. The stored copy means the chart fills up over time even if the page shows only a few days.
- `refreshGoldRate(now)` and `refreshIfStale(now)` take the time as a parameter so tests can fix it.
- Opening the popup never fetches. It only renders storage.
- Nothing runs while Chrome is closed.

## When a notification is sent

Alerts fire **once per dip**: when the selected purity's rate first goes strictly below its alert price (`goldRates[purity] < targetRates[purity]`).

- `checkPriceDrop()` runs after every successful fetch, and when `targetRates` or `purity` changes in storage (the user saves a target or switches purity).
- It queues `runPriceDropCheck()` so checks run one at a time, because each reads and then writes `alertedDips`. Without the queue, a fetch finishing just as the user saves a price could alert twice.
- `runPriceDropCheck()` drops the `alertedDips` entry of any purity that is no longer below its alert price (the dip is over) or whose alert price changed. It then alerts for the selected purity if it is below and has no entry, and records the alert price.
- As a result:
  - further lower rates during the same dip don't alert again;
  - a recovery to or above the alert price followed by a new drop does alert;
  - saving a different alert price during a dip alerts once for the new price;
  - switching purity alerts if that purity is in a dip that hasn't alerted yet.

Every alert uses the notification id `price-drop` (`PRICE_DROP_NOTIFICATION`), so a new one replaces any that is still showing. Clicking it runs `openIbjaFromNotification()`, which opens ibjarates.com in a new tab and dismisses the alert.

## Toolbar badge

`updateBadge()` shows the selected purity's rate on the toolbar icon in thousands (`158K` for ₹1,57,739), because Chrome's badge only fits about four characters. The badge is gold (`BADGE_COLOR`), or green (`BADGE_COLOR_BELOW_TARGET`) while the rate is below the alert price, and empty until there is a rate. The icon's tooltip (`chrome.action.setTitle`) has the full rate, the session and the distance to the alert price.

It runs when `goldRates`, `targetRates` or `purity` change in storage, and on install and startup, because Chrome clears the badge when the browser restarts.

## Other behaviour

- On install the built-in `welcome.html` guide opens. Updates open nothing, and there is no uninstall page (updates clear the one that versions before 1.3 set).
- `PURITY_CODES` maps the popup's purities to IBJA fineness codes: `24K → 999`, `22K → 916`. Adding a purity means adding it there, adding its column to `HISTORY_COLUMNS` if needed, and adding a button to the popup's segmented switch.
