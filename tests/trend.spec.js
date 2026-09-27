const { test, expect } = require('./fixtures');
const { ibjaPage, saturdayPage } = require('./ibja-pages');

const day = (date, rate24K, rate22K) => ({ date, goldRates: { '24K': rate24K, '22K': rate22K } });

// Eight working days, 16-25 Sept 2026. The chart shows the last seven.
const HISTORY = [
    day('2026-09-16', 155000, 142000),
    day('2026-09-17', 156100, 143000),
    day('2026-09-18', 156900, 143700),
    day('2026-09-21', 157400, 144200),
    day('2026-09-22', 158300, 145000),
    day('2026-09-23', 157800, 144600),
    day('2026-09-24', 158159, 144400),
    day('2026-09-25', 157739, 144489),
];

async function openPopupWith(extension, { rateHistory = HISTORY, ...state } = {}) {
    const latest = rateHistory.at(-1)?.goldRates ?? { '24K': 157739, '22K': 144489 };
    await extension.setStorage({ goldRates: latest, rateSession: 'PM', rateDate: '2026-09-25', lastFetched: Date.now(), rateHistory, ...state });
    return extension.openPopup();
}

function chartPoints(popup) {
    return popup.locator('#rate-chart .chart-line').evaluate((line) => line.getAttribute('points').split(' ').length);
}

test.describe('rate history', () => {
    test("keeps the page's earlier days and today's rate, preferring PM", async ({ extension }) => {
        await extension.serveIbja(ibjaPage({
            pm: { 999: '157739', 916: '144489' },
            amHistory: [['25/09/2026', 158000, 144700], ['24/09/2026', 158300, 144900], ['23/09/2026', 157500, 144300]],
            pmHistory: [['27/09/2026', 'SUN'], ['26/09/2026', 'SAT'], ['25/09/2026', 158159, 144400], ['23/09/2026', 157800, 144600]],
        }));
        await extension.refresh('2026-09-28T13:00:00Z'); // 18:30 IST, Monday 28 Sept

        expect((await extension.storage()).rateHistory).toEqual([
            day('2026-09-23', 157800, 144600),
            day('2026-09-24', 158300, 144900), // Only an AM rate that day.
            day('2026-09-25', 158159, 144400),
            day('2026-09-28', 157739, 144489),
        ]);
    });

    test("files today's rate under the date in India", async ({ extension }) => {
        await extension.serveIbja(ibjaPage({ am: { 999: '157821', 916: '144568' } }));
        await extension.refresh('2026-09-27T19:00:00Z'); // Sunday in UTC, but 00:30 on Monday 28 Sept in India

        expect((await extension.storage()).rateHistory).toEqual([day('2026-09-28', 157821, 144568)]);
    });

    test('on weekends, adds no day for the fetch itself', async ({ extension }) => {
        await extension.serveIbja(saturdayPage);
        await extension.refresh('2026-09-26T06:00:00Z');

        expect((await extension.storage()).rateHistory).toEqual([day('2026-09-24', 156900, 143700), day('2026-09-25', 157739, 144489)]);
    });

    test('builds up across fetches, keeping the latest 10 days', async ({ extension }) => {
        await extension.setStorage({ rateHistory: HISTORY });
        await extension.serveIbja(ibjaPage({
            pm: { 999: '158000', 916: '144800' },
            pmHistory: [['29/09/2026', 158400, 145100], ['25/09/2026', 157700, 144450]],
        }));
        await extension.refresh('2026-09-30T13:00:00Z'); // Wednesday 30 Sept

        const { rateHistory } = await extension.storage();
        expect(rateHistory.map((entry) => entry.date)).toEqual([
            '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-21', '2026-09-22',
            '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-29', '2026-09-30',
        ]);
        // The page's figure replaces the stored one for the same day.
        expect(rateHistory.find((entry) => entry.date === '2026-09-25')).toEqual(day('2026-09-25', 157700, 144450));

        await extension.serveIbja(ibjaPage({ pm: { 999: '158100', 916: '144900' } }));
        await extension.refresh('2026-10-01T13:00:00Z');
        await extension.refresh('2026-10-05T13:00:00Z');
        // The oldest days drop off.
        expect((await extension.storage()).rateHistory.map((entry) => entry.date)).toEqual([
            '2026-09-18', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24',
            '2026-09-25', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-05',
        ]);
    });
});

test.describe('popup trend', () => {
    test('shows the change since the previous working day and a 7-day chart', async ({ extension }) => {
        const popup = await openPopupWith(extension);

        await expect(popup.locator('#rate-trend')).toHaveText('▼ ₹420 (0.27%) since Thu');
        await expect(popup.locator('#rate-trend')).toHaveClass(/is-down/);
        await expect(popup.locator('#rate-chart')).toBeVisible();
        expect(await chartPoints(popup)).toBe(7);
        await expect(popup.locator('#rate-chart .chart-target')).toHaveCount(0);
        await expect(popup.locator('#rate-chart')).toHaveAttribute('aria-label', '24K, last 7 working days (Thu, 17 Sept – Fri, 25 Sept): low ₹1,56,100, high ₹1,58,300.');
        await expect(popup.locator('#rate-chart title')).toHaveText('24K, last 7 working days (Thu, 17 Sept – Fri, 25 Sept): low ₹1,56,100, high ₹1,58,300.');
    });

    test('shows a rise in the warning colour, for the selected purity', async ({ extension }) => {
        const popup = await openPopupWith(extension, { purity: '22K' });

        await expect(popup.locator('#rate-trend')).toHaveText('▲ ₹89 (0.06%) since Thu');
        await expect(popup.locator('#rate-trend')).toHaveClass(/is-up/);

        await popup.locator('label[for="purity-24K"]').click();
        await expect(popup.locator('#rate-trend')).toHaveText('▼ ₹420 (0.27%) since Thu');
    });

    test('names the date when the previous rate is a week or more old, and says when nothing changed', async ({ extension }) => {
        const popup = await openPopupWith(extension, { rateHistory: [day('2026-09-15', 157739, 144000), day('2026-09-25', 157739, 144489)] });

        await expect(popup.locator('#rate-trend')).toHaveText('No change since 15 Sept');
        await expect(popup.locator('#rate-trend')).not.toHaveClass(/is-(up|down)/);
        expect(await chartPoints(popup)).toBe(2);
    });

    test('draws the alert price as a dashed line when it is near the rates', async ({ extension }) => {
        const popup = await openPopupWith(extension, { targetRates: { '24K': 157000 } });
        await expect(popup.locator('#rate-chart .chart-target')).toHaveCount(1);
        await expect(popup.locator('#rate-chart')).toHaveAttribute('aria-label', /Dashed line: your alert price\.$/);

        // Far below the rates, the line would squash the chart flat, so it's left out.
        await extension.updateStorage({ targetRates: { '24K': 120000 } });
        await expect(popup.locator('#rate-chart .chart-target')).toHaveCount(0);
        await expect(popup.locator('#rate-chart')).toHaveAttribute('aria-label', /high ₹1,58,300\.$/);
    });

    test('is hidden until there are two days to compare', async ({ extension }) => {
        const popup = await openPopupWith(extension, { rateHistory: [day('2026-09-25', 157739, 144489)] });
        await expect(popup.locator('#rate-value')).toHaveText('₹1,57,739');
        await expect(popup.locator('#rate-trend')).toBeHidden();
        await expect(popup.locator('#rate-chart')).toBeHidden();

        await extension.updateStorage({ rateHistory: HISTORY.slice(-2) });
        await expect(popup.locator('#rate-trend')).toBeVisible();
        await expect(popup.locator('#rate-chart')).toBeVisible();
    });

    test('appears after the first fetch', async ({ extension }) => {
        const popup = await extension.openPopup();
        await extension.serveIbja(saturdayPage);
        await extension.refresh('2026-09-26T06:00:00Z');

        await expect(popup.locator('#rate-trend')).toHaveText('▲ ₹839 (0.53%) since Thu');
        expect(await chartPoints(popup)).toBe(2);
    });
});
