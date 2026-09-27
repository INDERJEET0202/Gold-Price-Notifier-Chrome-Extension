const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('./fixtures');

const GOODBYE_URL = 'https://inderjeet0202.github.io/Gold-Price-Notifier-Chrome-Extension/goodbye.html';
const GOODBYE_FILE = path.join(__dirname, '..', 'docs', 'goodbye.html');

// The address each open tab last tried to load. Tests block DNS, so the goodbye page itself shows
// Chrome's error page, but the tab's history still has the address.
async function tabAddresses(context) {
    return Promise.all(context.pages().map(async (page) => {
        const { entries, currentIndex } = await (await context.newCDPSession(page)).send('Page.getNavigationHistory');
        return entries[currentIndex].url;
    }));
}

test.describe('goodbye page', () => {
    test('opens when the extension is removed', async ({ context, extension }) => {
        expect(await extension.serviceWorker.evaluate(() => GOODBYE_URL)).toBe(GOODBYE_URL);

        // The worker stops as the extension is removed, so the call itself never returns cleanly.
        await extension.serviceWorker.evaluate(() => chrome.management.uninstallSelf()).catch(() => {});

        await expect.poll(() => tabAddresses(context)).toContain(GOODBYE_URL);
    });

    test('is the docs/ page that GitHub Pages serves at that address', () => {
        // GitHub Pages serves docs/ at https://<owner>.github.io/<repo>/.
        expect(GOODBYE_URL).toMatch(/\/Gold-Price-Notifier-Chrome-Extension\/goodbye\.html$/);
        expect(fs.existsSync(GOODBYE_FILE)).toBe(true);
        expect(fs.existsSync(path.join(__dirname, '..', 'docs', 'logo.png'))).toBe(true);
    });

    for (const [colorScheme, width] of [['light', 1280], ['dark', 1280], ['light', 400]]) {
        test(`fits the window in ${colorScheme} mode at ${width}px`, async ({ context }) => {
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', (error) => errors.push(error.message));
            await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
            await page.setViewportSize({ width, height: 800 });
            await page.goto(pathToFileURL(GOODBYE_FILE).href);

            await expect(page.locator('h1')).toHaveText('Are you going?');
            await expect(page.locator('.hero img')).toHaveJSProperty('naturalWidth', 256);
            expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
            expect(errors).toEqual([]);
        });
    }

    test('each reason opens a pre-filled GitHub issue', async ({ context }) => {
        const page = await context.newPage();
        await page.goto(pathToFileURL(GOODBYE_FILE).href);

        const reasons = await page.locator('.chip').evaluateAll((links) => links.map((link) => ({
            text: link.textContent,
            url: new URL(link.href),
        })).map(({ text, url }) => ({
            text,
            origin: url.origin + url.pathname,
            title: url.searchParams.get('title'),
            body: url.searchParams.get('body'),
        })));
        expect(reasons).toHaveLength(6);
        for (const { text, origin, title, body } of reasons) {
            expect(origin).toBe('https://github.com/INDERJEET0202/Gold-Price-Notifier-Chrome-Extension/issues/new');
            expect(title).toBe(`Uninstall feedback: ${text}`);
            expect(body).toContain(`Why I removed the extension: ${text}`);
        }
        await expect(page.getByRole('link', { name: 'Reinstall' })).toHaveAttribute('href', /^https:\/\/chromewebstore\.google\.com\//);
    });
});
