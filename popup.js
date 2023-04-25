document.addEventListener('DOMContentLoaded', runFunction);
console.log("DOM is loaded");

function runFunction() {
    let btn = document.getElementById('submit');
    btn.addEventListener('click', func);

    // let globalRate = 0;

    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        if (message.type === "goldRateUpdate") {
            console.log(message.rate);
            // Do something with the rate value
            globalRate = message.rate;
            localStorage.setItem('goldRate', globalRate);
        }
    });


    


    const priceElement = document.getElementById('price');
    setInterval(() => {
        const newDiv = document.createElement('div');
        newDiv.id = 'price';
        const oldDiv = document.getElementById('old-div')
        const parentDiv = oldDiv.parentNode;
        newDiv.innerHTML = `Gold rate in India today is Rs ${globalRate}/10mg`;
        parentDiv.replaceChild(newDiv, oldDiv);
        // priceElement.textContent = `Gold rate in India today is Rs ${globalRate}/10mg`;
    }, 1000);



    let userInput = 0;
    userInput = localStorage.getItem('userRate');
    chrome.runtime.sendMessage({userInput: userInput});
    const priceElement2 = document.getElementById('price2');
    priceElement2.textContent = `You will be informed when price will be below Rs ${userInput}/10mg.`;



    function func() {
        const userInput = document.getElementById("user-input").value;
        localStorage.setItem('userRate', userInput);
        chrome.runtime.sendMessage({userInput: userInput});

        // console.log("testing global rate in func " + globalRate)
        // if (userInput < globalRate){
        //     chrome.runtime.sendMessage({ greeting: "hello" }, function (response) {
        //         console.log(response.farewell);
        //     });
        // }

        const priceElement2 = document.getElementById('price2');
        priceElement2.textContent = `You will be informed when price will be below Rs ${userInput}/10mg.`;
        console.log('btn is clicked.')
    }

    console.log("all Scripts are loaded.");
}