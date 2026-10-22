# Email alerts (optional)

Get an **email** when India's IBJA gold rate drops below your price, even when your laptop and Chrome are off.

This is a small Google Apps Script: a program that runs for free on Google's servers under your own Google account. It sends the email from your Gmail to you, so there's no password or API key to set up. It's separate from the Chrome extension, which keeps showing desktop notifications as before.

## Set it up (about 5 minutes)

1. Go to [script.google.com](https://script.google.com), sign in with the Google account that should get the emails, and click **New project**.
2. Delete the sample code in `Code.gs`. Paste in everything from [`gold-price-alert.gs`](gold-price-alert.gs). On GitHub, open the file and click the **Copy raw file** button at the top right.
3. At the top of the script, fill in your alert price in `ALERT_PRICES`. It's in ₹ per 10 g **without GST**, the number the extension shows with "Include 3% GST" off. For example:
   ```js
   const ALERT_PRICES = {
       '24K': 155000,
       '22K': 0,
   };
   ```
   Leave `0` for a purity you don't want alerts for.
4. Click **Untitled project** at the top and rename it to *Gold price alerts*. Then click **Save** (the disk icon).
5. In the toolbar, pick **setup** from the function menu and click **Run**.
6. Google asks for permission. Click **Review permissions**, choose your account, then **Advanced** → **Go to Gold price alerts (unsafe)** → **Allow**.
   - The "Google hasn't verified this app" warning appears for every script you write yourself. This one is your own copy, in your own account.
   - It asks to connect to an external service (ibjarates.com, to read the rate), to send email as you, and to run when you're not there (the hourly check).
7. Check your inbox for **"Gold price alerts are on"**, with today's rates. That's it.

If step 5 shows a red error instead, copy the **Execution log** and send it over. The most likely cause is that ibjarates.com doesn't answer Google's servers.

## Everyday use

| To… | Do this |
|---|---|
| Change your alert price | Edit `ALERT_PRICES` and click **Save**. There's no need to run setup again. |
| Check the rate now | Pick **checkNow** and click **Run**. The log shows the rate, and you get an email only if there's a new drop. |
| Stop the emails | Run **turnOff**. Run **setup** to start again. |
| Send them to another address | Set `EMAIL_TO`, for example `'me@example.com'`, and save. |

## How it behaves

- **When it checks:** every hour, Monday to Friday, 11 AM to 8 PM IST. IBJA publishes around noon and 5–6 PM on working days, and nothing at night or at weekends. Google runs hourly scripts at some minute within each hour.
- **One email per drop:** the same rule as the extension. You get another email only after the rate goes back up to your price and drops below it again, or when you change your price.
- **No silent failures:** if the script can't read ibjarates.com for a whole working day (9 checks in a row), it emails you once to say so.
- **What the email contains:** the rate, IBJA's AM or PM session and the date, the price with 3% GST, the price per gram, and a link to ibjarates.com.
- **Separate from the extension:** the alert prices here and in the extension don't sync, so set both.
- **Gmail limits:** a personal account can send 100 emails a day, and this sends a few at most.
- **Your settings:** your alert prices stay in your copy of the script. The copy in this repo has none filled in.
