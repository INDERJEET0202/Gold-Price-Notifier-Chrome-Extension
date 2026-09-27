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
| `lastFetched` | background | `Date.now()` of the last successful fetch. Not updated on failure. |
| `lastError` | background | Message of the last failed fetch, `null` after a success |
| `purity` | popup | `'24K'` or `'22K'`; defaults to `'24K'` when unset |
| `targetRates` | popup | `{ '24K'?: number, '22K'?: number }`: a separate alert price for each purity |

## When the rate is fetched (`background.js`)

- `refreshIfStale()` fetches only if `lastFetched` is more than `REFRESH_INTERVAL_MS` (3 hours) old.
- It runs on `runtime.onInstalled` (install, update or reload), on `runtime.onStartup`, and on an hourly `chrome.alarms` alarm named `refresh-gold-rate` (`ALARM_PERIOD_MINUTES = 60`).
- `ensureRefreshAlarm()` recreates the alarm on install and startup, because Chrome doesn't guarantee alarms survive a browser restart.
- A failed fetch leaves `lastFetched` unchanged, so it is retried at the next hourly alarm.
- Opening the popup never fetches. It only renders storage.
- Nothing runs while Chrome is closed.

## When a notification is sent

`checkPriceDrop()` notifies when `goldRates[purity] < targetRates[purity]` (strictly below). It is called:

1. After a successful fetch, but only if the rate for the selected purity differs from the previously stored one. Polling every few hours therefore doesn't repeat the alert while IBJA hasn't published anything new.
2. When `targetRates` or `purity` changes in storage, i.e. the user saves a target or switches purity.

Every alert uses the notification id `price-drop`, so a new one replaces any that is still showing. While the price stays below the target, the user gets one alert per new IBJA rate, at most about two per working day.

## Other behaviour

- On install the built-in `welcome.html` guide opens. Updates open nothing, and there is no uninstall page (updates clear the one that versions before 1.3 set).
- `PURITY_CODES` maps the popup's purities to IBJA fineness codes: `24K → 999`, `22K → 916`. Adding a purity means adding it there, adding its column to `HISTORY_COLUMNS` if needed, and adding a button to the popup's segmented switch.
