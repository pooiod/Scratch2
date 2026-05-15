(function () {
    var ws = null;
    var connected = false;
    var lastValues = {};
    var intentionalClose = false;
    var reconnectTimer = null;
    var usernameApplied = false;
    var connections = 0;

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
            showStatus("Unable to connect to cloud");
            return;
        }

        showStatus("☁ connecting");

        ws = new WebSocket("wss://clouddata.turbowarp.org");

        ws.onopen = function (e) {
            connected = true;
            intentionalClose = false;

            console.warn(e);

            showStatus("☁ connected");

            ws.send(JSON.stringify({
                method: "handshake",
                user: username,
                project_id: currentProjectId
            }) + "\n");

            syncFromLocal();
            syncAll();
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
                    if (!isCloudName(raw)) continue;

                    var value = String(msg.value);
                    lastValues[raw] = value;

                    if (value === "0") lsRemove(raw);
                    else lsSet(raw, value);

                    if (swfReady()) swf.ASsetVarValue(raw, msg.value);
                }
            }
        };

        ws.onclose = function (e) {
            if (e.code === 1000 || e.code === 1001) {
                showStatus("disconnected from cloud");
                return;
            }

            if (e.code === 101) {
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

            reconnectTimer = setTimeout(function () {
                reconnectTimer = null;
                connect();
            }, 1000);
        };
    }

    function setCloud(name, value) {
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

    function syncAll() {
        if (!swfReady()) return;

        var vars = swf.ASgetAllVars();

        for (var i = 0; i < vars.length; i++) {
            var v = vars[i];
            if (!isCloudName(v.name)) continue;

            if (v.value === "" || v.value === 0 || v.value === "0") {
                var stored = lsGet(v.name);
                if (stored !== null) {
                    swf.ASsetVarValue(v.name, stored);
                    setCloud(v.name, stored);
                }
            } else {
                setCloud(v.name, v.value);
            }
        }
    }

    function syncFromLocal() {
        if (!swfReady()) return;

        var vars = swf.ASgetAllVars();

        for (var i = 0; i < vars.length; i++) {
            var v = vars[i];
            if (!isCloudName(v.name)) continue;

            var stored = lsGet(v.name);
            if (stored !== null) {
                swf.ASsetVarValue(v.name, stored);
                setCloud(v.name, stored);
            }
        }
    }

    function watchForCloudVar() {
        if (!swfReady()) return false;

        var vars = swf.ASgetAllVars();

        for (var i = 0; i < vars.length; i++) {
            if (isCloudName(vars[i].name)) return true;
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

        currentHash = nextHash;

        var nextProjectId = getProjectIdFromHash();

        if (nextProjectId === currentProjectId) return;

        currentProjectId = nextProjectId;

        disconnect(true);

        // if (currentProjectId) showStatus("swapping cloud servers");
    }

    function updateLoop() {
        updateHashState();
        applyUsername();

        if (!currentProjectId) {
            disconnect(true);
            return;
        }

        if (!swfReady()) return;
        if (!watchForCloudVar()) return;

        if (!connected && !ws) connect();

        if (!connected || !ws) return;

        var vars = swf.ASgetAllVars();

        for (var i = 0; i < vars.length; i++) {
            var v = vars[i];
            if (!isCloudName(v.name)) continue;

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
