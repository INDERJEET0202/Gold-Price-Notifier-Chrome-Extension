const { test, expect } = require('./fixtures');
const { ibjaPage } = require('./ibja-pages');

const RATES = { '24K': 157739, '22K': 144489 };
const HISTORY = [
    { date: '2026-09-24', goldRates: { '24K': 158159, '22K': 144400 } },
    { date: '2026-09-25', goldRates: RATES },
];

function badge(extension) {
    return extension.serviceWorker.evaluate(async () => ({
        text: await chrome.action.getBadgeText({}),
        title: await chrome.action.getTitle({}),
    }));
}

test.describe('GST and per-gram prices', () => {
    test('the switch shows every price with 3% GST, and back', async ({ extension }) => {
        await extension.setStorage({ goldRates: RATES, rateSession: 'PM', rateDate: '2026-09-25', rateHistory: HISTORY, lastFetched: Date.now(), targetRates: { '24K': 157000 } });
        const popup = await extension.openPopup();
        await expect(popup.locator('#include-gst')).not.toBeChecked();
        await expect(popup.locator('#rate-value')).toHaveText('₹1,57,739');
        await expect(popup.locator('#rate-meta')).toHaveText('₹15,774/g · Fri, 25 Sept · checked just now');

        await popup.getByText('Include 3% GST').click();

        await expect(popup.locator('#include-gst')).toBeChecked();
        await expect(popup.locator('#rate-label')).toHaveText('24K gold · per 10 g · incl. GST');
        await expect(popup.locator('#rate-value')).toHaveText('₹1,62,471');
        await expect(popup.locator('#rate-meta')).toHaveText('₹16,247/g · Fri, 25 Sept · checked just now');
        await expect(popup.locator('#rate-trend')).toHaveText('▼ ₹433 (0.27%) since Thu');
        await expect(popup.locator('#target-diff')).toHaveText('₹761 above your alert price');
        await expect(popup.locator('#user-input')).toHaveValue('161710');
        await expect(popup.locator('#target-hint')).toHaveText("You'll get a notification when 24K is below ₹1,61,710.");
        // Only the display changes: the alert price is still stored without GST.
        expect(await extension.storage()).toMatchObject({ includeGst: true, targetRates: { '24K': 157000 } });

        await popup.getByText('Include 3% GST').click();
        await expect(popup.locator('#rate-value')).toHaveText('₹1,57,739');
        await expect(popup.locator('#rate-label')).toHaveText('24K gold · per 10 g');
        await expect(popup.locator('#user-input')).toHaveValue('157000');
        expect((await extension.storage()).includeGst).toBe(false);
    });

    test('an alert price entered with GST is stored without it and shows back as entered', async ({ extension }) => {
        await extension.setStorage({ goldRates: RATES, rateSession: 'PM', lastFetched: Date.now(), includeGst: true });
        const popup = await extension.openPopup();
        await expect(popup.locator('#include-gst')).toBeChecked();
        await popup.locator('#user-input').fill('162000');
        await popup.locator('#submit').click();

        await expect(popup.locator('#target-hint')).toHaveText("You'll get a notification when 24K is below ₹1,62,000.");
        await expect(popup.locator('#target-diff')).toHaveText('₹471 above your alert price');
        expect((await extension.storage()).targetRates).toEqual({ '24K': 157281.55 });

        const reopened = await extension.openPopup();
        await expect(reopened.locator('#user-input')).toHaveValue('162000');
        await reopened.getByText('Include 3% GST').click();
        await expect(reopened.locator('#user-input')).toHaveValue('157282');
    });

    test('alerts and the badge use the chosen basis, without changing when an alert fires', async ({ extension }) => {
        await extension.setStorage({ includeGst: true, targetRates: { '24K': 157281.55 } });
        await extension.serveIbja(ibjaPage({ pm: { 999: '157000', 916: '144000' } }));
        await extension.refresh();

        expect(await extension.notifications()).toEqual(['24K gold is now ₹1,61,710/10g incl. GST, below your rate of ₹1,62,000/10g. Buy Gold now!']);
        await expect.poll(() => badge(extension)).toEqual({
            text: '162K',
            title: '24K gold: ₹1,61,710/10g incl. GST (IBJA PM rate)\n₹290 below your alert price',
        });

        // Switching GST off changes what is shown, not the alert: no new notification.
        await extension.updateStorage({ includeGst: false });
        await expect.poll(() => badge(extension)).toEqual({
            text: '157K',
            title: '24K gold: ₹1,57,000/10g (IBJA PM rate)\n₹282 below your alert price',
        });
        await extension.settle();
        expect(await extension.notifications()).toHaveLength(1);
    });
});
