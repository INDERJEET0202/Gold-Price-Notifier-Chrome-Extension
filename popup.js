// The background service worker keeps the latest rates in chrome.storage.local,
// so the popup just renders storage and re-renders whenever it changes.
const STORAGE_KEYS = ['goldRates', 'rateSession', 'rateDate', 'lastFetched', 'lastError', 'purity', 'targetRates'];
const SAVED_FEEDBACK_MS = 1500;

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

function render({ goldRates = {}, rateSession, rateDate, lastFetched, lastError, targetRates = {} }) {
    const purity = selectedPurity();
    const goldRate = goldRates[purity];
    const targetRate = targetRates[purity];

    const errorBanner = document.getElementById('error-banner');
    errorBanner.hidden = !lastError;
    errorBanner.textContent = lastError ? `Couldn't update the gold rate: ${lastError}` : '';

    // Until the first fetch finishes there is nothing to show but a placeholder.
    const loading = !goldRate && !lastError;
    document.getElementById('rate-loading').hidden = !loading;
    const rateValue = document.getElementById('rate-value');
    rateValue.hidden = loading;
    rateValue.textContent = goldRate ? formatRupees(goldRate) : '—';

    document.getElementById('rate-label').textContent = `${purity} gold · per 10 g`;
    const session = document.getElementById('rate-session');
    session.hidden = !goldRate;
    session.textContent = `IBJA ${rateSession} rate`;

    document.getElementById('rate-meta').textContent = goldRate && lastFetched ? `${publishedDay(rateDate, lastFetched)} · checked ${timeAgo(lastFetched)}` : '';

    const targetDiff = document.getElementById('target-diff');
    targetDiff.hidden = !(goldRate && targetRate);
    if (goldRate && targetRate) {
        const difference = goldRate - targetRate;
        targetDiff.classList.toggle('is-below', difference < 0);
        if (difference < 0) {
            targetDiff.textContent = `✓ ${formatRupees(-difference)} below your alert price`;
        } else if (difference === 0) {
            targetDiff.textContent = 'Right at your alert price';
        } else {
            targetDiff.textContent = `${formatRupees(difference)} above your alert price`;
        }
    }

    document.getElementById('user-input-label').textContent = `Alert me when ${purity} drops below`;
    document.getElementById('target-hint').textContent = targetRate
        ? `You'll get a notification when ${purity} is below ${formatRupees(targetRate)}.`
        : 'No alert set yet.';
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
        showSaved();
    }
}

function showSaved() {
    const button = document.getElementById('submit');
    button.textContent = 'Saved ✓';
    clearTimeout(showSaved.timer);
    showSaved.timer = setTimeout(() => {
        button.textContent = 'Set alert';
    }, SAVED_FEEDBACK_MS);
}

// rateDate (YYYY-MM-DD) is only set when IBJA had no rate for the day of the fetch (weekends and
// holidays) and an earlier day's rate was used. Otherwise the rate is from the day it was fetched.
function publishedDay(rateDate, lastFetched) {
    const day = rateDate ?? toIsoDay(new Date(lastFetched));
    if (day === toIsoDay(new Date())) {
        return 'Today';
    }
    // e.g. "2026-09-25" -> "Fri, 25 Sept"
    return new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function toIsoDay(date) {
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part) => String(part).padStart(2, '0')).join('-');
}

function timeAgo(timestamp) {
    const minutes = Math.round((Date.now() - timestamp) / 60000);
    if (minutes < 1) {
        return 'just now';
    }
    if (minutes < 60) {
        return `${minutes} min ago`;
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24) {
        return `${hours} h ago`;
    }
    const days = Math.round(hours / 24);
    return days === 1 ? '1 day ago' : `${days} days ago`;
}
