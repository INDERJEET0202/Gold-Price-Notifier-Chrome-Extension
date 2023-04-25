
# A simple gold price drop notifier Chromium Extension 

Gold Price Drop Notifier is a Chrome extension that helps you stay up-to-date with the latest gold prices and notifies you when the gold price drops below your specified rate. Simply set your desired gold price in the extension settings and let it do the rest


## Backend ?

- Takes current Gold Rates from [metalpriceAPI](metalpriceapi.com) everyday.
- Users have to input a gold rate (saved in localhost)
- Whenever the gold rate drops from the user given rate, the extension will send a notification that Gold Price Dropped.



## Functions
### Notification Function

```javascript
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
```

### Sending notifications
```javascript
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
```
## 🚀 About Me
I'm a nothing 🥲

