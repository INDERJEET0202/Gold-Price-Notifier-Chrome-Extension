// The background service worker keeps the latest rates in chrome.storage.local,
// so the popup just renders storage and re-renders whenever it changes.
const STORAGE_KEYS = ['goldRates', 'rateSession', 'rateDate', 'rateHistory', 'lastFetched', 'lastError', 'purity', 'targetRates'];
const SAVED_FEEDBACK_MS = 1500;
const CHART_DAYS = 7;
// Matches the chart's viewBox in popup.html.
const CHART_WIDTH = 120;
const CHART_HEIGHT = 40;
const CHART_PADDING = 5; // Keeps the line and the end dot inside the chart.
const SVG_NS = 'http://www.w3.org/2000/svg';

document.addEventListener('DOMContentLoaded', runFunction);

async function runFunction() {
    document.getElementById('rate-form').addEventListener('submit', saveUserRate);
    document.querySelectorAll('input[name="purity"]').forEach((radio) => radio.addEventListener('change', savePurity));

    // Listen before the first read, so a fetch that finishes while the popup opens isn't missed.
    chrome.storage.onChanged.addListener(async (changes, areaName) => {
        if (areaName === 'local') {
            render(await chrome.storage.local.get(STORAGE_KEYS));
        }
    });

    const state = await chrome.storage.local.get(STORAGE_KEYS);
    const purity = state.purity || selectedPurity();
    document.getElementById(`purity-${purity}`).checked = true;
    fillUserInput(purity, state.targetRates);
    render(state);
}

function render({ goldRates = {}, rateSession, rateDate, rateHistory = [], lastFetched, lastError, targetRates = {} }) {
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
    renderTrend(goldRate ? rateHistory : [], purity, targetRate);

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

// rateHistory has one rate per working day, oldest first, and ends with the current rate.
function renderTrend(rateHistory, purity, targetRate) {
    const days = rateHistory.filter((day) => day.goldRates?.[purity] > 0).slice(-CHART_DAYS);
    const trend = document.getElementById('rate-trend');
    const chart = document.getElementById('rate-chart');
    trend.hidden = days.length < 2;
    chart.toggleAttribute('hidden', days.length < 2); // SVG elements have no .hidden property.
    if (days.length < 2) {
        return;
    }

    const rates = days.map((day) => day.goldRates[purity]);
    const [previous, latest] = rates.slice(-2);
    const change = latest - previous;
    const since = `since ${shortDay(days.at(-2).date, days.at(-1).date)}`;
    trend.classList.toggle('is-down', change < 0);
    trend.classList.toggle('is-up', change > 0);
    const percent = (Math.abs(change) / previous * 100).toFixed(2);
    trend.textContent = change === 0
        ? `No change ${since}`
        : `${change < 0 ? '▼' : '▲'} ${formatRupees(Math.abs(change))} (${percent}%) ${since}`;

    const showsTarget = drawChart(rates, targetRate);
    // Read out by screen readers and shown on hover, e.g. "24K, last 7 working days
    // (Thu, 17 Sept – Today): low ₹1,56,100, high ₹1,58,300. Dashed line: your alert price."
    const summary = `${purity}, last ${rates.length} working days (${formatDay(days[0].date)} – ${formatDay(days.at(-1).date)}): `
        + `low ${formatRupees(Math.min(...rates))}, high ${formatRupees(Math.max(...rates))}.`
        + (showsTarget ? ' Dashed line: your alert price.' : '');
    chart.setAttribute('aria-label', summary);
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = summary;
    chart.prepend(title);
}

// Draws the rates as a line over a shaded area, with the alert price as a dashed line when it
// is close enough to the rates to fit without flattening them. Returns whether it drew that line.
function drawChart(rates, targetRate) {
    const svg = document.getElementById('rate-chart');
    let low = Math.min(...rates);
    let high = Math.max(...rates);
    const reach = Math.max(high - low, low * 0.01);
    const showTarget = Boolean(targetRate) && targetRate >= low - reach && targetRate <= high + reach;
    if (showTarget) {
        low = Math.min(low, targetRate);
        high = Math.max(high, targetRate);
    }
    const x = (index) => CHART_PADDING + index * (CHART_WIDTH - 2 * CHART_PADDING) / (rates.length - 1);
    const y = (rate) => high === low
        ? CHART_HEIGHT / 2
        : CHART_PADDING + (high - rate) / (high - low) * (CHART_HEIGHT - 2 * CHART_PADDING);
    const points = rates.map((rate, index) => [x(index), y(rate)].map((n) => n.toFixed(1)).join(','));

    const shapes = [
        svgElement('path', { class: 'chart-area', d: `M${points.join(' L')} L${x(rates.length - 1)},${CHART_HEIGHT} L${x(0)},${CHART_HEIGHT} Z` }),
        svgElement('polyline', { class: 'chart-line', points: points.join(' ') }),
    ];
    if (showTarget) {
        shapes.push(svgElement('line', { class: 'chart-target', x1: 0, x2: CHART_WIDTH, y1: y(targetRate), y2: y(targetRate) }));
    }
    shapes.push(svgElement('circle', { class: 'chart-dot', cx: x(rates.length - 1), cy: y(rates.at(-1)), r: 3.5 }));
    svg.replaceChildren(...shapes);
    return showTarget;
}

function svgElement(name, attributes) {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
    }
    return element;
}

// "Thu" within the last week, otherwise "18 Sept".
function shortDay(day, latestDay) {
    const date = new Date(`${day}T00:00:00`);
    const daysBefore = Math.round((new Date(`${latestDay}T00:00:00`) - date) / 86400000);
    return date.toLocaleDateString('en-IN', daysBefore < 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' });
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
    return formatDay(rateDate ?? toIsoDay(new Date(lastFetched)));
}

// e.g. "2026-09-25" -> "Fri, 25 Sept", or "Today"
function formatDay(day) {
    if (day === toIsoDay(new Date())) {
        return 'Today';
    }
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
