var GeneralData = (function () {

    var processing = false;

    var deleting = false;

    var queue = [];

    var delete_queue = [];

    var cache = {};

    setInterval(_processQueue, 10);
    setInterval(_deleteQueue, 10);

    function set(key, value) {
        return new Promise(function (resolve, reject) {
            var obj = {};
            obj[key] = value;
            chrome.storage.local.set(obj, resolve);
        })
    }

  
    function get(key) {
        return new Promise(function (resolve, reject) {
            chrome.storage.local.get(key, function (obj) {
                var val = obj[key];
                resolve(val);
            });
        })
    }

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


    function getTLD(url){
        var domains = splitURL(url);
        if(domains.length < 2){
            return null;
        }

        return domains[domains.length - 2] + '.' + domains[domains.length - 1];
    }


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


    function addValues(domain_obj, currentCount){
        if(!domain_obj['values']){
            domain_obj['values'] = [];
        }

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
                        var domains = getDomains(url);
                        var cnt_obj = await getDomainFromStorage(tld);
                        if(domains && domains.length > 0){
                            var child = domains[0];
                            var children = cnt_obj['children'];
                            if(children.indexOf(child) === -1){
                                children.push(child);
                            }
                            cnt_obj['children'] = children;

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
                    }
                }
            }
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
                await set('tlds', JSON.stringify(tlds));
            }

            currentCount += 1
            await set('count', currentCount);
            processing = false;

        } catch (err) {
            throw err;
        }
    }

    function _cacheRequest(details, name) {
        var request_id = details['request_id'];
        if (!cache.hasOwnProperty(request_id)) {
            cache[request_id] = {};
        }
        if (!cache[request_id].hasOwnProperty(name)) {
            cache[request_id][name] = []
        }
        cache[request_id][name].push(JSON.stringify(details));
    }

    function _addToQueue(details) {
        var request_id = details['request_id'];
        var obj = cache[request_id];
        queue.push(obj);
        delete cache[request_id];
    }

    function  onBeforeRequest(details) {
        _cacheRequest(details, 'onBeforeRequest');
    }

    function onBeforeSend(details) {
        _cacheRequest(details, 'onBeforeSend');
    }

    function onHeadersReceived(details) {
        _cacheRequest(details, 'onHeadersReceived');
    }

    function onSend(details) {
        _cacheRequest(details, 'onSend');
    }

    function onAuthRequired(details) {
        _cacheRequest(details, 'onAuthRequired');
    }

    function onBeforeRedirect(details) {
        _cacheRequest(details, 'onBeforeRedirect');
    }

    function onResponseStarted(details) {
        _cacheRequest(details, 'onResponseStarted');
    }

    function onComplete(details) {
        _cacheRequest(details, 'onComplete');
        _addToQueue(details);
    }

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