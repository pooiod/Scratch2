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
        var clean = String(n).replace(/\u00A0/g, " ").trim();
        clean = clean.replace(/^(☁|cloud:)\s*/i, "").trim();
        return clean.toLowerCase() === "fetch";
    }

    function isInsideIframe() {
        try {
            return window.self !== window.top;
        } catch (e) {
            return true;
        }
    }

    function isPlayerPath() {
        var path = location.pathname.toLowerCase();
        return (
            isInsideIframe() ||
            path.includes("phosphorus") ||
            path.includes("player") ||
            path.includes("embed")
        );
    }

    function isScratchXPath() {
        return location.pathname.toLowerCase().includes("scratchx");
    }

    function getProjectIdFromHash() {
        var searchParams = new URLSearchParams(window.location.search);
        var hash = location.hash ? location.hash.replace(/^#\/?/, "") : "";

        var id = searchParams.get('id') ||
                 searchParams.get('project_url') ||
                 searchParams.get('url') ||
                 hash;

        if (!id) {
            var pathMatches = window.location.pathname.match(/(?:projects|embed|player)\/(\d+)/i) ||
                              window.location.pathname.match(/\/(\d+)/);
            if (pathMatches && pathMatches[1]) {
                id = pathMatches[1];
            }
        }

        if (!id) return "";

        id = decodeURIComponent(String(id)).trim().replace(/\/$/, "");

        if (id.includes("scratch.mit.edu/projects/")) {
            var m = id.match(/projects\/(\d+)/);
            if (m) id = m[1];
        }

        var prefix = isPlayerPath() ? "" : (isScratchXPath() ? "scratchx-" : "editor-");
        return prefix + id;
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
        if (!vars || !vars.length) return null;
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
                    return res.text().then(function (text) {
                        console.log("Project fetched web content:", text);
                        return encode(text);
                    });
                }
            })
            .then(function (encodedResponse) {
                lastValues[fetchVar.name] = encodedResponse;
                if (swfReady()) {
                    swf.ASsetVarValue(fetchVar.name, encodedResponse);
                }
            })
            .catch(function (err) {
                console.error("Fetch error:", err);
                showStatus("☁ web fetch failed");
                if (swfReady()) {
                    swf.ASsetVarValue(fetchVar.name, 0);
                }
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
            try {
                ws.onopen = null;
                ws.onmessage = null;
                ws.onerror = null;
                ws.onclose = null;
                ws.close();
            } catch (e) { }
        }

        ws = null;
        connected = false;

        if (!silent) showStatus("☁ disconnected");
    }

    function connect() {
        if (connected || ws || reconnectTimer || !currentProjectId) return;

        if (connections >= 30) {
            if (connections === 30) {
                showStatus("unable to connect to cloud");
                connections++;
            }
            return;
        }

        connections += 1;
        showStatus("☁ connecting");

        try {
            ws = new WebSocket("wss://clouddata.turbowarp.org");
        } catch (e) {
            console.error("WebSocket creation failed:", e);
            scheduleReconnect();
            return;
        }

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

        ws.onerror = function (e) {
            console.error("WebSocket error:", e);
        };

        ws.onclose = function (e) {
            console.log("WebSocket closed:", e);

            ws = null;
            connected = false;

            if (intentionalClose) {
                intentionalClose = false;
                return;
            }

            if (e.code === 1000 || e.code === 1001) {
                showStatus("disconnected from cloud");
                return;
            }

            if (e.code === 1008 || e.code === 3000 || e.code === 3003) {
                showStatus("unable to connect to cloud, you are banned");
                return;
            }

            rename();
            scheduleReconnect();
        };
    }

    function scheduleReconnect() {
        if (connections >= 30) {
            showStatus("unable to connect to cloud");
            return;
        }

        showStatus("☁ reconnecting");

        if (reconnectTimer) return;
        reconnectTimer = setTimeout(function () {
            reconnectTimer = null;
            connect();
        }, 1000);
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

        if (!connected || !ws || ws.readyState !== WebSocket.OPEN) return;
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
        if (!vars || !vars.length) return false;

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

    function updateState() {
        var nextProjectId = getProjectIdFromHash();
        if (nextProjectId === currentProjectId) return;

        connections = 0;
        currentProjectId = nextProjectId;
        disconnect(true);
    }

    function updateLoop() {
        updateState();
        applyUsername();

        var fetchVar = getFetchVar();
        if (fetchVar) {
            handleFetchVariable(fetchVar);
        }

        if (!currentProjectId) {
            if (connected || ws) disconnect(true);
            return;
        }

        if (!swfReady()) return;

        if (watchForCloudVar()) {
            if (!connected && !ws && !reconnectTimer) {
                connect();
            }
        }

        if (!connected || !ws || ws.readyState !== WebSocket.OPEN) return;

        var vars = swf.ASgetAllVars();
        if (!vars) return;

        for (var i = 0; i < vars.length; i++) {
            var v = vars[i];
            if (!isCloudName(v.name) || isFetchVar(v.name)) continue;

            var value = String(v.value);
            if (lastValues[v.name] !== value) {
                setCloud(v.name, value);
            }
        }
    }

    currentProjectId = getProjectIdFromHash();

    window.addEventListener("hashchange", updateState);
    window.addEventListener("popstate", updateState);

    setInterval(updateLoop, 100);
})();
