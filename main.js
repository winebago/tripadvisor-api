const Apify = require('apify');
const axios = require("axios");
const {
    getHotelIds,
    getLocationId,
    buildHotelUrl,
    resolveInBatches,
    processHotels,
    getRequestListSources,
    buildRestaurantUrl,
    getRestaurantIds,
    processRestaurant,
    getClient
} = require("./tools");

const {utils: {log}} = Apify;


Apify.main(async () => {
    // Create and initialize an instance of the RequestList class that contains the start URL.
    const input = await Apify.getValue("INPUT");
    const {locationFullName, placeTypes} = input; //TODO: COMMENT IN README HOW THE LOCATION STRING SHOULD LOOK LIKE
    const timeStamp = Date.now();
    const restaurants = await Apify.openDataset(`restaurants-${timeStamp}`);
    const hotels = await Apify.openDataset(`hotels-${timeStamp}`);
    const locationId = await getLocationId(locationFullName); //@TODO: ERROR could not obtain location id from search string;
    const requestList = new Apify.RequestList({
        sources: getRequestListSources(locationId, placeTypes)
    });
    await requestList.initialize();

    const requestQueue = await Apify.openRequestQueue();


    const crawler = new Apify.CheerioCrawler({
        requestList,
        requestQueue,
        handlePageFunction: async ({request, response, $, html}) => {
            let client;
            if (request.userData.initialHotel) {
                console.log(`Processing ${request.url}...`);
                const numberOfHotels = $(".descriptive_header_text .highlight").first().text();
                const lastDataOffset = $("a.pageNum.last").attr("data-offset");
                console.log(lastDataOffset);
                const promises = [];
                for (let i = 0; i <= lastDataOffset; i += 30) {
                    promises.push(requestQueue.addRequest({
                        url: buildHotelUrl(locationId, i.toString()),
                        userData: {hotelList: true}
                    }))
                }
                await resolveInBatches(promises);
                log.info(`Found ${numberOfHotels} hotels in ....`);
            } else if (request.userData.hotelList) {
                client = await getClient();
                console.log("PROCESSING HOTEL LIST ", request.url);
                const hotelIds = getHotelIds($);
                await resolveInBatches(hotelIds.map(id => processHotels(id, client, hotels)))
            } else if (request.userData.initialRestaurant) {
                const promises = [];
                const maxOffset = $(".pageNum.taLnk").last().attr("data-offset");
                console.log(maxOffset);
                for (let i = 0; i <= maxOffset; i += 30) {
                    promises.push(requestQueue.addRequest({
                        url: buildRestaurantUrl(locationId, i.toString()),
                        userData: {restaurantList: true}
                    }))
                }
                await resolveInBatches(promises);
            } else if (request.userData.restaurantList) {
                client = await getClient();
                const restaurantIds = getRestaurantIds($);
                console.log(restaurantIds);
                await resolveInBatches(restaurantIds.map(id => processRestaurant(id, client, restaurants)))
            }

        },
        handleFailedRequestFunction: async ({request}) => {
            console.log(`Request ${request.url} failed too many times`);
        },
    });

    // Run the crawler and wait for it to finish.
    await crawler.run();

    console.log('Crawler finished.');
});
