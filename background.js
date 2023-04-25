let globalsUrl = chrome.runtime.getURL("globals.js");

importScripts(globalsUrl);

// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//     if (request.action === "getGlobalRate") {
//         sendResponse({ globalRate });
//     }
// });

let notificationSent;

// Show users some information when then either install / update or uninstall the extension.
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.tabs.create({
            url: "https://e1.pxfuel.com/desktop-wallpaper/753/593/desktop-wallpaper-thank-you-top-beautiful-pics-ultra-jpg-you-are-the-best.jpg"
        })
        console.log('Extension installed');
    } else if (details.reason === 'update') {
        chrome.tabs.create({
            url: "https://github.com/INDERJEET0202/Gold-Price-Notifier-Chrome-Extension"
        })
        // priceDropAlertNotifi();
        console.log('Extension updated');
    } else if (details.reason === 'uninstall') {
        chrome.tabs.create({
            url: "chrome://newtab"
        })
        console.log('Extension uninstalled');
    }
});


// This is the notification function which will be called when the gold price decreases.
function priceDropAlertNotifi() {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: './icons/logo.png',
        title: 'Gold Price Drop Alert',
        message: 'The gold price has dropped below your specified rate. Buy Gold now!'
    }, function (notificationId) {
        console.log('Notification sent with ID:', notificationId);
    });
}

// Calling the alert function from popup.js file
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.greeting == "hello") {
        // call your function here
        priceDropAlertNotifi();
        sendResponse({ farewell: "goodbye" });
    }
});

// Fetch gold rates from metalpriceapi.com
function fetchGoldRate() {
    return fetch('https://api.metalpriceapi.com/v1/latest?api_key=5f61043a2124d2d8c4f0c26549f839711&base=INR&currencies=XAU')
        .then(response => response.json())
        .then(data => {
            // const rate = data.rates.XAU * 10000000000; // multiply with 10000000000 to convert to INR
            // let rateGST = Math.round(rate * 1.03);
            // console.log(rateGST);
            const rate = 1000;
            // const rate = Math.floor(Math.random() * 10);
            return rate;
        })
        .catch(error => console.error(error));
}

fetchGoldRate().then(rate => {
    globalRate = rate;
    console.log(globalRate); // This will "Ran only once" when the extension is installed or updated.
});

setInterval(() => {
    fetchGoldRate().then(rate => {
        globalRate = rate;
        console.log(globalRate); //This will "Ran once each day" as the setInterval timer is "86400000".
        notificationSent = false;
    });
}, 86400000); // This value will be fetched once a day.


// Sending the message to popup.js every 5 seconds.
setInterval(() => {
    chrome.runtime.sendMessage({ type: "goldRateUpdate", rate: globalRate });
}, 1000) //Sends the updated gold rate per second to the popup.js file.

// Store the user's gold rate from popup.js
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    let userInput = request.userInput;
    console.log(userInput); // Do something with the userInput variable here
    chrome.storage.local.set({ userInput: userInput }, function() {
        console.log("User input value stored.");
    });
    notificationSent = false;
});

// Checking if the price goes down and Calling the notification function .
setInterval(() => {
    chrome.storage.local.get("userInput", function(result) {
        let userInputValue = result.userInput;
        console.log("User input value retrieved: ", userInputValue);
        if(userInputValue > globalRate && !notificationSent){
            priceDropAlertNotifi();
            notificationSent = true;
        }
    });  
}, 1000);
