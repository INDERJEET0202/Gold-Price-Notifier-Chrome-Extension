const { test, expect } = require('./fixtures');
const { ibjaPage } = require('./ibja-pages');

const RATES = { '24K': 157739, '22K': 144489 };
const minutesAgo = (minutes) => Date.now() - minutes * 60 * 1000;

test.describe('popup', () => {
    test('shows a placeholder until the first rate arrives, then updates live', async ({ extension }) => {
        const popup = await extension.openPopup();
        await expect(popup.locator('#rate-loading')).toBeVisible();
        await expect(popup.locator('#rate-value')).toBeHidden();
        await expect(popup.locator('#target-hint')).toHaveText('No alert set yet.');

        await extension.serveIbja(ibjaPage({ pm: { 999: '157739', 916: '144489' } }));
        await extension.refresh();

        await expect(popup.locator('#rate-value')).toHaveText('₹1,57,739');
        await expect(popup.locator('#rate-loading')).toBeHidden();
    });

    test("shows today's rate", async ({ extension }) => {
        await extension.setStorage({ goldRates: RATES, rateSession: 'PM', rateDate: null, lastFetched: minutesAgo(5), lastError: null });
        const popup = await extension.openPopup();

        await expect(popup.locator('#rate-value')).toHaveText('₹1,57,739');
        await expect(popup.locator('#rate-label')).toHaveText('24K gold · per 10 g');
        await expect(popup.locator('#rate-session')).toHaveText('IBJA PM rate');
        await expect(popup.locator('#rate-meta')).toHaveText('Today · checked 5 min ago');
        await expect(popup.locator('#error-banner')).toBeHidden();
    });

    test('names the day when the rate is from an earlier day', async ({ extension }) => {
        await extension.setStorage({ goldRates: RATES, rateSession: 'PM', rateDate: '2026-09-25', lastFetched: minutesAgo(120) });
        const popup = await extension.openPopup();

        await expect(popup.locator('#rate-meta')).toHaveText('Fri, 25 Sept · checked 2 h ago');
    });

    test('shows how far the rate is from the alert price', async ({ extension }) => {
        await extension.setStorage({ goldRates: RATES, rateSession: 'PM', lastFetched: Date.now(), targetRates: { '24K': 158000 } });
        const popup = await extension.openPopup();
        await expect(popup.locator('#target-diff')).toHaveText('✓ ₹261 below your alert price');
        await expect(popup.locator('#target-diff')).toHaveClass(/is-below/);

        await extension.updateStorage({ targetRates: { '24K': 157000 } });
        await expect(popup.locator('#target-diff')).toHaveText('₹739 above your alert price');
        await expect(popup.locator('#target-diff')).not.toHaveClass(/is-below/);
    });

    test('keeps the last rate visible when a fetch fails', async ({ extension }) => {
        await extension.setStorage({ goldRates: RATES, rateSession: 'AM', lastFetched: minutesAgo(26 * 60), lastError: 'ibjarates.com returned HTTP 403' });
        const popup = await extension.openPopup();

        await expect(popup.locator('#error-banner')).toHaveText("Couldn't update the gold rate: ibjarates.com returned HTTP 403");
        await expect(popup.locator('#rate-value')).toHaveText('₹1,57,739');
        await expect(popup.locator('#rate-meta')).toContainText('checked 1 day ago');
    });

    test('shows a dash when the very first fetch fails', async ({ extension }) => {
        await extension.setStorage({ lastError: 'Failed to fetch' });
        const popup = await extension.openPopup();

        await expect(popup.locator('#rate-value')).toHaveText('—');
        await expect(popup.locator('#rate-loading')).toBeHidden();
        await expect(popup.locator('#error-banner')).toBeVisible();
    });

    test('saves an alert price and confirms it', async ({ extension }) => {
        await extension.setStorage({ goldRates: RATES, rateSession: 'PM', lastFetched: Date.now() });
        const popup = await extension.openPopup();
        await popup.locator('#user-input').fill('158000');
        await popup.locator('#submit').click();

        await expect(popup.locator('#submit')).toHaveText('Saved ✓');
        await expect(popup.locator('#target-hint')).toHaveText("You'll get a notification when 24K is below ₹1,58,000.");
        expect((await extension.storage()).targetRates).toEqual({ '24K': 158000 });
        await expect(popup.locator('#submit')).toHaveText('Set alert');
    });

    test('does not save an invalid alert price', async ({ extension }) => {
        await extension.setStorage({ goldRates: RATES, targetRates: { '24K': 150000 } });
        const popup = await extension.openPopup();
        await popup.locator('#user-input').fill('-5');
        await popup.locator('#submit').click();
        await extension.settle();

        expect((await extension.storage()).targetRates).toEqual({ '24K': 150000 });
    });

    test('switches purity, keeping a separate alert price for each', async ({ extension }) => {
        await extension.setStorage({ goldRates: RATES, rateSession: 'PM', lastFetched: Date.now(), targetRates: { '24K': 150000 } });
        const popup = await extension.openPopup();
        await expect(popup.locator('#user-input')).toHaveValue('150000');

        await popup.locator('label[for="purity-22K"]').click();
        await expect(popup.locator('#rate-value')).toHaveText('₹1,44,489');
        await expect(popup.locator('#rate-label')).toHaveText('22K gold · per 10 g');
        await expect(popup.locator('#user-input-label')).toHaveText('Alert me when 22K drops below');
        await expect(popup.locator('#user-input')).toHaveValue('');
        await expect(popup.locator('#target-hint')).toHaveText('No alert set yet.');
        expect((await extension.storage()).purity).toBe('22K');

        await popup.locator('label[for="purity-24K"]').click();
        await expect(popup.locator('#user-input')).toHaveValue('150000');
        expect(await extension.ibjaRequests()).toEqual([]); // Switching never refetches.
    });

    test('reopens on the saved purity and alert price', async ({ extension }) => {
        await extension.setStorage({ goldRates: RATES, rateSession: 'PM', lastFetched: Date.now(), purity: '22K', targetRates: { '22K': 145000 } });
        const popup = await extension.openPopup();

        await expect(popup.locator('#purity-22K')).toBeChecked();
        await expect(popup.locator('#user-input')).toHaveValue('145000');
    });

    for (const [colorScheme, frameColor] of [['light', 'rgb(236, 229, 216)'], ['dark', 'rgb(11, 10, 9)']]) {
        test(`fits the popup width in ${colorScheme} mode`, async ({ extension }) => {
            await extension.setStorage({
                goldRates: RATES,
                rateSession: 'PM',
                lastFetched: Date.now(),
                lastError: 'ibjarates.com returned HTTP 403',
                targetRates: { '24K': 158000 },
            });
            const popup = await extension.openPopup({ colorScheme });
            await expect(popup.locator('#rate-value')).toHaveText('₹1,57,739');

            const layout = await popup.evaluate(() => ({
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                frame: getComputedStyle(document.body).backgroundColor,
            }));
            expect(layout).toEqual({ overflow: 0, frame: frameColor });
        });
    }
});
