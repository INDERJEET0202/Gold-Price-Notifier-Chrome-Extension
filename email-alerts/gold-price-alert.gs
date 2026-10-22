// Gold Price Drop Notifier: email alerts (Google Apps Script)
//
// Emails you when India's IBJA gold rate drops below your alert price. It runs on Google's
// servers, so it works even when your laptop and Chrome are off, and it sends from your own Gmail
// to you, so there is no password or API key anywhere. It works on its own: it doesn't talk to
// the Chrome extension, so set your alert prices below too. Setup: email-alerts/README.md.

// ----------------------------------------------------------------------------------------------
// Your settings
//
// Alert prices in ₹ per 10 g WITHOUT GST, the way IBJA and the extension show them by default.
// 0 means no alert for that purity.
const ALERT_PRICES = {
    '24K': 0,
    '22K': 0,
};
// Where to send the emails. Empty means the Google account that runs this script.
const EMAIL_TO = '';
// ----------------------------------------------------------------------------------------------

const IBJA_URL = 'https://ibjarates.com/';
const PURITY_CODES = { '24K': '999', '22K': '916' };
// Column of each fineness in IBJA's history tables: date, 999, 995, 916, 750, 585, silver.
const HISTORY_COLUMNS = { '999': 1, '916': 3 };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // India has no daylight saving.
// IBJA publishes around noon and 5-6 PM IST on working days. Hourly checks from 11:00 to 19:59 IST
// on weekdays catch both without bothering the site at night or at weekends.
const FIRST_CHECK_HOUR_IST = 11;
const LAST_CHECK_HOUR_IST = 19;
const GST_RATE = 0.03;
// A warning email after this many failed checks in a row: about one working day of checks.
const FAILURES_BEFORE_WARNING = 9;

// Run this once from the editor (select "setup", click Run). It checks your settings, turns on the
// hourly check and sends a test email with today's rates.
function setup() {
    if (!Object.keys(ALERT_PRICES).some((purity) => ALERT_PRICES[purity] > 0)) {
        throw new Error('Set your alert price in ALERT_PRICES at the top of the script first, then run setup again.');
    }
    turnOff();
    ScriptApp.newTrigger('checkGoldRate').timeBased().everyHours(1).create();
    sendTestEmail();
}

// Stops the hourly check. Run setup to start it again.
function turnOff() {
    for (const trigger of ScriptApp.getProjectTriggers()) {
        if (trigger.getHandlerFunction() === 'checkGoldRate') {
            ScriptApp.deleteTrigger(trigger);
        }
    }
}

// Reads ibjarates.com now and emails you the rates, to check that both work.
function sendTestEmail() {
    const latest = fetchIbjaRates();
    const watching = Object.keys(ALERT_PRICES)
        .filter((purity) => ALERT_PRICES[purity] > 0)
        .map((purity) => `${purity} drops below ${formatRupees(ALERT_PRICES[purity])}`);
    sendEmail('Gold price alerts are on', [
        `Today's IBJA ${latest.rateSession} rate (${formatDay(latest.rateDate)}): 24K ${formatRupees(latest.goldRates['24K'])}, 22K ${formatRupees(latest.goldRates['22K'])} per 10 g.`,
        '',
        `You'll get an email when ${watching.join(' or ')}. The script checks every hour on working days, 11 AM to 8 PM IST.`,
    ]);
    console.log(`Test email sent. ${latest.rateSession} rate: 24K ${latest.goldRates['24K']}, 22K ${latest.goldRates['22K']}`);
}

// Checks straight away, whatever the time, and logs the rates. Emails only if there's a new drop.
function checkNow() {
    const latest = checkAndAlert(PropertiesService.getScriptProperties());
    console.log(`IBJA ${latest.rateSession} rate (${latest.rateDate}): 24K ${latest.goldRates['24K']}, 22K ${latest.goldRates['22K']}`);
}

// The hourly trigger. Failures are logged rather than thrown, so Google doesn't send a failure
// report every day; after a working day of failures in a row, one warning email says so instead.
function checkGoldRate() {
    if (!isCheckTime(Date.now())) {
        return;
    }
    const properties = PropertiesService.getScriptProperties();
    try {
        checkAndAlert(properties);
        properties.deleteProperty('failures');
    } catch (error) {
        console.error(`Couldn't check the gold rate: ${error.message}`);
        const failures = Number(properties.getProperty('failures') || 0) + 1;
        properties.setProperty('failures', String(failures));
        if (failures === FAILURES_BEFORE_WARNING) {
            sendEmail("Gold price alerts: can't read ibjarates.com", [
                `The last ${failures} checks failed, so you may miss a price drop. The latest error:`,
                '',
                error.message,
                '',
                "Open the script and run checkNow to see the problem. You'll get this warning once; it resets after a check works.",
            ]);
        }
    }
}

// Emails once per dip, like the extension: when a purity first drops below its alert price. It
// emails again only after the rate has gone back up to the alert price and dropped again, or when
// you change the alert price.
function checkAndAlert(properties) {
    const latest = fetchIbjaRates();
    const alerted = JSON.parse(properties.getProperty('alertedDips') || '{}');
    const dips = {};
    for (const purity of Object.keys(ALERT_PRICES)) {
        const alertPrice = ALERT_PRICES[purity];
        const rate = latest.goldRates[purity];
        if (!(alertPrice > 0 && rate < alertPrice)) {
            continue; // Not in a dip, so the next drop alerts again.
        }
        if (alerted[purity] !== alertPrice) {
            sendDropEmail(purity, rate, alertPrice, latest);
        }
        dips[purity] = alertPrice;
    }
    properties.setProperty('alertedDips', JSON.stringify(dips));
    return latest;
}

function sendDropEmail(purity, rate, alertPrice, latest) {
    sendEmail(`Gold price drop: ${purity} at ${formatRupees(rate)} (below ${formatRupees(alertPrice)})`, [
        `${purity} gold (${PURITY_CODES[purity]}) is now ${formatRupees(rate)} per 10 g, below your alert price of ${formatRupees(alertPrice)}.`,
        '',
        `IBJA ${latest.rateSession} rate, ${formatDay(latest.rateDate)}`,
        `With 3% GST: ${formatRupees(rate * (1 + GST_RATE))} · per gram: ${formatRupees(rate / 10)}`,
        `All rates: ${IBJA_URL}`,
        '',
        "You get one email each time the rate drops below your price. To change it, edit ALERT_PRICES in the script.",
    ]);
}

function sendEmail(subject, lines) {
    MailApp.sendEmail(EMAIL_TO || Session.getEffectiveUser().getEmail(), subject, lines.join('\n'));
}

// Weekdays from 11:00 to 19:59 in India.
function isCheckTime(now) {
    const ist = new Date(now + IST_OFFSET_MS); // Read with getUTC*() to get IST fields.
    const day = ist.getUTCDay();
    const hour = ist.getUTCHours();
    return day >= 1 && day <= 5 && hour >= FIRST_CHECK_HOUR_IST && hour <= LAST_CHECK_HOUR_IST;
}

// The latest rates on ibjarates.com as { goldRates, rateSession, rateDate: 'YYYY-MM-DD' }. Reads the
// page the same way as the extension's background.js: today's spans, or on holidays the latest day
// in the history tables.
function fetchIbjaRates() {
    const response = UrlFetchApp.fetch(IBJA_URL, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) {
        throw new Error(`ibjarates.com returned HTTP ${response.getResponseCode()}`);
    }
    const html = response.getContentText();
    const today = parseTodayRates(html);
    if (today) {
        today.rateDate = istDate(Date.now());
        return today;
    }
    const latest = parseLatestHistoryRates(html);
    if (latest) {
        return latest;
    }
    throw new Error('the 24K and 22K rates are missing from ibjarates.com (the page may have changed)');
}

// Today's rates are in spans like <span id="lblGold999_PM">. The PM spans stay empty until IBJA
// publishes them in the evening, so fall back to the AM rates until then.
function parseTodayRates(html) {
    for (const rateSession of ['PM', 'AM']) {
        const goldRates = {};
        for (const purity of Object.keys(PURITY_CODES)) {
            const match = html.match(new RegExp(`id=["']lblGold${PURITY_CODES[purity]}_${rateSession}["'][^>]*>([^<]*)<`));
            goldRates[purity] = match ? toRate(match[1]) : 0;
        }
        if (Object.keys(goldRates).every((purity) => goldRates[purity] > 0)) {
            return { goldRates, rateSession };
        }
    }
    return null;
}

// Earlier days are in tables inside #tab-am and #tab-pm, one row per day. Weekend and holiday rows
// have no rates. PM is read first so it wins over AM for the same day.
function parseLatestHistoryRates(html) {
    let latest = null;
    for (const rateSession of ['PM', 'AM']) {
        for (const cells of historyRows(html, rateSession)) {
            const date = parseIbjaDate(cells[0]);
            const goldRates = {};
            for (const purity of Object.keys(PURITY_CODES)) {
                goldRates[purity] = toRate(cells[HISTORY_COLUMNS[PURITY_CODES[purity]]]);
            }
            if (date && Object.keys(goldRates).every((purity) => goldRates[purity] > 0) && (!latest || date > latest.date)) {
                latest = { date, goldRates, rateSession };
            }
        }
    }
    return latest && { goldRates: latest.goldRates, rateSession: latest.rateSession, rateDate: toIsoDate(latest.date) };
}

// The text of each cell for every row in the #tab-am or #tab-pm section.
function historyRows(html, rateSession) {
    const start = html.search(new RegExp(`id=["']tab-${rateSession}["']`, 'i'));
    if (start < 0) {
        return [];
    }
    const rest = html.slice(start + 1);
    const end = rest.search(/id=["']tab-/i);
    const section = end < 0 ? rest : rest.slice(0, end);
    return (section.match(/<tr[\s\S]*?<\/tr>/gi) || [])
        .map((row) => (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [])
            .map((cell) => cell.replace(/^<td[^>]*>|<\/td>$/gi, '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()))
        .filter((cells) => cells.length > HISTORY_COLUMNS['916']);
}

// Dates look like 25/09/2026; month names (25-Sep-2026) are accepted too.
function parseIbjaDate(text) {
    const [day, month, year] = text.split(/[\/\-. ]+/);
    const monthIndex = /^\d+$/.test(month) ? Number(month) - 1 : MONTHS.indexOf(String(month).slice(0, 3).toLowerCase());
    const date = new Date(Number(year), monthIndex, Number(day));
    return monthIndex >= 0 && date.getDate() === Number(day) ? date : null;
}

function toIsoDate(date) {
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part) => String(part).padStart(2, '0')).join('-');
}

// Today's date in India as YYYY-MM-DD.
function istDate(now) {
    return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function toRate(text) {
    return Math.round(Number(String(text || '').replace(/[^\d.]/g, '')));
}

// "2026-09-25" -> "Fri, 25 Sept 2026"
function formatDay(isoDate) {
    const [year, month, day] = isoDate.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return `${DAY_NAMES[date.getUTCDay()]}, ${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

// Indian digit grouping without relying on locale data: 157739 -> "₹1,57,739".
function formatRupees(amount) {
    const digits = String(Math.round(amount));
    const lastThree = digits.slice(-3);
    const rest = digits.slice(0, -3);
    return `₹${rest ? `${rest.replace(/\B(?=(\d{2})+$)/g, ',')},` : ''}${lastThree}`;
}
