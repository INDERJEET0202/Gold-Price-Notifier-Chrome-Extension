// MV3 service workers are shut down when idle, so nothing is kept in memory:
// all state lives in chrome.storage.local and the periodic refresh runs off chrome.alarms.

importScripts('format.js');

// IBJA (India Bullion and Jewellers Association) publishes India's benchmark gold rate
// twice each working day, an AM rate around noon and a PM rate around 5-6 PM IST.
const IBJA_URL = 'https://ibjarates.com/';
const REFRESH_ALARM = 'refresh-gold-rate';
const REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000; // Often enough to pick up both daily IBJA rates.
const ALARM_PERIOD_MINUTES = 60; // How often we wake up to check whether the rate is due for a refresh.

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

// The popup only writes the user's rate to storage; check it as soon as it changes.
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.targetRate) {
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

// Fetch today's 24K gold rate from ibjarates.com
async function refreshGoldRate() {
    try {
        const response = await fetch(IBJA_URL);
        if (!response.ok) {
            throw new Error(`ibjarates.com returned HTTP ${response.status}`);
        }
        const { goldRate, rateSession } = parseIbjaRate(await response.text());
        const { goldRate: previousRate } = await chrome.storage.local.get('goldRate');
        console.log(`Gold rate updated: ${goldRate} (IBJA ${rateSession})`);
        await chrome.storage.local.set({ goldRate, rateSession, lastFetched: Date.now(), lastError: null });
        // The page is polled every few hours, but IBJA only publishes twice a day,
        // so only alert when there is actually a new rate.
        if (goldRate !== previousRate) {
            await checkPriceDrop();
        }
    } catch (error) {
        console.error('Failed to fetch the gold rate:', error);
        await chrome.storage.local.set({ lastError: error.message });
    }
}

// ibjarates.com shows today's 999 (24K) rates in <span id="lblGold999_AM"> and
// <span id="lblGold999_PM">, in ₹ per 10 grams without GST. The PM span stays empty
// until IBJA publishes it in the evening, so fall back to the AM rate until then.
// Service workers have no DOMParser, so the spans are matched by id.
function parseIbjaRate(html) {
    for (const rateSession of ['PM', 'AM']) {
        const match = html.match(new RegExp(`id=["']lblGold999_${rateSession}["'][^>]*>([^<]*)<`));
        const rate = match ? Number(match[1].replace(/[^\d.]/g, '')) : 0;
        if (rate > 0) {
            return { goldRate: Math.round(rate), rateSession };
        }
    }
    throw new Error('the 24K rate is missing from ibjarates.com (the page may have changed)');
}

// Runs whenever IBJA publishes a new rate or the user changes their target,
// so each of those notifies at most once.
async function checkPriceDrop() {
    const { goldRate, targetRate } = await chrome.storage.local.get(['goldRate', 'targetRate']);
    if (goldRate && targetRate && goldRate < targetRate) {
        priceDropAlertNotifi(goldRate, targetRate);
    }
}

// This is the notification function which will be called when the gold price decreases.
function priceDropAlertNotifi(goldRate, targetRate) {
    chrome.notifications.create('price-drop', {
        type: 'basic',
        iconUrl: 'Icons/logo.png',
        title: 'Gold Price Drop Alert',
        message: `24K gold is now ${formatRupees(goldRate)}/10g, below your rate of ${formatRupees(targetRate)}/10g. Buy Gold now!`
    }, function (notificationId) {
        console.log('Notification sent with ID:', notificationId);
    });
}
