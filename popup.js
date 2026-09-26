// The background service worker keeps the latest rates in chrome.storage.local,
// so the popup just renders storage and re-renders whenever it changes.
const STORAGE_KEYS = ['goldRates', 'rateSession', 'lastFetched', 'lastError', 'purity', 'targetRates'];

document.addEventListener('DOMContentLoaded', runFunction);

async function runFunction() {
    document.getElementById('rate-form').addEventListener('submit', saveUserRate);
    document.querySelectorAll('input[name="purity"]').forEach((radio) => radio.addEventListener('change', savePurity));

    const state = await chrome.storage.local.get(STORAGE_KEYS);
    const purity = state.purity || selectedPurity();
    document.getElementById(`purity-${purity}`).checked = true;
    fillUserInput(purity, state.targetRates);
    render(state);

    chrome.storage.onChanged.addListener(async (changes, areaName) => {
        if (areaName === 'local') {
            render(await chrome.storage.local.get(STORAGE_KEYS));
        }
    });
}

function render({ goldRates = {}, rateSession, lastFetched, lastError, targetRates = {} }) {
    const purity = selectedPurity();
    const goldRate = goldRates[purity];
    const targetRate = targetRates[purity];
    const loading = document.getElementById('loading');
    const priceElement = document.getElementById('price');
    const statusElement = document.getElementById('price-status');
    const priceElement2 = document.getElementById('price2');

    document.getElementById('user-input-label').textContent = `Your ${purity} gold rate (₹/10g):`;
    loading.hidden = Boolean(goldRate || lastError);
    priceElement.textContent = goldRate ? `${purity} gold rate in India today is ${formatRupees(goldRate)}/10g` : '';

    if (lastError) {
        statusElement.textContent = `Couldn't update the gold rate: ${lastError}`;
    } else if (goldRate && lastFetched) {
        const updated = new Date(lastFetched).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
        statusElement.textContent = `IBJA ${rateSession} rate, excl. GST · checked ${updated}`;
    } else {
        statusElement.textContent = '';
    }

    priceElement2.textContent = targetRate
        ? `You will be informed when ${purity} price will be below ${formatRupees(targetRate)}/10g.`
        : `Enter a rate to get notified when ${purity} gold drops below it.`;
}

function selectedPurity() {
    return document.querySelector('input[name="purity"]:checked').value;
}

// Each purity keeps its own target, so show the one for the purity being viewed.
function fillUserInput(purity, targetRates = {}) {
    document.getElementById('user-input').value = targetRates[purity] || '';
}

async function savePurity() {
    const purity = selectedPurity();
    const { targetRates } = await chrome.storage.local.get('targetRates');
    fillUserInput(purity, targetRates);
    // background.js watches storage and checks the price for the new purity.
    await chrome.storage.local.set({ purity });
}

async function saveUserRate(event) {
    event.preventDefault();
    const targetRate = Number(document.getElementById('user-input').value);
    if (targetRate > 0) {
        const { targetRates = {} } = await chrome.storage.local.get('targetRates');
        // background.js watches storage and checks the price as soon as this changes.
        await chrome.storage.local.set({ targetRates: { ...targetRates, [selectedPurity()]: targetRate } });
    }
}
