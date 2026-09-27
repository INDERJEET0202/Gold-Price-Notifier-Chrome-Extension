# IBJA rates and parsing

## Source

- IBJA (India Bullion and Jewellers Association) publishes India's benchmark gold rate, widely used as the reference price in India. It includes import duty but not GST (3%) or making charges.
- IBJA publishes an AM rate around noon and a PM rate around 5-6 PM IST on working days, and nothing on Saturdays, Sundays or central government holidays ("Rates are not published on Central Govt. Holidays & SAT/SUN").
- The extension fetches `https://ibjarates.com/`. There is no official API, so the HTML is scraped. The site has no robots.txt; the refresh schedule (see architecture.md) keeps the load to about 10 requests on a weekday per user.
- Rates are in ₹ per 10 g for gold, e.g. `157821`, and may contain commas or decimals. `toRate()` strips everything except digits and dots, then rounds.
- metals.dev, metalpriceapi.com and similar APIs only offer the international spot price, or IBJA in USD per ounce. They are not a substitute.

## Page structure the parser relies on

Today's rates are spans inside `table#TodayRatesTableDataYes`, with columns Purity | AM | PM:

```html
<span id="lblGold999_AM">157821</span>  <span id="lblGold999_PM">157739</span>
<span id="lblGold916_AM">144568</span>  <span id="lblGold916_PM">144489</span>
```

The PM spans are empty until IBJA publishes the PM rate. On weekends and holidays all of them are empty.

Earlier days are in history tables inside `#tab-am` and `#tab-pm`, one row per day:

```
<td>date</td> <td>999</td> <td>995</td> <td>916</td> <td>750</td> <td>585</td> <td>silver</td>
```

Dates look like `25/09/2026`; `parseIbjaDate()` also accepts `25-Sep-2026`. Weekend and holiday rows contain `SAT`, `SUN` or `Holiday` instead of numbers.

This structure comes from two open-source scrapers (github.com/the-solipsist/IBJA-API and github.com/gaurav-gandhi-2411/gold-rate-tracker, the latter verified against the live site on 2026-05-18). On 2026-09-26, a Saturday, the extension showed a live rate once the history fallback was added.

## Parsing order (`parseIbjaRates` in `background.js`)

1. `parseTodayRates()`: the PM spans if both 24K and 22K have a value, otherwise the AM spans. Both purities always come from the same session. Sets `rateDate` to `null`.
2. `parseLatestHistoryRates()`: when today's spans are empty, the latest day from `parseHistoryDays()`. That function returns every row with a parseable date and both 999 and 916 values, oldest first. PM is read first, so PM wins over AM for the same day. Sets `rateDate` to that day as `YYYY-MM-DD`. (`parseHistoryDays()` also feeds `rateHistory`.)
3. Otherwise it throws. If the page contains "not published", the message explains that IBJA hasn't published today; any other page gets "the 24K and 22K rates are missing from ibjarates.com (the page may have changed)".

Any error is stored in `lastError` and shown in the popup; the last good rates stay in storage.

## Debugging against the live site

In `chrome://extensions`, click "service worker" on the extension's card and run:

```js
const html = await (await fetch('https://ibjarates.com/')).text();
const at = (re) => { const i = html.search(re); return i < 0 ? 'NOT FOUND' : html.slice(i, i + 1500); };
copy([`length: ${html.length}`, `title: ${html.match(/<title>[^<]*/i)?.[0]}`, 'TODAY:', at(/lblGold999/), 'PM HISTORY:', at(/id=["']tab-pm/i)].join('\n\n'));
```

This copies the relevant parts of the page to the clipboard. `await refreshGoldRate()` forces a fetch, and `await chrome.storage.local.get(null)` shows the stored state.
