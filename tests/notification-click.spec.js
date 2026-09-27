const { test, expect } = require('./fixtures');

// Chrome can't click a desktop notification in a test, so these call the worker's click handler,
// the function registered with chrome.notifications.onClicked.
const ibjaTabs = (extension) => extension.serviceWorker.evaluate(async () =>
    (await chrome.tabs.query({ url: 'https://ibjarates.com/*' })).map((tab) => tab.pendingUrl || tab.url));

test.describe('clicking a price alert', () => {
    test('opens ibjarates.com and dismisses the alert', async ({ extension }) => {
        await extension.setStorage({ goldRates: { '24K': 157739, '22K': 144489 }, targetRates: { '24K': 158000 } });
        await expect.poll(() => extension.serviceWorker.evaluate(() => chrome.notifications.getAll())).toHaveProperty('price-drop');

        await extension.serviceWorker.evaluate(() => openIbjaFromNotification('price-drop'));

        // The tab can't load (the tests block DNS), but it was opened on ibjarates.com.
        await expect.poll(() => ibjaTabs(extension)).toEqual(['https://ibjarates.com/']);
        await expect.poll(() => extension.serviceWorker.evaluate(() => chrome.notifications.getAll())).toEqual({});
    });

    test('ignores clicks on notifications that are not price alerts', async ({ extension }) => {
        await extension.serviceWorker.evaluate(() => openIbjaFromNotification('something-else'));
        await extension.settle();

        expect(await ibjaTabs(extension)).toEqual([]);
    });

    test('is wired to chrome.notifications.onClicked', async ({ extension }) => {
        expect(await extension.serviceWorker.evaluate(() => chrome.notifications.onClicked.hasListener(openIbjaFromNotification))).toBe(true);
    });
});
