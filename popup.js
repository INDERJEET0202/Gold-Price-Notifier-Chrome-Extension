// The background service worker keeps the latest rate in chrome.storage.local,
// so the popup just renders storage and re-renders whenever it changes.
const STORAGE_KEYS = ['apiKey', 'goldRate', 'lastFetched', 'lastError', 'targetRate'];

document.addEventListener('DOMContentLoaded', runFunction);

async function runFunction() {
    document.getElementById('rate-form').addEventListener('submit', saveUserRate);
    document.getElementById('open-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

    const state = await chrome.storage.local.get(STORAGE_KEYS);
    if (state.targetRate) {
        document.getElementById('user-input').value = state.targetRate;
    }
    render(state);

    chrome.storage.onChanged.addListener(async (changes, areaName) => {
        if (areaName === 'local') {
            render(await chrome.storage.local.get(STORAGE_KEYS));
        }
    });
}

function render({ apiKey, goldRate, lastFetched, lastError, targetRate }) {
    const loading = document.getElementById('loading');
    const priceElement = document.getElementById('price');
    const statusElement = document.getElementById('price-status');
    const priceElement2 = document.getElementById('price2');

    loading.hidden = Boolean(!apiKey || goldRate || lastError);
    document.getElementById('open-settings').hidden = Boolean(apiKey && !lastError);

    if (!apiKey) {
        priceElement.textContent = 'Add your free metalpriceapi.com API key in Settings to see the gold rate.';
    } else if (goldRate) {
        priceElement.textContent = `Gold rate in India today is ${formatRupees(goldRate)}/10g`;
    } else {
        priceElement.textContent = '';
    }

    if (lastError) {
        statusElement.textContent = `Couldn't update the gold rate: ${lastError}`;
    } else if (goldRate && lastFetched) {
        statusElement.textContent = `Updated ${new Date(lastFetched).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`;
    } else {
        statusElement.textContent = '';
    }

    priceElement2.textContent = targetRate
        ? `You will be informed when price will be below ${formatRupees(targetRate)}/10g.`
        : 'Enter a rate to get notified when gold drops below it.';
}

function saveUserRate(event) {
    event.preventDefault();
    const targetRate = Number(document.getElementById('user-input').value);
    if (targetRate > 0) {
        // background.js watches storage and checks the price as soon as this changes.
        chrome.storage.local.set({ targetRate });
    }
}
