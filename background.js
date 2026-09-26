// MV3 service workers are shut down when idle, so nothing is kept in memory:
// all state lives in chrome.storage.local and the daily refresh runs off chrome.alarms.

importScripts('format.js');

const API_URL = 'https://api.metalpriceapi.com/v1/latest';
const GRAMS_PER_TROY_OUNCE = 31.1034768;
const GST_RATE = 0.03;
const REFRESH_ALARM = 'refresh-gold-rate';
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // The gold rate is fetched once a day.
const ALARM_PERIOD_MINUTES = 60; // How often we wake up to check whether the rate is due for a refresh.

chrome.runtime.setUninstallURL('https://thumbs.dreamstime.com/b/time-to-say-goodbye-message-pin-bulletin-board-64928665.jpg');

// Show users some information when they install or update the extension.
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.tabs.create({
            url: "https://e1.pxfuel.com/desktop-wallpaper/753/593/desktop-wallpaper-thank-you-top-beautiful-pics-ultra-jpg-you-are-the-best.jpg"
        });
        // Without an API key there is no rate to show, so ask for one straight away.
        chrome.runtime.openOptionsPage();
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

// The popup and options page only write to storage; react to what they changed.
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.apiKey) {
        refreshGoldRate();
    } else if (changes.targetRate) {
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

// Fetch gold rates from metalpriceapi.com
async function refreshGoldRate() {
    const { apiKey } = await chrome.storage.local.get('apiKey');
    if (!apiKey) return;

    try {
        const url = `${API_URL}?api_key=${encodeURIComponent(apiKey)}&base=INR&currencies=XAU`;
        const response = await fetch(url);
        const data = await response.json();
        // rates.INRXAU is ₹ per troy ounce. rates.XAU is its inverse (ounces per ₹1) but is
        // rounded to 8 decimal places, which leaves only 2-3 significant digits, so it's a fallback.
        const rupeesPerOunce = data.rates?.INRXAU ?? 1 / data.rates?.XAU;
        if (data.success === false || !(Number.isFinite(rupeesPerOunce) && rupeesPerOunce > 0)) {
            throw new Error(data.error?.message || data.error?.info || `Unexpected response from metalpriceapi.com (HTTP ${response.status})`);
        }
        const goldRate = toRupeesPer10Grams(rupeesPerOunce);
        console.log('Gold rate updated:', goldRate);
        await chrome.storage.local.set({ goldRate, lastFetched: Date.now(), lastError: null });
        await checkPriceDrop();
    } catch (error) {
        console.error('Failed to fetch the gold rate:', error);
        await chrome.storage.local.set({ lastError: error.message });
    }
}

// Converts the international ₹ per troy ounce price to ₹ per 10 grams including GST.
function toRupeesPer10Grams(rupeesPerOunce) {
    const rupeesPerGram = rupeesPerOunce / GRAMS_PER_TROY_OUNCE;
    return Math.round(rupeesPerGram * 10 * (1 + GST_RATE));
}

// Runs whenever a new rate is fetched (once a day) or the user changes their target,
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
        message: `Gold is now ${formatRupees(goldRate)}/10g, below your rate of ${formatRupees(targetRate)}/10g. Buy Gold now!`
    }, function (notificationId) {
        console.log('Notification sent with ID:', notificationId);
    });
}
