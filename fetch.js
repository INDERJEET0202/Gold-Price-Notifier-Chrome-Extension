const api = require('metalpriceapi');

// Run with: METALPRICE_API_KEY=<your key> node fetch.js
api.setAPIKey(process.env.METALPRICE_API_KEY);

api.fetchLive('INR', ['XAU']).then((response) => {
    // rates.XAU is troy ounces per ₹1, so invert it and convert to ₹ per 10 grams.
    console.log(Math.round(1 / response.data.rates.XAU / 31.1034768 * 10));
}).catch((error) => {
    console.error("Some thing went wrong.");
});



// using scrapping from grow site

// const request = require('request');
// const cheerio = require('cheerio');

// const url = 'https://groww.in/gold-rates/gold-rate-today-in-kolkata';

// request(url, function (error, response, html) {
//     if (!error && response.statusCode === 200) {
//         const $ = cheerio.load(html);
//         const goldRates = $('.grp846CardDiv').text();
//         console.log(goldRates);
//     } else {
//         console.error(error);
//     }
// });
