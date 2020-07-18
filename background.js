/**
 * An object that handles the state of the application
 */
var GeneralData = (function () {

    // A flag that is true if something is being processed
    var processing = false;

    // A flag that is true if something is being deleted
    var deleting = false;

    // The queue
    var queue = [];

    // The delete queue
    var delete_queue = [];

    // The cache object
    var cache = {};

    // A function that processes the queue
    setInterval(_processQueue, 10);
    setInterval(_deleteQueue, 10);

    /**
     * A function that sets the value in storage
     * @param {*} key The key 
     * @param {*} value The value
     */
    function set(key, value) {
        return new Promise(function (resolve, reject) {
            var obj = {};
            obj[key] = value;
            chrome.storage.local.set(obj, resolve);
        })
    }

    /**
     * A function that gets the value in storage
     * @param {*} key The key to save
     */
    function get(key) {
        return new Promise(function (resolve, reject) {
            chrome.storage.local.get(key, function (obj) {
                var val = obj[key];
                resolve(val);
            });
        })
    }

    /**
     * A function that returns the domain for a key
     * @param {*} key The key value
     */
    async function getDomainFromStorage(key){
        try{
            var cnt_obj = await get(key);
            if(!cnt_obj){
                cnt_obj = {
                    'children':[],
                    'values':[],
                    'count':0
                }
            }else{
                cnt_obj = JSON.parse(cnt_obj);
            }

            return cnt_obj;
        }catch(err){
            throw err;
        }
    }

    /**
     * A function that returns all of the domains
     * @param {} url The url
     */
    function splitURL(url){
        var domains = url.split('.');
        if(domains.length < 0){
            return;
        }
        var first_domain = domains[0].split('/');
        var fd = [first_domain[first_domain.length - 1]];
        fd = fd.concat(domains.slice(1));
        return fd;
    }

    /**
     * A helper function given a url that returns a domain
     * @param {*} url The url to parse
     */
    function getTLD(url){
        var domains = splitURL(url);
        if(domains.length < 2){
            return null;
        }

        return domains[domains.length - 2] + '.' + domains[domains.length - 1];
    }

    /**
     * A helper function that returns the domains
     * @param {*} url The url to parse
     */
    function getDomains(url){
        var domains = splitURL(url);
        if(domains.length < 2){
            return null;
        }
        var lower_domains = [];
        var tld = getTLD(url);
        for(var k = domains.length - 3; k >= 0; k--){
            var d = domains[k];
            tld = d + '.' + tld;
            lower_domains.push(tld);
        }

        return lower_domains;
    }

    /**
     * A function that adds values to the domain object
     * @param {*} domain_obj The domain object
     * @param {*} currentCount The current count
     */
    function addValues(domain_obj, currentCount){
        if(!domain_obj['values']){
            domain_obj['values'] = [];
        }

        // Make sure that the values is not too large.
        var size = domain_obj['values'].length;
        while(size >= 200){
            var obj = domain_obj['values'].shift();
            delete_queue.push(obj.toString());
            size = domain_obj['values'].length;
        }

        if(domain_obj['values'].indexOf(currentCount) === -1){
            domain_obj['values'].push(currentCount);
        }
    }

    /**
     * A function that clears the delete queue
     */
    async function _deleteQueue(){
        try{
            if(delete_queue.length > 0){
                if(deleting){
                    return;
                }
                else{
                    deleting = true;
                }
                chrome.storage.local.remove(delete_queue, function(){
                    delete_queue = [];
                    deleting = false;
                });
            }
        }catch(err){

        }
    }

    /**
     * A function that processes the queue
     */
    async function _processQueue() {
        try {
            if (processing) {
                return;
            }
            processing = true;
            if (queue.length === 0) {
                processing = false;
                return;
            }
            var currentCount = await get('count');
            if (!currentCount) {
                currentCount = 0;
            }
            if (!isNaN(currentCount)) {
                currentCount = parseInt(currentCount);
            } else {
                currentCount = 0;
            }
            if(Number.MAX_VALUE <= currentCount){
                currentCount = 0;
            }


            var data = queue.pop();
            var obj = {};
            obj[currentCount] = data;


            // Set the data
            await set(currentCount, data);
            var keys = Object.keys(data).sort();
            var tld;
            if(keys.length > 0){
                var arr = data[keys[0]];
                if(arr.length > 0){
                    var first = arr[0];
                    try{
                        var obj = JSON.parse(first);
                        var url = obj['initiator'];
                        tld = getTLD(url);

                        // console.log(Object.values(tld))
                        // console.log(url)

                        var domains = getDomains(url);
                        // Handle the base case
                        var cnt_obj = await getDomainFromStorage(tld);
                        if(domains && domains.length > 0){
                            var child = domains[0];
                            var children = cnt_obj['children'];
                            if(children.indexOf(child) === -1){
                                children.push(child);
                            }
                            cnt_obj['children'] = children;

                            // Process the children domain
                            for(var k = 0; k < domains.length; k++){
                                var d = domains[k];
                                var domain_obj = await getDomainFromStorage(d);
                                domain_obj['count'] += 1;
                                if(k === domains.length - 1){
                                    addValues(domain_obj, currentCount);
                                }else{
                                    var child = domains[k + 1];
                                    if(domain_obj['children'].indexOf(child) === -1){
                                        domain_obj['children'].push(child);
                                    }
                                }
                                await set(d, JSON.stringify(domain_obj));
                            }
                        }else{
                            addValues(domain_obj, currentCount);
                        }
                        cnt_obj['count'] += 1;
                        await set(tld, JSON.stringify(cnt_obj));
                        
                    }catch(err){
                        //console.log(err);
                    }
                }
            }

            // Save the top level domains
            if(tld){
                var tlds = await get('tlds');
                if(!tlds){
                    tlds = [];
                }else{
                    tlds = JSON.parse(tlds);
                }
                if(tlds.indexOf(tld) === -1){
                    tlds.push(tld);
                }
                // console.log(tlds)
                await set('tlds', JSON.stringify(tlds));
                // const test = await get(tlds[0])
                // console.log(test)
            }

            // Process the information for the histogram

            // Increment the atomic count. If the queue is full, this will
            // add the information to the local storage
            currentCount += 1
            await set('count', currentCount);
            processing = false;

        } catch (err) {
            throw err;
        }
    }

    /**
     * A helper function that caches the request
     * @param {*} details The details object
     * @param {*} name The name
     */
    function _cacheRequest(details, name) {
        // console.log(Object.keys(details),Object.values(details))
        var request_id = details['request_id'];
        if (!cache.hasOwnProperty(request_id)) {
            cache[request_id] = {};
        }
        if (!cache[request_id].hasOwnProperty(name)) {
            cache[request_id][name] = []
        }
        cache[request_id][name].push(JSON.stringify(details));
        // console.log('cache = ' + cache)
    }

    /**
     * A function that adds the data to the process queue
     * @param {*} details The details to process
     */
    function _addToQueue(details) {
        var request_id = details['request_id'];
        var obj = cache[request_id];
        queue.push(obj);
        delete cache[request_id];
    }

    /**
     * A function that handles a request before it happens
     * @param {*} details The details object
     */
    function  onBeforeRequest(details) {
        _cacheRequest(details, 'onBeforeRequest');
    }

    /**
     * A function that handles a request being completed
     * @param {*} details The details object
     */
    function onBeforeSend(details) {
        _cacheRequest(details, 'onBeforeSend');
    }

    /**
     * A function that handles the headers being received
     * @param {*} details The details object
     */
    function onHeadersReceived(details) {
        _cacheRequest(details, 'onHeadersReceived');
    }

    /**
     * A function that sends the details
     * @param {*} details The details object
     */
    function onSend(details) {
        _cacheRequest(details, 'onSend');
    }

    /**
     * A function that handles a request being completed
     * @param {*} details The details object
     */
    function onAuthRequired(details) {
        _cacheRequest(details, 'onAuthRequired');
    }

    /**
     * A function that handles the redirects
     * @param {*} details The details object
     */
    function onBeforeRedirect(details) {
        _cacheRequest(details, 'onBeforeRedirect');
    }

    /**
     * A function that handles the response
     * @param {*} details The details object
     */
    function onResponseStarted(details) {
        _cacheRequest(details, 'onResponseStarted');
    }

    /**
     * A function that handles the completion of requests
     * @param {*} details The details object
     */
    function onComplete(details) {
        _cacheRequest(details, 'onComplete');
        _addToQueue(details);
    }

    /**
     * A function that handles an error
     * @param {*} details The details object
     */
    function onErrorOccurred(details) {
        _cacheRequest(details, 'onError');
        _addToQueue(details);
    }

    return {
        onBeforeRequest: onBeforeRequest,
        onBeforeSend: onBeforeSend,
        onSend: onSend,
        onHeadersReceived: onHeadersReceived,
        onAuthRequired: onAuthRequired,
        onBeforeRedirect: onBeforeRedirect,
        onResponseStarted: onResponseStarted,
        onComplete: onComplete,
        onErrorOccurred: onErrorOccurred
    }
})();

// The web requests
chrome.webRequest.onBeforeRequest.addListener(GeneralData.onBeforeRequest, { urls: ["<all_urls>"] }, ["requestBody"])
chrome.webRequest.onBeforeSendHeaders.addListener(GeneralData.onBeforeSend, { urls: ["<all_urls>"] }, ['requestHeaders', 'blocking']);
chrome.webRequest.onSendHeaders.addListener(GeneralData.onSend, { urls: ["<all_urls>"] }, ["requestHeaders", "extraHeaders"]);
chrome.webRequest.onHeadersReceived.addListener(GeneralData.onHeadersReceived, { urls: ["<all_urls>"] }, ["responseHeaders", "extraHeaders"]);
chrome.webRequest.onBeforeRedirect.addListener(GeneralData.onBeforeRedirect, { urls: ["<all_urls>"] }, ["responseHeaders", "extraHeaders"]);
chrome.webRequest.onResponseStarted.addListener(GeneralData.onResponseStarted, { urls: ["<all_urls>"] }, ["responseHeaders", "extraHeaders"]);
chrome.webRequest.onCompleted.addListener(GeneralData.onComplete, { urls: ["<all_urls>"] }, ["responseHeaders"]);
chrome.webRequest.onErrorOccurred.addListener(GeneralData.onErrorOccurred, { urls: ["<all_urls>"] });

// onBeforeRequest (optionally synchronous)
// Fires when a request is about to occur

// onBeforeSendHeaders (optionally synchronous)
// Fires when a request is about to occur and the initial headers have been prepared.
// The event is intended to allow extensions to add, modify, and delete request headers 

// onSendHeaders
// Fires after all extensions have had a chance to modify the request headers, and
// presents the final (*) version. The event is triggered before the headers are sent to the network.

// onHeadersReceived (optionally synchronous)
// Fires each time that an HTTP(S) response header is received. Due to redirects and
// authentication requests this can happen multiple times per request.

// onBeforeRedirect
// Fires when a redirect is about to be executed. A redirection can be triggered
// by an HTTP response code or by an extension. 

// onResponseStarted
// Fires when the first byte of the response body is received.
// For HTTP requests, this means that the status line and response headers are available.

// onCompleted
// Fires when a request has been processed successfully.

// onErrorOccurred
// Fires when a request could not be processed successfully.