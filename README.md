
# A simple gold price drop notifier Chromium Extension 

Gold Price Drop Notifier is a Chrome extension that helps you stay up-to-date with the latest gold prices and notifies you when the gold price drops below your specified rate. Simply set your desired gold price in the extension settings and let it do the rest


## Setup

1. Get a free API key from [metalpriceAPI](https://metalpriceapi.com).
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and select this folder.
3. The settings page opens on install (or right-click the extension icon → **Options**). Paste your API key and save.
4. Open the popup, enter the rate (₹ per 10g) you want to buy at and click **Submit Rate**.


## Backend ?

- Takes current Gold Rates from [metalpriceAPI](https://metalpriceapi.com) once a day, using a `chrome.alarms` alarm (MV3 service workers are shut down when idle, so timers like `setInterval` don't survive).
- The rate is converted to ₹ per 10g including 3% GST. It's derived from the international spot price, so it doesn't include Indian import duty and will be a little below jewellers' rates.
- Users have to input a gold rate; it's saved in `chrome.storage.local` along with the latest rate.
- Whenever the gold rate drops below the user given rate, the extension will send a notification that Gold Price Dropped.



## Functions
### Converting the API response

With `base=INR` the API returns how many troy ounces of gold ₹1 buys, so the value is inverted to get ₹ per ounce and then converted to ₹ per 10 grams.

```javascript
function toRupeesPer10Grams(ouncesPerRupee) {
    const rupeesPerGram = 1 / ouncesPerRupee / GRAMS_PER_TROY_OUNCE;
    return Math.round(rupeesPerGram * 10 * (1 + GST_RATE));
}
```

### Notification Function

```javascript
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
```

### Sending notifications
The price is checked whenever a new rate is fetched or the user changes their rate, so each of those sends at most one notification.
```javascript
async function checkPriceDrop() {
    const { goldRate, targetRate } = await chrome.storage.local.get(['goldRate', 'targetRate']);
    if (goldRate && targetRate && goldRate < targetRate) {
        priceDropAlertNotifi(goldRate, targetRate);
    }
}
```
## 🚀 About Me
I'm a nothing 🥲
