# Chrome Web Store listing

Everything to paste into the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) for this extension, tab by tab. The images in this folder are generated from the real popup with example rates by `npm run store-images`.

## Package

Run `npm run package` and upload `dist/gold-price-drop-notifier-<version>.zip` (Items → **New item**, or the **Package** tab for an update). The zip holds only the files Chrome loads; `tests/package.spec.js` checks that it's complete and that Chrome can run it.

## Store listing tab

**Name** and **summary** come from `manifest.json`:

- Name: Gold Price Drop Notifier
- Summary: India's IBJA gold rate for 24K and 22K on your toolbar, with a desktop alert when it drops below your target price.

**Description:**

```
Know the price of gold in India at a glance, and get told when it drops to the price you want to pay.

Gold Price Drop Notifier shows the IBJA (India Bullion and Jewellers Association) benchmark gold rate, the reference rate for gold across India.

FEATURES
• 24K (999) and 22K (916) gold rates, per 10 grams and per gram
• The rate on the toolbar icon (158K is about ₹1,58,000), green when it's below your alert price
• An alert price for each purity, with one desktop notification when the rate drops below it
• The change since the previous working day, and a chart of the last 7 working days
• Optional 3% GST, to see what you would actually pay
• Checks for new rates every hour around IBJA's publishing times (around noon and 5–6 PM IST) on working days
• On weekends and holidays, the last published rate with its date
• Light and dark mode

PRIVACY
No account, no ads, no tracking. Your alert prices stay in your browser, and the only site the extension contacts is ibjarates.com, to read the rate.

GOOD TO KNOW
• IBJA rates include import duty but not GST or making charges.
• Rates are for information only. Confirm the price with your jeweller before buying.
• Not affiliated with or endorsed by IBJA.

Open source: https://github.com/INDERJEET0202/Gold-Price-Notifier-Chrome-Extension
```

| Field | Value |
|---|---|
| Category | Lifestyle → Shopping |
| Language | English |
| Store icon | `logo128x128.png` (repo root) |
| Screenshots (1280×800) | `store/screenshot-1-rate.png`, `store/screenshot-2-alert.png`, `store/screenshot-3-dark-gst.png` |
| Small promo tile (440×280, required) | `store/promo-small.png` |
| Marquee promo tile (1400×560, optional) | `store/promo-marquee.png` |
| Homepage URL | https://github.com/INDERJEET0202/Gold-Price-Notifier-Chrome-Extension |
| Support URL | https://github.com/INDERJEET0202/Gold-Price-Notifier-Chrome-Extension/issues |

Leave **Official URL** empty; it needs a domain verified in Google Search Console.

## Privacy practices tab

**Single purpose:**

> Shows India's IBJA benchmark gold rate and notifies the user when the rate for their chosen purity drops below the price they set.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `alarms` | To check ibjarates.com for a new rate on a schedule: hourly around IBJA's publishing times on working days, and less often otherwise. The service worker isn't kept running, so a timer can't do this. |
| `notifications` | To show a desktop alert when the gold rate drops below the price the user set, which is the extension's purpose. |
| `storage` | To keep the latest rates, the last 10 working days of rates, the user's settings (purity, alert prices, GST choice) and which alerts were already sent, in the browser. Nothing is synced or sent anywhere. |
| Host permission `https://ibjarates.com/*`, `https://www.ibjarates.com/*` | To read the IBJA gold rate, which IBJA publishes only on this website. No other site is accessed. |

**Remote code:** No, I am not using remote code. All scripts are in the package; the page fetched from ibjarates.com is only read as text.

**Data usage:** tick none of the data types; the extension collects no user data. Tick all three certifications (no selling or transferring user data, no use unrelated to the single purpose, no use for creditworthiness or lending).

**Privacy policy URL:** https://github.com/INDERJEET0202/Gold-Price-Notifier-Chrome-Extension/blob/master/PRIVACY.md

## Distribution tab

- Payments: Free
- Visibility: Public
- Regions: All regions (the rates are Indian, but Indians abroad follow them too)

## Test instructions tab

Nothing needed: there is no login, and the extension works as soon as it's installed.
