# Privacy policy

**Gold Price Drop Notifier** (Chrome extension) · Last updated 27 September 2026

Gold Price Drop Notifier shows India's IBJA gold rate and alerts you when it drops below a price you choose. It has no account, no ads, no analytics and no tracking.

## What it stores

The extension keeps the following in Chrome's local extension storage (`chrome.storage.local`), on your computer only:

- the latest 24K and 22K gold rates (with IBJA's session and date), the last 10 working days of rates, and when the rate was last checked;
- the message of the last failed check, if any;
- your settings: the purity you selected, your alert prices, and whether to include GST;
- which alert prices have already sent a notification, so you get one alert per price drop.

This data never leaves your browser. It is not synced to your Google account, and it is deleted when you remove the extension.

## What it sends

To read the rate, the extension loads `https://ibjarates.com/`, the website of the India Bullion and Jewellers Association: about ten times on a working day and twice on a weekend day, only while Chrome is running. Like any web page visit, this request reaches ibjarates.com from your IP address with your browser's standard headers. The extension adds nothing to it: no identifiers, and none of your settings or alert prices.

Clicking a price alert or the ibjarates.com link opens that website in a tab, as a normal visit.

The extension contacts no other server.

## What it shares

Nothing. No data is sold, shared or transferred to anyone, and none is used for any purpose other than showing the rate and your alerts.

## Contact

Questions or concerns: open an issue at https://github.com/INDERJEET0202/Gold-Price-Notifier-Chrome-Extension/issues.
