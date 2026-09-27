// Shared by background.js (via importScripts) and popup.js.
const GST_RATE = 0.03; // GST on gold in India. IBJA's rates exclude it.

function formatRupees(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

// Rates and alert prices are stored without GST, as IBJA publishes them, so an alert keeps its
// meaning when the user switches. This is the amount to show for the user's choice.
function withGst(amount, includeGst) {
    return includeGst ? amount * (1 + GST_RATE) : amount;
}
