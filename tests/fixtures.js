// Shared test setup: loads the unpacked extension into Chromium and gives each test helpers to
// serve fake ibjarates.com pages, read and write storage, and open the popup.
const path = require('path');
const { test: base, expect, chromium } = require('@playwright/test');

const EXTENSION_PATH = path.join(__dirname, '..');

function launchBrowser(userDataDir) {
    return chromium.launchPersistentContext(userDataDir, {
        channel: 'chromium', // Extensions only load in Chromium's new headless mode.
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            // Block all DNS so nothing, including the extension's own fetch on install, reaches
            // the real ibjarates.com. Tests serve fake pages with serveIbja() instead.
            '--host-resolver-rules=MAP * ~NOTFOUND',
        ],
    });
}

const isExtensionWorker = (worker) => worker.url().endsWith('/background.js');

// Under load, Playwright sometimes misses a service worker that starts while the browser is
// launching and never reports it, although it is running. Restarting the worker from
// chrome://serviceworker-internals makes Playwright attach to it.
async function findServiceWorker(context) {
    const reported = () => context.waitForEvent('serviceworker', { predicate: isExtensionWorker, timeout: 10_000 });
    const worker = context.serviceWorkers().find(isExtensionWorker) ?? await reported().catch(() => null);
    if (worker) {
        return worker;
    }
    const internals = await context.newPage();
    await internals.goto('chrome://serviceworker-internals/');
    await internals.getByRole('button', { name: 'Stop', exact: true }).click();
    const restarted = reported();
    await internals.getByRole('button', { name: 'Start', exact: true }).click();
    const restartedWorker = await restarted;
    await internals.close();
    return restartedWorker;
}

class Extension {
    constructor(context, serviceWorker) {
        this.context = context;
        this.serviceWorker = serviceWorker;
        this.id = serviceWorker.url().split('/')[2];
        this.pageErrors = [];
    }

    static async attach(context) {
        const serviceWorker = await findServiceWorker(context);
        // Playwright can reach the worker before Chrome has set up the chrome.* APIs and run
        // background.js, so wait until both are there.
        await expect.poll(() => serviceWorker.evaluate(() => Boolean(self.chrome?.notifications) && typeof checkPriceDrop === 'function')).toBe(true);
        const extension = new Extension(context, serviceWorker);
        await extension.recordNotifications();
        return extension;
    }

    // Waits for the fetch the extension makes on install (which fails, as DNS is blocked),
    // then clears storage so every test starts from nothing.
    async reset() {
        await expect.poll(async () => (await this.storage()).lastError ?? null).not.toBeNull();
        await this.serviceWorker.evaluate(() => chrome.storage.local.clear());
    }

    // Makes the extension's fetch('https://ibjarates.com/') return `html`. Other URLs pass
    // through, because chrome.notifications loads its icon with fetch too.
    async serveIbja(html, status = 200) {
        await this.serviceWorker.evaluate(({ html, status }) => {
            self.realFetch ??= self.fetch;
            self.ibjaRequests ??= [];
            self.fetch = async (url, ...rest) => {
                if (!String(url).includes('ibjarates.com')) {
                    return self.realFetch(url, ...rest);
                }
                self.ibjaRequests.push(String(url));
                return new Response(html, { status });
            };
        }, { html, status });
    }

    ibjaRequests() {
        return this.serviceWorker.evaluate(() => self.ibjaRequests ?? []);
    }

    // Runs the extension's own refresh, as the hourly alarm would, optionally as if the clock
    // read `now` (an ISO string or ms).
    async refresh(now = Date.now()) {
        await this.serviceWorker.evaluate((now) => refreshGoldRate(now), new Date(now).getTime());
    }

    // Runs the extension's staleness check as if the clock read `now` (an ISO string or ms).
    async refreshIfStale(now = Date.now()) {
        await this.serviceWorker.evaluate((now) => refreshIfStale(now), new Date(now).getTime());
    }

    storage() {
        return this.serviceWorker.evaluate(() => chrome.storage.local.get(null));
    }

    // Replaces everything in storage, e.g. to render a popup state without fetching.
    async setStorage(values) {
        await this.serviceWorker.evaluate(async (values) => {
            await chrome.storage.local.clear();
            await chrome.storage.local.set(values);
        }, values);
    }

    // Changes some keys, like the popup does when the user saves a target or switches purity.
    async updateStorage(values) {
        await this.serviceWorker.evaluate((values) => chrome.storage.local.set(values), values);
    }

    alarms() {
        return this.serviceWorker.evaluate(() => chrome.alarms.getAll());
    }

    async recordNotifications() {
        await this.serviceWorker.evaluate(() => {
            self.notificationMessages = [];
            const create = chrome.notifications.create.bind(chrome.notifications);
            chrome.notifications.create = (id, options, callback) => {
                self.notificationMessages.push(options.message);
                return create(id, options, callback);
            };
        });
    }

    // Messages of the notifications sent since the last clearNotifications().
    notifications() {
        return this.serviceWorker.evaluate(() => self.notificationMessages);
    }

    async clearNotifications() {
        await this.serviceWorker.evaluate(() => {
            self.notificationMessages = [];
        });
    }

    // Gives storage listeners time to run before checking that something did *not* happen.
    async settle() {
        await this.serviceWorker.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
    }

    openPopup({ colorScheme = 'light' } = {}) {
        return this.openPage('popup.html', { colorScheme, width: 376 });
    }

    async openPage(path, { colorScheme = 'light', width = 1280 } = {}) {
        const page = await this.context.newPage();
        page.on('pageerror', (error) => this.pageErrors.push(error.message));
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await page.setViewportSize({ width, height: 600 });
        await page.goto(`chrome-extension://${this.id}/${path}`);
        return page;
    }
}

const test = base.extend({
    userDataDir: async ({}, use, testInfo) => {
        await use(testInfo.outputPath('profile'));
    },
    context: async ({ userDataDir }, use) => {
        const context = await launchBrowser(userDataDir);
        await use(context);
        await context.close();
    },
    extension: async ({ context }, use) => {
        const extension = await Extension.attach(context);
        await extension.reset();
        await use(extension);
        expect(extension.pageErrors, 'errors thrown in the popup').toEqual([]);
    },
});

module.exports = { test, expect, launchBrowser, Extension };
