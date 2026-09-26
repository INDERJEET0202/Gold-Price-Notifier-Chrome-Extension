// Fake ibjarates.com pages with the markup the parser relies on
// (see .claude/docs/ibja-rates.md). Rates are keyed by IBJA fineness: 999 is 24K, 916 is 22K.

// `am` and `pm` are today's rates, e.g. { 999: '157739', 916: '144489' }. Missing ones are empty,
// as on the real page before IBJA publishes them or on weekends.
function todayTable({ am = {}, pm = {} }) {
    const cell = (code, session, rates) => `<td><span id="lblGold${code}_${session}">${rates[code] ?? ''}</span></td>`;
    const row = (code) => `<tr><td>Gold ${code}</td>${cell(code, 'AM', am)}${cell(code, 'PM', pm)}</tr>`;
    return `<table id="TodayRatesTableDataYes" class="tableContainer ctrate">
    <tr><th>Purity</th><th>AM</th><th>PM </th></tr>
    ${['999', '995', '916'].map(row).join('\n    ')}
</table>`;
}

// Each row is [date, rate999, rate916] for a day with rates, or [date, 'SAT'] for a day without.
function historyTable(session, rows) {
    const body = rows.map(([date, rate999, rate916]) => {
        const cells = rate916 === undefined
            ? Array(6).fill(rate999)
            : [rate999, rate999 - 632, rate916, 118304, 92277, 190000];
        return `<tr><td>\n    ${date}\n</td>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
    });
    return `<div id="tab-${session}" class="tab-pane"><table class="table-striped">
    <thead><tr><th>Date</th><th>999</th><th>995</th><th>916</th><th>750</th><th>585</th><th>Silver 999</th></tr></thead>
    <tbody>${body.join('\n')}</tbody>
</table></div>`;
}

function ibjaPage({ am = {}, pm = {}, amHistory = [], pmHistory = [] } = {}) {
    return `<!DOCTYPE html><html><head><title>IBJA Rates</title></head><body>
${todayTable({ am, pm })}
<p>Rates are not published on Central Govt. Holidays &amp; SAT/SUN</p>
<div class="tab-content">
${historyTable('am', amHistory)}
${historyTable('pm', pmHistory)}
</div>
</body></html>`;
}

// A Saturday: nothing published today, and Friday 25 Sept is the latest day with rates.
const saturdayPage = ibjaPage({
    amHistory: [['27/09/2026', 'SUN'], ['26/09/2026', 'SAT'], ['25/09/2026', 157821, 144568], ['24/09/2026', 157000, 143800]],
    pmHistory: [['27/09/2026', 'SUN'], ['26/09/2026', 'SAT'], ['25/09/2026', 157739, 144489], ['24/09/2026', 156900, 143700]],
});

module.exports = { ibjaPage, saturdayPage };
