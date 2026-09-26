// Shared by background.js (via importScripts) and popup.js.
function formatRupees(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}
