document.addEventListener('DOMContentLoaded', async () => {
    const input = document.getElementById('api-key');
    const { apiKey } = await chrome.storage.local.get('apiKey');
    if (apiKey) {
        input.value = apiKey;
    }

    document.getElementById('settings-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const newKey = input.value.trim();
        const { apiKey: savedKey } = await chrome.storage.local.get('apiKey');
        if (newKey === savedKey) {
            showStatus('This key is already saved.');
            return;
        }
        showStatus('Saved. Fetching today\'s gold rate...');
        // background.js fetches the rate as soon as the key changes. Any error was for the old key.
        await chrome.storage.local.set({ apiKey: newKey, lastError: null });
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        if (changes.lastError?.newValue) {
            showStatus(`Couldn't fetch the gold rate: ${changes.lastError.newValue}`);
        } else if (changes.lastFetched) {
            chrome.storage.local.get('goldRate').then(({ goldRate }) => {
                showStatus(`Saved. Gold rate in India today is ${formatRupees(goldRate)}/10g.`);
            });
        }
    });
});

function showStatus(message) {
    document.getElementById('status').textContent = message;
}
