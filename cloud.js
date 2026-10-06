const charset = [
    "a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z",
    "A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z",
    "0","1","2","3","4","5","6","7","8","9",
    " ", "\n", "\t",
    ".", ",", "!", "?", ":", ";", "-", "_", "+", "=", "/", "\\", "|", "@", "#", "$", "%", "^", "&", "*", "(", ")", "[", "]", "{", "}", "<", ">", "'", "\""
];

function encode(text) {
    let result = "";
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const index = charset.indexOf(char) + 1;
        if (index > 0) {
            result += index < 10 ? "0" + index : index.toString();
        }
    }
    return result;
}

function decode(encodedNum) {
    let result = "";
    for (let i = 0; i < encodedNum.length; i += 2) {
        const pair = encodedNum.substring(i, i + 2);
        const index = parseInt(pair, 10) - 1;
        if (index >= 0 && index < charset.length) {
            result += charset[index];
        }
    }
    return result;
}

function isImageUrl(url) {
    const cleanUrl = url.split("?")[0].split("#")[0].toLowerCase();
    return (
        cleanUrl.endsWith(".png") ||
        cleanUrl.endsWith(".jpg") ||
        cleanUrl.endsWith(".jpeg") ||
        cleanUrl.endsWith(".gif") ||
        cleanUrl.endsWith(".webp")
    );
}

function processImageToPixelData(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);

        img.onload = function () {
            URL.revokeObjectURL(url);

            let width = img.naturalWidth || img.width;
            let height = img.naturalHeight || img.height;

            if (width > 100) {
                const ratio = 100 / width;
                width = 100;
                height = Math.round(height * ratio);
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);

            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;

            let pixelString = width.toString().padStart(3, "0");

            for (let i = 0; i < data.length; i += 4) {
                const r = Math.round((data[i] / 255) * 9);
                const g = Math.round((data[i + 1] / 255) * 9);
                const b = Math.round((data[i + 2] / 255) * 9);
                const a = Math.round((data[i + 3] / 255) * 9);

                pixelString += `${r}${g}${b}${a}`;
            }

            resolve(pixelString);
        };

        img.onerror = function (err) {
            URL.revokeObjectURL(url);
            reject(err);
        };

        img.src = url;
    });
}

(function () {
    var ws = null;
    var connected = false;
    var lastValues = {};
    var intentionalClose = false;
    var reconnectTimer = null;
    var usernameApplied = false;
    var connections = 0;
    var isFetching = false;

    var currentProjectId = "";
    var currentHash = "";

    var username = "player" + Math.floor(1000 + Math.random() * 9000);
    function rename() {
        username = "player" + Math.floor(1000 + Math.random() * 9000);
    }

    var STORAGE_PREFIX = "cloudvar-";

    var toast = document.createElement("div");
    toast.style.position = "fixed";
    toast.style.right = "12px";
    toast.style.bottom = "12px";
    toast.style.padding = "5px 9px";
    toast.style.fontSize = "11px";
    toast.style.fontFamily = "sans-serif";
    toast.style.background = "rgba(0,0,0,0.72)";
    toast.style.color = "#fff";
    toast.style.borderRadius = "6px";
    toast.style.zIndex = "2147483647";
    toast.style.pointerEvents = "none";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(4px)";
    toast.style.transition = "opacity 0.25s ease, transform 0.25s ease";

    function mountToast() {
        var root = document.body || document.documentElement;
        if (root && !toast.parentNode) root.appendChild(toast);
    }

    mountToast();

    var hideTimer = null;

    function showStatus(text, keep) {
        console.log(text);
        mountToast();
        toast.textContent = text;
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";
        if (hideTimer) clearTimeout(hideTimer);
        if (!keep) {
            hideTimer = setTimeout(function () {
                toast.style.opacity = "0";
                toast.style.transform = "translateY(4px)";
            }, 2000);
        }
    }

    function isCloudName(n) {
        return n && (n.indexOf("☁") !== -1 || n.indexOf("cloud:") !== -1);
    }

    function isLocalVar(n) {
        return n && n.toLowerCase().indexOf("local") !== -1;
    }

    function isFetchVar(n) {
        if (!n) return false;
        var cleanName = n.replace(/^☁\s*/, "").replace(/^cloud:\s*/, "").trim();
        return cleanName.toLowerCase() === "fetch";
    }

    function isPlayerPath() {
        return location.pathname.includes("/phosphorus") || location.pathname === "/player" || location.pathname === "/player.html" || location.pathname === "/embed";
    }

    function isScratchXPath() {
        return location.pathname === "/scratchx";
    }

    function getProjectIdFromHash() {
        var hash = location.hash ? location.hash.slice(1) : "";
        hash = new URLSearchParams(window.location.search).get('id') || hash;
        hash = new URLSearchParams(window.location.search).get('project_url') || hash;
        hash = new URLSearchParams(window.location.search).get('url') || hash;
        if (!hash) return "";
        var prefix = isPlayerPath() ? "" : (isScratchXPath()?"scratchx-":"editor-");
        return prefix + decodeURIComponent(hash);
    }

    function swfReady() {
        return typeof swf !== "undefined" && swf && swf.ASgetAllVars && swf.ASsetVarValue;
    }

    function lsKey(name) {
        return STORAGE_PREFIX + currentProjectId + "_" + name;
    }

    function lsSet(name, value) {
        try {
            if (!name.includes("local")) return;
            var v = String(value);
            if (v.length > 100000) v = v.slice(0, 100000);
            localStorage.setItem(lsKey(name), v);
        } catch (e) { }
    }

    function lsGet(name) {
        try {
            return localStorage.getItem(lsKey(name));
        } catch (e) {
            return null;
        }
    }

    function lsRemove(name) {
        try {
            localStorage.removeItem(lsKey(name));
        } catch (e) { }
    }

    function getFetchVar() {
        if (!swfReady()) return null;
        var vars = swf.ASgetAllVars();
        for (var i = 0; i < vars.length; i++) {
            if (isCloudName(vars[i].name) && isFetchVar(vars[i].name)) {
                return vars[i];
            }
        }
        return null;
    }

    function handleFetchVariable(fetchVar) {
        var rawVal = String(fetchVar.value).trim();
        if (!rawVal || isFetching || lastValues[fetchVar.name] === rawVal) return;

        lastValues[fetchVar.name] = rawVal;

        var decodedUrl = decode(rawVal);
        if (!decodedUrl.startsWith("http://") && !decodedUrl.startsWith("https://")) {
            return;
        }

        isFetching = true;
        console.log("Project fetching content:", decodedUrl);

        fetch(decodedUrl)
            .then(function (res) {
                if (!res.ok) throw new Error("HTTP error " + res.status);
                var contentType = res.headers.get("content-type") || "";
                
                if (contentType.includes("image") || isImageUrl(decodedUrl)) {
                    console.log("Project fetched image content");
                    return res.blob().then(processImageToPixelData);
                } else {
                    var text = res.text();
                    console.log("Project fetched web content:", text);
                    return text.then(encode);
                }
            })
            .then(function (encodedResponse) {
                lastValues[fetchVar.name] = encodedResponse;
                swf.ASsetVarValue(fetchVar.name, encodedResponse);
            })
            .catch(function (err) {
                console.error("Fetch error:", err);
                showStatus("☁ web fetch failed");
                swf.ASsetVarValue(fetchVar.name, 0);
            })
            .finally(function () {
                isFetching = false;
            });
    }

    function disconnect(silent) {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        intentionalClose = true;

        if (ws) {
            try { ws.close(); } catch (e) { }
        }

        ws = null;
        connected = false;

        if (!silent) showStatus("☁ disconnected");
    }

    function connect() {
        if (connected || ws || !currentProjectId) return;
        connections += 1;
        if (connections > 10) {
            showStatus("unable to connect to cloud");
            return;
        }

        showStatus("☁ connecting");

        ws = new WebSocket("wss://clouddata.turbowarp.org");

        ws.onopen = function () {
            connected = true;
            intentionalClose = false;
            connections = 0;

            showStatus("☁ connected");

            ws.send(JSON.stringify({
                method: "handshake",
                user: username,
                project_id: currentProjectId
            }) + "\n");
        };

        ws.onmessage = function (e) {
            var lines = e.data.split("\n");

            for (var i = 0; i < lines.length; i++) {
                if (!lines[i]) continue;

                var msg;
                try {
                    msg = JSON.parse(lines[i]);
                } catch (err) {
                    continue;
                }

                if (msg.method === "set") {
                    var raw = msg.name;
                    if (!isCloudName(raw) || isFetchVar(raw)) continue;

                    var value = String(msg.value);
                    lastValues[raw] = value;

                    if (value === "0") lsRemove(raw);
                    else lsSet(raw, value);

                    if (swfReady()) swf.ASsetVarValue(raw, msg.value);
                }
            }
        };

        ws.onclose = function (e) {
            console.log(e);

            if (e.code === 1000 || e.code === 1001) {
                showStatus("disconnected from cloud");
                return;
            }

            if (e.code === 1008 || e.code === 3000 || e.code === 3003) {
                showStatus("unable to connect to cloud, you are banned");
                return;
            }

            ws = null;
            connected = false;
            rename();

            if (intentionalClose) {
                intentionalClose = false;
                return;
            }

            showStatus("☁ reconnecting");

            if (reconnectTimer) return;
            reconnectTimer = setTimeout(function () {
                reconnectTimer = null;
                connect();
            }, 1000);
        };
    }

    function setCloud(name, value) {
        if (isFetchVar(name)) return;

        value = String(value);

        if (value === "0") {
            lsRemove(name);
        } else {
            lsSet(name, value);
        }

        lastValues[name] = value;

        if (!connected || !ws) return;

        if (isLocalVar(name)) return;

        ws.send(JSON.stringify({
            method: "set",
            name: name,
            value: value
        }) + "\n");
    }

    function watchForCloudVar() {
        if (!swfReady()) return false;

        var vars = swf.ASgetAllVars();

        for (var i = 0; i < vars.length; i++) {
            if (isCloudName(vars[i].name) && !isFetchVar(vars[i].name)) return true;
        }

        return false;
    }

    function applyUsername() {
        if (!usernameApplied && swfReady()) {
            swf.ASsetVarValue("username", username);
            usernameApplied = true;
        }
    }

    function updateHashState() {
        var nextHash = location.hash;
        if (nextHash === currentHash) return;
        connections = 0;

        currentHash = nextHash;

        var nextProjectId = getProjectIdFromHash();

        if (nextProjectId === currentProjectId) return;

        currentProjectId = nextProjectId;

        disconnect(true);
    }

    function updateLoop() {
        updateHashState();
        applyUsername();

        var fetchVar = getFetchVar();
        if (fetchVar) {
            handleFetchVariable(fetchVar);
        }

        if (!currentProjectId) {
            disconnect(true);
            return;
        }

        if (!swfReady()) return;
        if (!watchForCloudVar()) {
            if (connected || ws) disconnect(true);
            return;
        }

        if (!connected && !ws) connect();

        if (!connected || !ws) return;

        var vars = swf.ASgetAllVars();

        for (var i = 0; i < vars.length; i++) {
            var v = vars[i];
            if (!isCloudName(v.name) || isFetchVar(v.name)) continue;

            var value = String(v.value);

            if (lastValues[v.name] !== value) {
                setCloud(v.name, value);
            }
        }
    }

    if (location.hash) currentHash = location.hash;
    currentProjectId = getProjectIdFromHash();

    window.addEventListener("hashchange", updateHashState);

    setInterval(updateLoop, 100);
})();
