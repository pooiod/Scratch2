function showProjectPicker() {
    var css = ".s2-popup { position: fixed; top: 100px; left: 100px; width: 800px; height: 500px; background: #E0E0E0; border-radius: 8px; border: 1px solid #B0B0B0; box-shadow: 0 10px 25px rgba(0,0,0,0.3); display: -ms-flexbox; -ms-flex-direction: column; overflow: hidden; z-index: 2147483647; font-family: Helvetica, Arial, sans-serif; } " +
    ".s2-header { height: 35px; background: #E0E0E0; background: linear-gradient(#E0E0E0, #C0C0C0); border-bottom: 1px solid #A0A0A0; display: -ms-flexbox; -ms-flex-align: center; padding: 0 10px; -ms-flex-pack: justify; cursor: move; } " +
    ".s2-title { font-weight: bold; font-size: 14px; } " +
    ".s2-close { width: 22px; height: 22px; background: #929292; border-radius: 4px; color: #fff; display: -ms-flexbox; -ms-flex-align: center; -ms-flex-pack: center; cursor: pointer; text-align: center; line-height: 22px; } " +
    ".s2-toolbar { padding: 8px; background: #D0D0D0; border-bottom: 1px solid #B0B0B0; display: -ms-flexbox; } " +
    ".s2-input { -ms-flex: 1; padding: 5px; border: 1px solid #999; border-radius: 4px; margin-right: 8px; } " +
    ".s2-btn { padding: 5px 12px; background: #4CB7FF; background: linear-gradient(#4CB7FF, #2E95DC); border: 1px solid #2080C0; border-radius: 4px; color: white; font-weight: bold; cursor: pointer; } " +
    ".s2-grid { position: relative; -ms-flex: 1; overflow-y: auto; padding: 10px; background: #F2F2F2; font-size: 0; } " +
    ".s2-card { display: inline-block; width: 180px; vertical-align: top; margin: 5px; background: #fff; border: 1px solid #C0C0C0; border-radius: 4px; padding: 8px; cursor: pointer; font-size: 12px; } " +
    ".s2-thumb { width: 100%; height: 135px; background: #ddd; margin-bottom: 6px; overflow: hidden; } " +
    ".s2-img { width: 100%; min-height: 100%; } " +
    ".s2-name { font-size: 13px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000; } " +
    ".s2-meta { font-size: 11px; color: #777; } " +
    ".s2-msg { text-align: center; padding: 40px; color: #666; font-size: 14px; width: 100%; } " +
    ".s2-spinner { position: absolute; bottom: 10px; right: 10px; width: 28px; height: 28px; border: 4px solid #bbb; border-top-color: #4CB7FF; border-radius: 50%; animation: s2spin 1s linear infinite; -ms-animation: s2spin 1s linear infinite; display: none; } " +
    "@keyframes s2spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } " +
    "@-ms-keyframes s2spin { from { -ms-transform: rotate(0deg); } to { -ms-transform: rotate(360deg); } }";
    
    var style = document.createElement("style");
    style.type = "text/css";
    if (style.styleSheet) {
        style.styleSheet.cssText = css;
    } else {
        style.appendChild(document.createTextNode(css));
    }
    document.getElementsByTagName("head")[0].appendChild(style);

    var popup = document.createElement("div");
    popup.className = "s2-popup";

    var header = document.createElement("div");
    header.className = "s2-header";

    var title = document.createElement("div");
    title.className = "s2-title";
    title.appendChild(document.createTextNode("Scratch Project Browser"));

    var close = document.createElement("div");
    close.className = "s2-close";
    close.appendChild(document.createTextNode("×"));
    close.onclick = function () { 
        if (popup.parentNode) popup.parentNode.removeChild(popup); 
    };

    header.appendChild(title);
    header.appendChild(close);

    var toolbar = document.createElement("div");
    toolbar.className = "s2-toolbar";

    var input = document.createElement("input");
    input.className = "s2-input";
    input.setAttribute("placeholder", "Project id, url, or search query");

    var btn = document.createElement("button");
    btn.className = "s2-btn";
    btn.appendChild(document.createTextNode("Go"));

    toolbar.appendChild(input);
    toolbar.appendChild(btn);

    var grid = document.createElement("div");
    grid.className = "s2-grid";

    var spinner = document.createElement("div");
    spinner.className = "s2-spinner";
    grid.appendChild(spinner);

    popup.appendChild(header);
    popup.appendChild(toolbar);
    popup.appendChild(grid);
    document.body.appendChild(popup);

    var dragging = false;
    var ox = 0;
    var oy = 0;

    header.onmousedown = function (e) {
        e = e || window.event;
        dragging = true;
        ox = popup.offsetLeft - e.clientX;
        oy = popup.offsetTop - e.clientY;
    };

    var mouseMoveHandler = function (e) {
        if (dragging) {
            e = e || window.event;
            popup.style.left = (e.clientX + ox) + "px";
            popup.style.top = (e.clientY + oy) + "px";
        }
    };

    var mouseUpHandler = function () {
        dragging = false;
    };

    if (document.addEventListener) {
        document.addEventListener("mousemove", mouseMoveHandler, false);
        document.addEventListener("mouseup", mouseUpHandler, false);
    } else {
        document.attachEvent("onmousemove", mouseMoveHandler);
        document.attachEvent("onmouseup", mouseUpHandler);
    }

    var page = 0;
    var query = "";
    var loading = false;
    var done = false;
    var limit = 40;

    function showText(txt) {
        grid.innerHTML = "";
        var msg = document.createElement("div");
        msg.className = "s2-msg";
        msg.appendChild(document.createTextNode(txt));
        grid.appendChild(msg);
        grid.appendChild(spinner);
    }

    function addCard(p) {
        var card = document.createElement("div");
        card.className = "s2-card";
        card.onclick = function () {
            window.location.hash = p.id;
            if (typeof startDownload === "function") startDownload(p.id);
            close.onclick();
        };

        var thumb = document.createElement("div");
        thumb.className = "s2-thumb";

        var img = document.createElement("img");
        img.className = "s2-img";
        img.src = p.image || (p.images ? p.images["282x218"] : "");

        thumb.appendChild(img);

        var name = document.createElement("div");
        name.className = "s2-name";
        name.appendChild(document.createTextNode(p.title));

        var meta = document.createElement("div");
        meta.className = "s2-meta";
        var authorName = (p.author ? p.author.username : (p.username || "?"));
        meta.appendChild(document.createTextNode("by " + authorName));

        card.appendChild(thumb);
        card.appendChild(name);
        card.appendChild(meta);
        grid.appendChild(card);
    }

    function load(reset) {
        if (/^\d+$/.test(query) || query.indexOf("http") === 0) {
            if (query.indexOf("http") === 0) {
                var currentUrl = window.location.href;
                var base = currentUrl.split('?')[0];
                window.location.href = base + "?project_url=" + encodeURIComponent(query);
            } else {
                window.location.hash = query;
            }
            if (typeof startDownload === "function") startDownload(query);
            close.onclick();
            return;
        }

        if (loading) return;
        loading = true;
        spinner.style.display = "block";

        input.blur();

        if (reset) {
            page = 0;
            done = false;
            grid.innerHTML = "";
            grid.appendChild(spinner);
        }

        var api = query
            ? "https://scratch.pooiod7.workers.dev/search/projects?q=" + encodeURIComponent(query) + "&limit=" + limit + "&offset=" + (page * limit)
            : "https://scratch.pooiod7.workers.dev/explore/projects?mode=recent&limit=" + limit + "&offset=" + (page * limit);

        var xhr = new XMLHttpRequest();
        xhr.open("GET", api, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    var data = JSON.parse(xhr.responseText);
                    if (!data || data.length === 0) {
                        if (page === 0) {
                            showText(query ? "No projects found" : "Make a search to find projects");
                        }
                        done = true;
                    } else {
                        for (var i = 0; i < data.length; i++) {
                            addCard(data[i]);
                        }
                        page++;
                    }
                } else {
                    done = true;
                    showText("Unable to load projects");
                }
                spinner.style.display = "none";
                loading = false;
            }
        };
        xhr.send();
    }

    grid.onscroll = function () {
        if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 80 && !done) {
            load(false);
        }
    };

    btn.onclick = function () {
        query = input.value.replace(/^\s+|\s+$/g, '');
        load(true);
    };

    input.onkeydown = function (e) {
        e = e || window.event;
        var key = e.key || e.keyCode;
        if (key === "Enter" || key === 13) {
            query = input.value.replace(/^\s+|\s+$/g, '');
            load(true);
        }
    };

    query = input.value.replace(/^\s+|\s+$/g, '');
    load(true);
}

var button = document.createElement('button');
button.style.position = 'absolute';
button.style.left = '40px';
button.style.top = '0px';
button.style.height = '30px';
button.style.width = '35px';
button.style.backgroundColor = 'red';
button.style.zIndex = '99999';
button.style.filter = 'alpha(opacity=0)';
button.style.opacity = '0';
button.style.pointerEvents = 'none';
document.body.appendChild(button);

var secondButton = null;

var mainMouseMove = function (e) {
    e = e || window.event;
    var x = e.clientX;
    var y = e.clientY;
    var rect = button.getBoundingClientRect();
    var hovering = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    if (hovering && !secondButton) {
        secondButton = document.createElement('button');
        secondButton.style.position = 'absolute';
        secondButton.style.left = '40px';
        secondButton.style.top = '54px';
        secondButton.style.height = '30px';
        secondButton.style.width = '250px';
        secondButton.style.backgroundColor = 'red';
        secondButton.style.cursor = "pointer";
        secondButton.style.filter = 'alpha(opacity=0)';
        secondButton.style.opacity = '0';
        secondButton.style.zIndex = '99999';
        secondButton.onclick = showProjectPicker;
        document.body.appendChild(secondButton);
    }
};

if (document.addEventListener) {
    document.addEventListener('mousemove', mainMouseMove, false);
} else {
    document.attachEvent('onmousemove', mainMouseMove);
}

var removeSecondButton = function () {
    setTimeout(function () {
        if (secondButton) {
            if (secondButton.parentNode) secondButton.parentNode.removeChild(secondButton);
            secondButton = null;
        }
    }, 200);
};

if (window.addEventListener) {
    window.addEventListener('mouseup', removeSecondButton, true);
    window.addEventListener('mousedown', removeSecondButton, true);
} else {
    document.attachEvent('onmouseup', removeSecondButton);
    document.attachEvent('onmousedown', removeSecondButton);
}
