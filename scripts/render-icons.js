// Renders Icons/logo.svg to the PNG icons the extension uses: `npm run icons`.
// Uses Playwright's Chromium, which the tests already need, so there is nothing else to install.
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(ROOT, 'Icons/logo.svg'), 'utf8');

// [file, size in px, padding in px]. The Chrome Web Store asks for a 128px icon whose artwork
// is 96px with 16px of transparent padding; the small toolbar sizes use the whole square.
const ICONS = [
    ['logo16x16.png', 16, 0],
    ['logo32x32.png', 32, 0],
    ['logo48x48.png', 48, 0],
    ['logo128x128.png', 128, 16],
    ['Icons/logo.png', 256, 0], // Notification icon.
];

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    for (const [file, size, padding] of ICONS) {
        await page.setViewportSize({ width: size, height: size });
        await page.setContent(`<style>html, body { margin: 0; background: transparent; } svg { display: block; margin: ${padding}px; width: ${size - 2 * padding}px; height: ${size - 2 * padding}px; }</style>${svg}`);
        await page.screenshot({ path: path.join(ROOT, file), omitBackground: true });
        console.log(`${file} (${size}px)`);
    }
    await browser.close();
})();
