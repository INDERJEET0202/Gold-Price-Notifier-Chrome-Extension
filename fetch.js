const api = require('metalpriceapi');

// api.setAPIKey('5f61043a2124d2d8c4f0c26549f83971');

api.fetchLive('INR', ['XAU']).then((response) => {
    console.log(response.data.rates.XAU * 10000000000);
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
