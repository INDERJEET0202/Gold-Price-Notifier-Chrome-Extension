const { test, expect } = require('./fixtures');
const { ibjaPage } = require('./ibja-pages');

const pmRates = (rate999, rate916) => ibjaPage({ pm: { 999: String(rate999), 916: String(rate916) } });
const alert24K = (rate, target) => `24K gold is now ${rate}/10g, below your rate of ${target}/10g. Buy Gold now!`;
const alert22K = (rate, target) => `22K gold is now ${rate}/10g, below your rate of ${target}/10g. Buy Gold now!`;

test.describe('price-drop notifications', () => {
    test('are not sent without an alert price', async ({ extension }) => {
        await extension.serveIbja(pmRates(157739, 144489));
        await extension.refresh();

        expect(await extension.notifications()).toEqual([]);
    });

    test('are sent when the rate drops below the alert price', async ({ extension }) => {
        await extension.setStorage({ targetRates: { '24K': 158000 } });
        await extension.serveIbja(pmRates(157739, 144489));
        await extension.refresh();

        expect(await extension.notifications()).toEqual([alert24K('₹1,57,739', '₹1,58,000')]);
        // A real Chrome notification appears once Chrome has loaded its icon.
        await expect.poll(() => extension.serviceWorker.evaluate(() => chrome.notifications.getAll())).toHaveProperty('price-drop');
    });

    test('are sent once per dip, not for every new rate while the price stays below', async ({ extension }) => {
        await extension.setStorage({ targetRates: { '24K': 158000 } });
        await extension.serveIbja(pmRates(157739, 144489));
        await extension.refresh();
        await extension.refresh(); // Same rate fetched again.
        await extension.serveIbja(pmRates(157200, 144000));
        await extension.refresh(); // IBJA publishes an even lower rate.

        expect(await extension.notifications()).toEqual([alert24K('₹1,57,739', '₹1,58,000')]);
    });

    test('are sent again when the price recovers and then drops again', async ({ extension }) => {
        await extension.setStorage({ targetRates: { '24K': 158000 } });
        await extension.serveIbja(pmRates(157739, 144489));
        await extension.refresh();
        await extension.serveIbja(pmRates(158000, 144700)); // Back at the alert price: the dip is over.
        await extension.refresh();
        await extension.serveIbja(pmRates(157500, 144300));
        await extension.refresh();

        expect(await extension.notifications()).toEqual([
            alert24K('₹1,57,739', '₹1,58,000'),
            alert24K('₹1,57,500', '₹1,58,000'),
        ]);
    });

    test('are not sent when the rate is at or above the alert price', async ({ extension }) => {
        await extension.setStorage({ targetRates: { '24K': 157739 } });
        await extension.serveIbja(pmRates(157739, 144489));
        await extension.refresh();
        await extension.serveIbja(pmRates(158200, 145000));
        await extension.refresh();

        expect(await extension.notifications()).toEqual([]);
    });

    test('follow the selected purity', async ({ extension }) => {
        await extension.setStorage({ purity: '24K', targetRates: { '24K': 150000, '22K': 145000 } });
        await extension.serveIbja(pmRates(157739, 144489)); // Only 22K is below its alert price.
        await extension.refresh();

        expect(await extension.notifications()).toEqual([]);
    });

    test('are sent straight away when a saved alert price is already above the rate', async ({ extension }) => {
        await extension.setStorage({ goldRates: { '24K': 157739, '22K': 144489 }, rateSession: 'PM', lastFetched: Date.now() });
        await extension.updateStorage({ targetRates: { '24K': 160000 } });

        await expect.poll(() => extension.notifications()).toEqual([alert24K('₹1,57,739', '₹1,60,000')]);
    });

    test('are sent again when a new alert price is saved during a dip', async ({ extension }) => {
        await extension.setStorage({ goldRates: { '24K': 157739, '22K': 144489 }, targetRates: { '24K': 160000, '22K': 140000 } });
        await expect.poll(() => extension.notifications()).toEqual([alert24K('₹1,57,739', '₹1,60,000')]);

        await extension.updateStorage({ targetRates: { '24K': 159000, '22K': 140000 } });
        await expect.poll(() => extension.notifications()).toHaveLength(2);
        expect((await extension.notifications())[1]).toBe(alert24K('₹1,57,739', '₹1,59,000'));

        // Changing only the other purity's alert price doesn't repeat the 24K alert.
        await extension.updateStorage({ targetRates: { '24K': 159000, '22K': 141000 } });
        await extension.settle();
        expect(await extension.notifications()).toHaveLength(2);
    });

    test('are sent when switching to a purity whose alert price is already met', async ({ extension }) => {
        await extension.setStorage({
            goldRates: { '24K': 157739, '22K': 144489 },
            purity: '24K',
            targetRates: { '24K': 150000, '22K': 145000 },
        });
        await extension.updateStorage({ purity: '22K' });

        await expect.poll(() => extension.notifications()).toEqual([alert22K('₹1,44,489', '₹1,45,000')]);

        // Switching away and back during the same dip doesn't repeat it.
        await extension.clearNotifications();
        await extension.updateStorage({ purity: '24K' });
        await extension.settle();
        await extension.updateStorage({ purity: '22K' });
        await extension.settle();
        expect(await extension.notifications()).toEqual([]);
    });

    test('re-arm a purity whose dip ended while the other purity was selected', async ({ extension }) => {
        await extension.setStorage({ purity: '22K', targetRates: { '24K': 150000, '22K': 145000 } });
        await extension.serveIbja(pmRates(157739, 144489));
        await extension.refresh(); // 22K dip: alert.
        await extension.updateStorage({ purity: '24K' });
        await extension.serveIbja(pmRates(158500, 145200));
        await extension.refresh(); // 22K recovers while 24K is selected.
        await extension.serveIbja(pmRates(157000, 144000));
        await extension.refresh(); // 22K drops again: no alert, 24K is selected.
        await extension.updateStorage({ purity: '22K' });

        await expect.poll(() => extension.notifications()).toEqual([
            alert22K('₹1,44,489', '₹1,45,000'),
            alert22K('₹1,44,000', '₹1,45,000'),
        ]);
    });
});
