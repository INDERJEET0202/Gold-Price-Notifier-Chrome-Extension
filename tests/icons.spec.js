// Static checks on the icon files; no browser needed.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

// Width and height from a PNG's IHDR chunk.
function pngSize(file) {
    const data = fs.readFileSync(path.join(ROOT, file));
    expect(data.subarray(1, 4).toString(), `${file} is a PNG`).toBe('PNG');
    return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

test.describe('icons', () => {
    test('each manifest icon is a PNG of the size it is listed under', () => {
        const icons = { ...manifest.icons, ...manifest.action.default_icon };
        expect(Object.keys(icons).sort()).toEqual(['128', '16', '32', '48']);
        for (const [size, file] of Object.entries(icons)) {
            expect(pngSize(file), file).toEqual([Number(size), Number(size)]);
        }
    });

    test('the notification and page icon is square, sharp and small', () => {
        expect(pngSize('Icons/logo.png')).toEqual([256, 256]);
        expect(fs.statSync(path.join(ROOT, 'Icons/logo.png')).size).toBeLessThan(64 * 1024);
    });

    test('every icon is rendered from Icons/logo.svg', () => {
        const script = fs.readFileSync(path.join(ROOT, 'scripts/render-icons.js'), 'utf8');
        for (const file of [...Object.values(manifest.icons), 'Icons/logo.png']) {
            expect(script, `scripts/render-icons.js renders ${file}`).toContain(`'${file}'`);
        }
    });
});
