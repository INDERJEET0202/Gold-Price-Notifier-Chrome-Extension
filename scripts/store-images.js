// Generates the Chrome Web Store images in store/ from the real popup: `npm run store-images`.
// Screenshots are 1280x800, the small promo tile 440x280 and the marquee 1400x560, as the store
// requires. The popup shows example rates (DNS is blocked, so nothing reaches ibjarates.com).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'store');
const ICON = `data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'Icons/logo.png')).toString('base64')}`;

// The last 8 weekdays ending today, with example 24K and 22K rates.
function exampleHistory() {
    const rates = [[155000, 142000], [156100, 143000], [156900, 143700], [157400, 144200], [158300, 145000], [157800, 144600], [158159, 144900], [157739, 144489]];
    const days = [];
    for (const date = new Date(); days.length < rates.length; date.setDate(date.getDate() - 1)) {
        if (days.length === 0 || (date.getDay() !== 0 && date.getDay() !== 6)) {
            days.unshift(date.toLocaleDateString('en-CA')); // YYYY-MM-DD in local time.
        }
    }
    return days.map((date, i) => ({ date, goldRates: { '24K': rates[i][0], '22K': rates[i][1] } }));
}

const SCENES = {
    rate: { purity: '24K', targetRates: { '24K': 155000 }, colorScheme: 'light' },
    alert: { purity: '24K', targetRates: { '24K': 158000 }, colorScheme: 'light' },
    dark: { purity: '22K', targetRates: { '22K': 150000 }, includeGst: true, colorScheme: 'dark' },
};

async function popupImages() {
    const extensionPath = ROOT;
    const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'store-images-')), {
        channel: 'chromium',
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--host-resolver-rules=MAP * ~NOTFOUND'],
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = worker.url().split('/')[2];
    // Let the install-time fetch fail (DNS is blocked) before writing the example state.
    for (let i = 0; i < 50 && !(await worker.evaluate(() => chrome.storage.local.get('lastError'))).lastError; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const images = {};
    for (const [name, { colorScheme, ...settings }] of Object.entries(SCENES)) {
        const rateHistory = exampleHistory();
        await worker.evaluate(async (state) => {
            await chrome.storage.local.clear();
            await chrome.storage.local.set(state);
        }, { goldRates: rateHistory.at(-1).goldRates, rateSession: 'PM', rateDate: null, rateHistory, lastFetched: Date.now() - 5 * 60 * 1000, lastError: null, ...settings });
        const page = await context.newPage({ deviceScaleFactor: 2 });
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await page.setViewportSize({ width: 376, height: 600 });
        await page.goto(`chrome-extension://${id}/popup.html`);
        await page.waitForSelector('#rate-value:not([hidden])');
        const height = await page.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
        images[name] = `data:image/png;base64,${(await page.screenshot({ clip: { x: 0, y: 0, width: 376, height } })).toString('base64')}`;
        await page.close();
    }
    await context.close();
    return images;
}

const BASE_CSS = `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    .canvas { position: relative; display: flex; align-items: center; overflow: hidden; }
    .light { background: radial-gradient(circle at 80% 20%, #fff7e6 0%, #f3e6cc 45%, #e8d2a6 100%); color: #1c1917; }
    .dark { background: radial-gradient(circle at 80% 20%, #2b241a 0%, #16130f 55%, #0b0a09 100%); color: #f5f2ed; }
    .muted { opacity: 0.72; }
    .popup { border-radius: 26px; box-shadow: 0 30px 80px rgba(60, 40, 10, 0.28), 0 4px 14px rgba(60, 40, 10, 0.12); }
    .dark .popup { box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6); }
    .brand { display: flex; align-items: center; gap: 14px; font-weight: 700; }
`;

function screenshotHtml({ theme, headline, text, popup, extra = '' }) {
    return `<style>${BASE_CSS}
        .canvas { width: 1280px; height: 800px; padding: 0 110px; gap: 80px; }
        .copy { flex: 1; }
        .brand { font-size: 22px; margin-bottom: 36px; }
        .brand img { width: 52px; height: 52px; }
        h1 { margin: 0 0 22px; font-size: 54px; line-height: 1.1; letter-spacing: -0.02em; }
        p { margin: 0; font-size: 24px; line-height: 1.45; }
        .popup { width: 376px; flex-shrink: 0; }
    </style>
    <div class="canvas ${theme}">
        <div class="copy">
            <div class="brand"><img src="${ICON}" alt="">Gold Price Drop Notifier</div>
            <h1>${headline}</h1>
            <p class="muted">${text}</p>
            ${extra}
        </div>
        <img class="popup" src="${popup}" alt="">
    </div>`;
}

// An illustration of the desktop alert, with the extension's real notification text.
const notificationCard = `
    <div style="margin-top: 40px; width: 460px; padding: 18px; display: flex; gap: 14px;
                border-radius: 16px; background: #ffffff; color: #1c1917; box-shadow: 0 20px 50px rgba(60, 40, 10, 0.22);">
        <img src="${ICON}" alt="" style="width: 56px; height: 56px; flex-shrink: 0;">
        <div style="font-size: 15px; line-height: 1.4;">
            <div style="font-weight: 700; margin-bottom: 4px;">Gold Price Drop Alert</div>
            24K gold is now ₹1,57,739/10g, below your rate of ₹1,58,000/10g. Buy Gold now!
        </div>
    </div>`;

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    const popups = await popupImages();
    const pages = {
        'screenshot-1-rate.png': [1280, 800, screenshotHtml({
            theme: 'light',
            headline: "India's gold rate, one click away",
            text: "24K and 22K rates from IBJA, India's benchmark, with the day's change and a 7-day trend.",
            popup: popups.rate,
        })],
        'screenshot-2-alert.png': [1280, 800, screenshotHtml({
            theme: 'light',
            headline: 'Get an alert when gold gets cheaper',
            text: 'Set the price you want to buy at. You get one desktop notification when the rate drops below it.',
            popup: popups.alert,
            extra: notificationCard,
        })],
        'screenshot-3-dark-gst.png': [1280, 800, screenshotHtml({
            theme: 'dark',
            headline: 'With GST, per gram, in dark mode',
            text: 'Switch on 3% GST to see what you would pay. Follows your light or dark theme.',
            popup: popups.dark,
        })],
        'promo-small.png': [440, 280, `<style>${BASE_CSS}
            .canvas { width: 440px; height: 280px; flex-direction: column; justify-content: center; text-align: center; gap: 14px; }
            .canvas img { width: 96px; height: 96px; }
            h1 { margin: 0; font-size: 28px; letter-spacing: -0.01em; }
            p { margin: 0; font-size: 17px; }
        </style>
        <div class="canvas light"><img src="${ICON}" alt=""><h1>Gold Price Drop Notifier</h1><p class="muted">IBJA gold rate &amp; price-drop alerts</p></div>`],
        'promo-marquee.png': [1400, 560, `<style>${BASE_CSS}
            .canvas { width: 1400px; height: 560px; padding: 0 120px; gap: 70px; }
            .copy { flex: 1; }
            .copy img { width: 120px; height: 120px; margin-bottom: 26px; }
            h1 { margin: 0 0 16px; font-size: 60px; letter-spacing: -0.02em; line-height: 1.05; }
            p { margin: 0; font-size: 26px; }
            .popup { width: 376px; margin-top: 190px; }
        </style>
        <div class="canvas light">
            <div class="copy"><img src="${ICON}" alt=""><h1>Gold Price Drop Notifier</h1><p class="muted">India's IBJA gold rate, with an alert when it drops.</p></div>
            <img class="popup" src="${popups.alert}" alt="">
        </div>`],
    };

    const browser = await chromium.launch();
    for (const [file, [width, height, html]] of Object.entries(pages)) {
        const page = await browser.newPage({ viewport: { width, height } });
        await page.setContent(html);
        await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
        await page.screenshot({ path: path.join(OUT, file) });
        await page.close();
        console.log(`store/${file} (${width}x${height})`);
    }
    await browser.close();
}

main();
