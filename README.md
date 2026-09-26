
# A simple gold price drop notifier Chromium Extension 

Gold Price Drop Notifier is a Chrome extension that helps you stay up-to-date with the latest gold prices and notifies you when the gold price drops below your specified rate. Simply set your desired gold price in the extension settings and let it do the rest


## Setup

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and select this folder.
2. Open the popup, pick **24K** or **22K**, enter the rate (₹ per 10g) you want to buy at and click **Submit Rate**. Each purity keeps its own rate, and alerts follow the one you have selected.

No API key or account is needed.


## Backend ?

- Takes the 24K (999) and 22K (916) gold rates from [IBJA](https://ibjarates.com) (India Bullion and Jewellers Association), India's benchmark rate. It's in ₹ per 10g and includes import duty but not GST or making charges.
- IBJA publishes an AM rate around noon and a PM rate around 5-6 PM IST on working days. The extension checks every 3 hours using a `chrome.alarms` alarm (MV3 service workers are shut down when idle, so timers like `setInterval` don't survive) and shows the latest one.
- IBJA has no public API, so the rate is read from the ibjarates.com page. If the site changes its layout, the popup shows an error until the parser is updated.
- Users pick a purity and input a gold rate for it; these are saved in `chrome.storage.local` along with the latest rates.
- Whenever IBJA publishes a rate for the selected purity below the user given rate, the extension will send a notification that Gold Price Dropped.



## Functions
### Reading the IBJA rate

ibjarates.com shows today's rates in spans like `<span id="lblGold999_AM">` (24K) and `<span id="lblGold916_PM">` (22K). The PM spans are empty until IBJA publishes them, so the AM rates are used until then. Service workers have no `DOMParser`, so the spans are matched by id.

```javascript
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
```

### Notification Function

```javascript
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
```

### Sending notifications
The price is checked whenever IBJA publishes a new rate or the user changes their purity or rate, so each of those sends at most one notification.
```javascript
async function checkPriceDrop() {
    const { goldRates = {}, targetRates = {}, purity = '24K' } = await chrome.storage.local.get(['goldRates', 'targetRates', 'purity']);
    const goldRate = goldRates[purity];
    const targetRate = targetRates[purity];
    if (goldRate && targetRate && goldRate < targetRate) {
        priceDropAlertNotifi(purity, goldRate, targetRate);
    }
}
```
## 🚀 About Me
I'm a nothing 🥲
