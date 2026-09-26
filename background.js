// MV3 service workers are shut down when idle, so nothing is kept in memory:
// all state lives in chrome.storage.local and the periodic refresh runs off chrome.alarms.

importScripts('format.js');

// IBJA (India Bullion and Jewellers Association) publishes India's benchmark gold rate
// twice each working day, an AM rate around noon and a PM rate around 5-6 PM IST.
const IBJA_URL = 'https://ibjarates.com/';
const REFRESH_ALARM = 'refresh-gold-rate';
const REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000; // Often enough to pick up both daily IBJA rates.
const ALARM_PERIOD_MINUTES = 60; // How often we wake up to check whether the rate is due for a refresh.
// The purities the popup offers, mapped to IBJA's fineness codes.
const PURITY_CODES = { '24K': '999', '22K': '916' };

chrome.runtime.setUninstallURL('https://thumbs.dreamstime.com/b/time-to-say-goodbye-message-pin-bulletin-board-64928665.jpg');

// Show users some information when they install or update the extension.
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.tabs.create({
            url: "https://e1.pxfuel.com/desktop-wallpaper/753/593/desktop-wallpaper-thank-you-top-beautiful-pics-ultra-jpg-you-are-the-best.jpg"
        });
    } else if (details.reason === 'update') {
        chrome.tabs.create({
            url: "https://github.com/INDERJEET0202/Gold-Price-Notifier-Chrome-Extension"
        });
    }
    ensureRefreshAlarm();
    refreshIfStale();
});

chrome.runtime.onStartup.addListener(() => {
    ensureRefreshAlarm();
    refreshIfStale();
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REFRESH_ALARM) {
        refreshIfStale();
    }
});

// The popup only writes the user's purity and rates to storage; check them as soon as they change.
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes.targetRates || changes.purity)) {
        checkPriceDrop();
    }
});

// Alarms usually survive browser restarts, but Chrome doesn't guarantee it.
async function ensureRefreshAlarm() {
    const alarm = await chrome.alarms.get(REFRESH_ALARM);
    if (!alarm) {
        await chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: ALARM_PERIOD_MINUTES });
    }
}

async function refreshIfStale() {
    const { lastFetched = 0 } = await chrome.storage.local.get('lastFetched');
    if (Date.now() - lastFetched >= REFRESH_INTERVAL_MS) {
        await refreshGoldRate();
    }
}

// Fetch today's 24K and 22K gold rates from ibjarates.com
async function refreshGoldRate() {
    try {
        const response = await fetch(IBJA_URL);
        if (!response.ok) {
            throw new Error(`ibjarates.com returned HTTP ${response.status}`);
        }
        const { goldRates, rateSession } = parseIbjaRates(await response.text());
        const { goldRates: previousRates = {}, purity = '24K' } = await chrome.storage.local.get(['goldRates', 'purity']);
        console.log(`Gold rates updated (IBJA ${rateSession}):`, goldRates);
        await chrome.storage.local.set({ goldRates, rateSession, lastFetched: Date.now(), lastError: null });
        // The page is polled every few hours, but IBJA only publishes twice a day,
        // so only alert when there is actually a new rate.
        if (goldRates[purity] !== previousRates[purity]) {
            await checkPriceDrop();
        }
    } catch (error) {
        console.error('Failed to fetch the gold rate:', error);
        await chrome.storage.local.set({ lastError: error.message });
    }
}

// ibjarates.com shows today's rates in spans like <span id="lblGold999_AM"> and
// <span id="lblGold916_PM">, in ₹ per 10 grams without GST. The PM spans stay empty
// until IBJA publishes them in the evening, so fall back to the AM rates until then.
// Service workers have no DOMParser, so the spans are matched by id.
function parseIbjaRates(html) {
    for (const rateSession of ['PM', 'AM']) {
        const goldRates = {};
        for (const [purity, code] of Object.entries(PURITY_CODES)) {
            const match = html.match(new RegExp(`id=["']lblGold${code}_${rateSession}["'][^>]*>([^<]*)<`));
            goldRates[purity] = match ? Math.round(Number(match[1].replace(/[^\d.]/g, ''))) : 0;
        }
        if (Object.values(goldRates).every((rate) => rate > 0)) {
            return { goldRates, rateSession };
        }
    }
    throw new Error('the 24K and 22K rates are missing from ibjarates.com (the page may have changed)');
}

// Runs whenever IBJA publishes a new rate or the user changes their purity or target,
// so each of those notifies at most once.
async function checkPriceDrop() {
    const { goldRates = {}, targetRates = {}, purity = '24K' } = await chrome.storage.local.get(['goldRates', 'targetRates', 'purity']);
    const goldRate = goldRates[purity];
    const targetRate = targetRates[purity];
    if (goldRate && targetRate && goldRate < targetRate) {
        priceDropAlertNotifi(purity, goldRate, targetRate);
    }
}

// This is the notification function which will be called when the gold price decreases.
function priceDropAlertNotifi(purity, goldRate, targetRate) {
    chrome.notifications.create('price-drop', {
        type: 'basic',
        iconUrl: 'Icons/logo.png',
        title: 'Gold Price Drop Alert',
        message: `${purity} gold is now ${formatRupees(goldRate)}/10g, below your rate of ${formatRupees(targetRate)}/10g. Buy Gold now!`
    }, function (notificationId) {
        console.log('Notification sent with ID:', notificationId);
    });
}
