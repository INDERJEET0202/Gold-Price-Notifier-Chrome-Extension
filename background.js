// MV3 service workers are shut down when idle, so nothing is kept in memory:
// all state lives in chrome.storage.local and the periodic refresh runs off chrome.alarms.

importScripts('format.js');

// IBJA (India Bullion and Jewellers Association) publishes India's benchmark gold rate
// twice each working day, an AM rate around noon and a PM rate around 5-6 PM IST.
const IBJA_URL = 'https://ibjarates.com/';
const REFRESH_ALARM = 'refresh-gold-rate';
const PRICE_DROP_NOTIFICATION = 'price-drop';
const REFRESH_NOW_MESSAGE = 'refresh-now'; // Sent by the popup's refresh button.
// Chrome opens this page after the extension is removed. It has to be on the web, since the
// extension's own files are gone by then: it is docs/goodbye.html, served by GitHub Pages.
const GOODBYE_URL = 'https://inderjeet0202.github.io/Gold-Price-Notifier-Chrome-Extension/goodbye.html';
const BADGE_COLOR = '#a16207'; // The popup's gold accent.
const BADGE_COLOR_BELOW_TARGET = '#15803d'; // Green, like "below your alert price" in the popup.
const ALARM_PERIOD_MINUTES = 60; // How often we wake up to check whether the rate is due for a refresh.
const HOUR_MS = 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * HOUR_MS; // India has no daylight saving.
// Minutes after midnight IST around the AM and PM publications, when we check every hour.
const PUBLISHING_WINDOWS_IST = [[11 * 60 + 30, 14 * 60], [16 * 60 + 30, 19 * 60 + 30]];
// Just under the alarm period, so every hourly alarm inside a window refreshes.
const REFRESH_IN_WINDOW_MS = 55 * 60 * 1000;
const REFRESH_ON_WEEKDAYS_MS = 6 * HOUR_MS;
const REFRESH_ON_WEEKENDS_MS = 12 * HOUR_MS; // IBJA doesn't publish on Saturdays and Sundays.
// The purities the popup offers, mapped to IBJA's fineness codes.
const PURITY_CODES = { '24K': '999', '22K': '916' };
// Column of each fineness in IBJA's history tables: date, 999, 995, 916, 750, 585, silver.
const HISTORY_COLUMNS = { '999': 1, '995': 2, '916': 3, '750': 4, '585': 5 };
// Working days of rates kept in rateHistory for the popup's trend and chart.
const HISTORY_DAYS = 10;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Show a short getting-started guide on first install. Updates open nothing.
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.tabs.create({ url: 'welcome.html' });
    }
    // Set on updates too, replacing the stock "goodbye" image that versions before 1.3 opened.
    chrome.runtime.setUninstallURL(GOODBYE_URL);
    ensureRefreshAlarm();
    updateBadge();
    refreshIfStale();
});

chrome.runtime.onStartup.addListener(() => {
    ensureRefreshAlarm();
    updateBadge(); // Chrome resets the badge when the browser restarts.
    refreshIfStale();
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REFRESH_ALARM) {
        refreshIfStale();
    }
});

// The popup only writes the user's purity and rates to storage; check them as soon as they change.
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
        return;
    }
    if (changes.targetRates || changes.purity) {
        checkPriceDrop();
    }
    if (changes.goldRates || changes.targetRates || changes.purity || changes.includeGst) {
        updateBadge();
    }
});

chrome.notifications.onClicked.addListener(openIbjaFromNotification);

// The popup's refresh button. Returning true keeps the channel open, so the popup's button spins
// until the fetch is done. refreshGoldRate() never throws: failures end up in lastError.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === REFRESH_NOW_MESSAGE) {
        refreshGoldRate().then(() => sendResponse({ done: true }));
        return true;
    }
    return false;
});

// Alarms usually survive browser restarts, but Chrome doesn't guarantee it.
async function ensureRefreshAlarm() {
    const alarm = await chrome.alarms.get(REFRESH_ALARM);
    if (!alarm) {
        await chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: ALARM_PERIOD_MINUTES });
    }
}

async function refreshIfStale(now = Date.now()) {
    const { lastFetched = 0 } = await chrome.storage.local.get('lastFetched');
    if (now - lastFetched >= refreshIntervalMs(now)) {
        await refreshGoldRate(now);
    }
}

// How old the stored rate may get before we fetch again: hourly around IBJA's publishing
// times on weekdays, so alerts arrive soon after a new rate, and rarely otherwise.
function refreshIntervalMs(now) {
    const ist = new Date(now + IST_OFFSET_MS); // Read with getUTC*() to get IST fields.
    const day = ist.getUTCDay();
    if (day === 0 || day === 6) {
        return REFRESH_ON_WEEKENDS_MS;
    }
    const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    const inWindow = PUBLISHING_WINDOWS_IST.some(([start, end]) => minutes >= start && minutes < end);
    return inWindow ? REFRESH_IN_WINDOW_MS : REFRESH_ON_WEEKDAYS_MS;
}

// Fetch today's 24K and 22K gold rates from ibjarates.com
async function refreshGoldRate(now = Date.now()) {
    try {
        const response = await fetch(IBJA_URL);
        if (!response.ok) {
            throw new Error(`ibjarates.com returned HTTP ${response.status}`);
        }
        const html = await response.text();
        const { goldRates, rateSession, rateDate = null } = parseIbjaRates(html);
        console.log(`Gold rates updated (IBJA ${rateSession}):`, goldRates);
        // Today's rate goes in at today's date in India, after the page's history, so it wins.
        const { rateHistory = [] } = await chrome.storage.local.get('rateHistory');
        const days = [...parseHistoryDays(html), { date: rateDate ?? istDate(now), goldRates }];
        await chrome.storage.local.set({
            goldRates,
            rateSession,
            rateDate,
            rateHistory: mergeRateHistory(rateHistory, days),
            lastFetched: now,
            lastError: null,
        });
        await checkPriceDrop();
    } catch (error) {
        console.error('Failed to fetch the gold rate:', error);
        await chrome.storage.local.set({ lastError: error.message });
    }
}

// ibjarates.com shows today's rates in ₹ per 10 grams without GST. IBJA doesn't publish
// on weekends and central government holidays, so on those days fall back to the latest
// rates in the page's history tables. Service workers have no DOMParser, so the markup
// is matched with regular expressions.
function parseIbjaRates(html) {
    const rates = parseTodayRates(html) ?? parseLatestHistoryRates(html);
    if (rates) {
        return rates;
    }
    if (/not published/i.test(html)) {
        throw new Error("IBJA hasn't published a rate today (it doesn't on weekends and holidays) and no earlier rate was found on ibjarates.com");
    }
    throw new Error('the 24K and 22K rates are missing from ibjarates.com (the page may have changed)');
}

// Today's rates are in spans like <span id="lblGold999_AM"> and <span id="lblGold916_PM">.
// The PM spans stay empty until IBJA publishes them in the evening, so fall back to the AM rates until then.
function parseTodayRates(html) {
    for (const rateSession of ['PM', 'AM']) {
        const goldRates = {};
        for (const [purity, code] of Object.entries(PURITY_CODES)) {
            const match = html.match(new RegExp(`id=["']lblGold${code}_${rateSession}["'][^>]*>([^<]*)<`));
            goldRates[purity] = match ? toRate(match[1]) : 0;
        }
        if (Object.values(goldRates).every((rate) => rate > 0)) {
            return { goldRates, rateSession };
        }
    }
    return null;
}

function parseLatestHistoryRates(html) {
    const latest = parseHistoryDays(html).at(-1);
    return latest && { goldRates: latest.goldRates, rateSession: latest.rateSession, rateDate: latest.date };
}

// Earlier rates are in tables inside #tab-am and #tab-pm, one row per day. Returns every day
// with both rates as { date: 'YYYY-MM-DD', goldRates, rateSession }, oldest first. Weekend and
// holiday rows have no rates. PM is read first so it wins over AM for the same day.
function parseHistoryDays(html) {
    const days = new Map();
    for (const rateSession of ['PM', 'AM']) {
        for (const cells of historyRows(html, rateSession)) {
            const date = parseIbjaDate(cells[0]);
            const goldRates = {};
            for (const [purity, code] of Object.entries(PURITY_CODES)) {
                goldRates[purity] = toRate(cells[HISTORY_COLUMNS[code]]);
            }
            if (date && Object.values(goldRates).every((rate) => rate > 0) && !days.has(toIsoDate(date))) {
                days.set(toIsoDate(date), { date: toIsoDate(date), goldRates, rateSession });
            }
        }
    }
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Adds `days` to the stored history, replacing stored days with the same date, and keeps the
// latest HISTORY_DAYS. Keeping our own copy means the chart still fills up over time if
// ibjarates.com shows only a few days.
function mergeRateHistory(rateHistory, days) {
    const byDate = new Map(rateHistory.map((day) => [day.date, day]));
    for (const { date, goldRates } of days) {
        byDate.set(date, { date, goldRates });
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-HISTORY_DAYS);
}

// Returns the text of each cell for every row in the #tab-am or #tab-pm section.
function historyRows(html, rateSession) {
    const start = html.search(new RegExp(`id=["']tab-${rateSession}["']`, 'i'));
    if (start < 0) {
        return [];
    }
    const rest = html.slice(start + 1);
    const end = rest.search(/id=["']tab-/i);
    const section = end < 0 ? rest : rest.slice(0, end);
    return (section.match(/<tr[\s\S]*?<\/tr>/gi) ?? [])
        .map((row) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
            .map((cell) => cell[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()))
        .filter((cells) => cells.length > HISTORY_COLUMNS['916']);
}

// Dates look like 25/09/2026; month names (25-Sep-2026) are accepted too.
function parseIbjaDate(text) {
    const [day, month, year] = text.split(/[\/\-. ]+/);
    const monthIndex = /^\d+$/.test(month) ? Number(month) - 1 : MONTHS.indexOf(String(month).slice(0, 3).toLowerCase());
    const date = new Date(Number(year), monthIndex, Number(day));
    return monthIndex >= 0 && date.getDate() === Number(day) ? date : null;
}

// Today's date in India as YYYY-MM-DD, whatever the computer's time zone.
function istDate(now) {
    return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// The popup formats the day itself, so store it as YYYY-MM-DD.
function toIsoDate(date) {
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part) => String(part).padStart(2, '0')).join('-');
}

function toRate(text = '') {
    return Math.round(Number(text.replace(/[^\d.]/g, '')));
}

// Runs after every fetch and whenever the user changes their purity or alert price. Checks read
// and then update alertedDips, so they are queued to run one at a time; otherwise a fetch
// finishing just as the user saves a price could alert twice. (The queue only orders work in
// flight; nothing in it needs to survive the service worker shutting down.)
let alertCheckQueue = Promise.resolve();

function checkPriceDrop() {
    alertCheckQueue = alertCheckQueue.then(runPriceDropCheck, runPriceDropCheck);
    return alertCheckQueue;
}

// Alerts once per dip: when the selected purity's rate first goes below its alert price.
// alertedDips records, per purity, the alert price that has already alerted during the current
// dip. A dip ends when the rate is back at or above the alert price, and saving a different
// alert price starts over, so either leads to a new alert.
async function runPriceDropCheck() {
    const { goldRates = {}, targetRates = {}, purity = '24K', alertedDips = {}, includeGst = false } =
        await chrome.storage.local.get(['goldRates', 'targetRates', 'purity', 'alertedDips', 'includeGst']);
    const isBelow = (p) => Boolean(goldRates[p] && targetRates[p] && goldRates[p] < targetRates[p]);
    const dips = {};
    for (const p of Object.keys(PURITY_CODES)) {
        if (isBelow(p) && alertedDips[p] === targetRates[p]) {
            dips[p] = targetRates[p];
        }
    }
    if (isBelow(purity) && dips[purity] === undefined) {
        priceDropAlertNotifi(purity, goldRates[purity], targetRates[purity], includeGst);
        dips[purity] = targetRates[purity];
    }
    await chrome.storage.local.set({ alertedDips: dips });
}

// This is the notification function which will be called when the gold price decreases.
// Prices are shown with GST if the user chose that in the popup.
function priceDropAlertNotifi(purity, goldRate, targetRate, includeGst = false) {
    const basis = includeGst ? ' incl. GST' : '';
    chrome.notifications.create(PRICE_DROP_NOTIFICATION, {
        type: 'basic',
        iconUrl: 'Icons/logo.png',
        title: 'Gold Price Drop Alert',
        message: `${purity} gold is now ${formatRupees(withGst(goldRate, includeGst))}/10g${basis}, below your rate of ${formatRupees(withGst(targetRate, includeGst))}/10g. Buy Gold now!`
    }, function (notificationId) {
        console.log('Notification sent with ID:', notificationId);
    });
}

// Clicking a price alert opens ibjarates.com, where the full rate table is, and dismisses the alert.
function openIbjaFromNotification(notificationId) {
    if (notificationId === PRICE_DROP_NOTIFICATION) {
        chrome.tabs.create({ url: IBJA_URL });
        chrome.notifications.clear(notificationId);
    }
}

// Shows the selected purity's rate on the toolbar icon in thousands, e.g. "158K" for ₹1,57,739
// (Chrome only has room for about four characters), green while it's below the alert price.
// Hovering the icon shows the full rate.
async function updateBadge() {
    const { goldRates = {}, targetRates = {}, purity = '24K', rateSession, includeGst = false } =
        await chrome.storage.local.get(['goldRates', 'targetRates', 'purity', 'rateSession', 'includeGst']);
    const goldRate = goldRates[purity];
    const targetRate = targetRates[purity];
    const belowTarget = Boolean(goldRate && targetRate && goldRate < targetRate);
    const shown = (amount) => withGst(amount, includeGst);

    let title = 'Gold Price Drop Notifier';
    if (goldRate) {
        title = `${purity} gold: ${formatRupees(shown(goldRate))}/10g${includeGst ? ' incl. GST' : ''} (IBJA ${rateSession} rate)`;
        if (targetRate) {
            title += belowTarget
                ? `\n${formatRupees(shown(targetRate - goldRate))} below your alert price`
                : `\nAlert when it drops below ${formatRupees(shown(targetRate))}`;
        }
    }
    await chrome.action.setBadgeText({ text: goldRate ? `${Math.round(shown(goldRate) / 1000)}K` : '' });
    await chrome.action.setBadgeBackgroundColor({ color: belowTarget ? BADGE_COLOR_BELOW_TARGET : BADGE_COLOR });
    await chrome.action.setBadgeTextColor({ color: '#ffffff' });
    await chrome.action.setTitle({ title });
}
