const View = () =>  {

    var is_loading = false;
    var current_level = 0;
    var view_data = {};
    setInterval(onUpdate, 1000);

    function onUpdate(key) {
        if(current_level === 0 && !is_loading){
            init();
        }
    }

    const get = key => {
        return new Promise(function (resolve, reject) {
            chrome.storage.local.get(key, function (obj) {
                if (Array.isArray(key)) {
                    resolve(obj); 
                } else if(key === null){
                    resolve(obj);
                } else {
                    var val = obj[key];
                    resolve(val);
                }
            });
        })
    }

    const getTotalRequests = data => {
        var c = 0;
        for (var tld in data) {
            var obj = data[tld];
            c += obj['count'];
        }

        return c;
    }

    const drawDomainView = (all_data, data, level) => {
        var total = getTotalRequests(data);
        var el = document.getElementById('base');
        var divs = [];
        var eids = [];
        for (var k = 0; k < all_data.length; k++) {
            var d = all_data[k];
            var percent = d['count'] / total;
            var rpercent = d['count'] / (1.2 * all_data[0]['count']);
            var fcolor, color;
            if (percent > 0.2) {
                fcolor = 'black';
                color = "#FA6767";
            } else if (percent > 0.1) {
                color = '#ffe26c';
                fcolor = 'black';
            } else if (percent > 0.05) {
                color = '#00cc00';
                fcolor = 'black';
            } else {
                color = 'rgb(34, 126, 121)';
                fcolor = 'black';
            }
            var name = d['name'];
            var eid = 'tld_' + name;
            eids.push(eid);
            var right = 400 * (1.0 - rpercent);
            var style = 'background-color:' + color + ';color:' + fcolor + ';right:' + right + 'px;' + 'margin-top:5px;' + 'border-radius:5px';
            var html = "<div class='domain' id='" + eid + "'>";
            percent *= 100;
            name = name + ' (' + d['count'] + ')';
            html += "<div class='domain-name' style='" + style + "'>&nbsp;&nbsp;" + name + "</div>";
            html += "<div class='domain-amount'>" + percent.toFixed(2) + "%</div>";
            html += '</div>';
            divs.push(html);
        }
        var html = '<p> Below is a list of domains. Click any of them to get more information.</p>';
        if(divs.length > 0){
            if(level !== 0){
                html += "<button id='backButton'>Back</button>";
            }else{
                html += "<button id='clearButton'>Clear</button>";
                html += "<button style= float:right id='downloadButton'>Download</button>";
            }
            html += divs.join('');
        }else{
            html += "<p>Processing data...</p>"
        }
        el.innerHTML = html;
        return eids;
    }

    const  onClickDomain = level => {
        return async function (e){
            try{
                var target = e.target;
                if(!target.id){
                    target = target.parentNode;
                }
                var id = target.id;
                if(id.indexOf('tld_') !== -1){
                    id = id.replace('tld_', '');
                    var obj = await get(id);
                    var info = JSON.parse(obj);
                    var children = info['children'];
                    if(children.length == 0){
                        await addRequestView(info,id, level + 1);
                    }else{
                        await addInitView(children, level + 1);
                    }
                }
                

            }catch(err){
                throw err;
            }
        }
    }

    const addRequestView = async (info, top_name, level) => {
        try{
            current_level = level;

            var sv = [];
            var values = info['values'];
            for(var n = 0; n < values.length; n++){
                sv.push(values[n].toString());
            }
            var requests = await get(sv);
            var divs = [];
            var rdiv = '<h2>' + top_name + '</h2>';
            rdiv += "<ul>";
            for(var r = values.length - 1; r >= 0; r--){
                var val = values[r].toString();
                if(requests.hasOwnProperty(val)){
                    var request = requests[val];
                    if(!request){
                        continue;
                    }
                    var timestamp = false;
                    var keys = Object.keys(request);
                    if(keys.length === 0){
                        continue;
                    }
                    rdiv += '<li>';
                    var div = '<ul>';
                    for(var key in request){
                        var idiv = '<li>';
                        idiv += "<div class='title'>"+ key +"</div>"


                        var data = request[key];
                        for(var k = 0; k < data.length; k++){
                            var d = JSON.parse(data[k]);
                            if(!timestamp){
                                var ts = new Date(d['timeStamp']);
                                rdiv += "<div class='title'>Web Request on " + ts.toLocaleString() +"</div>"
                                timestamp = true;
                            }

                            var keys = Object.keys(d).sort();
                            idiv += '<ul>'
                            for(var n = 0; n < keys.length; n++){
                                var key = keys[n];
                                var id = d[key];
                                if(Array.isArray(id)){
                                    idiv += "<li><span class='name'>" + key  + "</span><ul>";
                                    for(var p = 0; p < id.length; p++){
                                        var iid = id[p];
                                        if(typeof iid === 'string'){
                                            idiv += '<li>' + id[p] + '</li>';
                                        }else{
                                            if(iid.hasOwnProperty('name') && iid.hasOwnProperty('value')){
                                                idiv += "<li><span class='name'>" + iid['name']  + " : </span><span>" + iid['value'] + "</span></li>";
                                            }
                                        }
                                    }
                                    idiv += "</ul></li>";
                                }else if(typeof id === 'object'){

                                }else{
                                    idiv += "<li><span class='name'>" + key  + " : </span><span>" + id + "</span></li>";
                                }
                            }
                            idiv += '</ul>'
                        }   
                        idiv += "</li>";
                        div += idiv;
                    }
                    div += '</ul>';
                    rdiv += div;
                    rdiv += '</li>';
                }
            }
            rdiv += '</ul>';
            divs.push(rdiv);

            var el = document.getElementById('base');
            if(el){
                var html = '<p> Below is the list of 200 requests</p>';
                html += "<button id='backButton'>Back</button>";
                html += divs.join('');
                el.innerHTML = html;
            }

            var el = document.getElementById('backButton');
            if(el){
                el.addEventListener('click', onBackButton(level));
            }

        }catch(err){
            chrome.extension.getBackgroundPage().console.log(err);
        }
    }

    const onBackButton = level => {
        return async function(e){
            try{
                var obj = view_data[level - 1];
                _addInitViewToDOM(obj.all_data, obj.data, level -1);
            }catch(err){
                throw err;
            }
        }
    }

    const onClearButton = () => {
        chrome.storage.local.clear();
    }

    const _getDownloadName = () => {
        var d = new Date();
        return d.toISOString();
    }

    const onDownloadButton = async () => {
        try{
            var data = await get(null);
            chrome.extension.getBackgroundPage().console.log(data)
            var download_name = _getDownloadName() + '.json';
            var download_data =JSON.stringify(data, null, 2);
            var anchor = document.createElement('a');
            var dataBlob = new Blob([download_data], {type: "application/json"});
            var data_url = window.URL.createObjectURL(dataBlob);
            anchor.setAttribute('href', data_url);
            anchor.setAttribute('download', download_name);
            anchor.click();
        }catch(err){
            chrome.extension.getBackgroundPage().console.log(JSON.stringify(err));
            throw err;
        }
    }

    const addInitView = async (tlds, level) => {
        try {
            current_level = level;

            var all_data = [];
            var data = {};
            var info = await get(tlds);

            for (var k = 0; k < tlds.length; k++) {
                var tld = tlds[k];
                var val = info[tld];
                if(val){
                    var d = JSON.parse(val);
                    d['name'] = tld;
                    data[tld] = d;
                    all_data.push(d);
                }
            }
            all_data.sort( (a, b) =>
                b['count'] - a['count']
            );
            view_data[level] = {'all_data':all_data, 'data':data};
            _addInitViewToDOM(all_data, data, level);
            
        } catch (err) {
            chrome.extension.getBackgroundPage().console.log(JSON.stringify(err));
            throw err;
        }
    }

    const _addInitViewToDOM = (all_data, data, level) => {
        var eids = drawDomainView(all_data, data, level);
        for(var k = 0; k < eids.length; k++){
            var eid = eids[k];
            var el = document.getElementById(eid);

            if(el){
                el.addEventListener('click', onClickDomain(level));
            }
        }

        var el = document.getElementById('backButton');
        if(el){
            el.addEventListener('click', onBackButton(level));
        }

        el = document.getElementById('clearButton');
        if(el){
            el.addEventListener('click', onClearButton);
        }

        el = document.getElementById('downloadButton');
        if(el){
            el.addEventListener('click', onDownloadButton);
        }
    }

    const init = async () => {
        try {
            is_loading = true;
            var tld_data = await get('tlds');
            var tlds = [];
            if(tld_data){
                tlds = JSON.parse(tld_data);
            }
            await addInitView(tlds, 0);
            is_loading = false;
        } catch (err) {
            chrome.extension.getBackgroundPage().console.log(err);
            throw err;
        }
    }

    return {
        init: init
    }
}

View()
document.addEventListener('DOMContentLoaded', View.init);