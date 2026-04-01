// ==UserScript==
// @name         Scratch2 support
// @namespace    https://scratchflash.pages.dev
// @version      2026-04-01
// @description  A button to load projects that don't work in scratch3 using actual scratch2
// @author       pooiod7
// @match        https://scratch.mit.edu/projects/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=mit.edu
// @grant        none
// ==/UserScript==

(function() {
    let state = false;

    function getProjectId() {
        const match = location.pathname.match(/\/projects\/(\d+)/);
        return match ? match[1] : "";
    }

    function parseShareDate() {
        const dateDiv = document.querySelector("div.share-date span");
        if (!dateDiv) return true;
        const text = dateDiv.textContent.trim();
        const date = new Date(text);
        const year = date.getFullYear();
        if (isNaN(year)) return true;
        return year >= 2013 && year <= 2019;
    }

    function createButton(id, title, imgSrc) {
        const btn = document.createElement("button");
        btn.id = id;
        btn.className = "button sa-s2-button";
        btn.title = title;
        btn.dataset.saSharedSpaceOrder = "1";
        btn.style.background = "#4e97fe";
        btn.style.padding = "0";
        btn.style.marginTop = "0";
        btn.style.borderRadius = "0.25rem";
        btn.style.height = "2.5rem";
        btn.style.width = "2.5rem";
        btn.style.fontSize = "0.875rem";
        btn.style.display = "inline-flex";
        btn.style.alignItems = "center";
        btn.style.justifyContent = "center";
        if (imgSrc) {
            const img = document.createElement("img");
            img.src = imgSrc;
            img.style.width = "1.25rem";
            img.style.height = "1.25rem";
            btn.appendChild(img);
        }
        btn.onclick = toggle;
        return btn;
    }

    function createTurboWarpButton() {
        const btn = document.createElement("button");
        btn.className = "button sa-tw-button";
        btn.title = "TurboWarp";
        btn.dataset.saSharedSpaceOrder = "1";
        return btn;
    }

    function insertButtons() {
        if (!parseShareDate()) return;
        const wrap = document.querySelector("div.project-buttons");
        if (!wrap) return;
        if (document.querySelector("#s2btn")) return;

        const s2Button = createButton("s2btn", "Scratch 2", "/favicon.ico");
        const remixButton = wrap.querySelector('button.remix-button');
        const seeInside = wrap.querySelector('button.see-inside-button');

        if (remixButton) {
            const twButton = createTurboWarpButton();
            wrap.insertBefore(twButton, remixButton);
            wrap.insertBefore(s2Button, remixButton.nextSibling);
        } else if (seeInside) {
            wrap.insertBefore(s2Button, seeInside.nextSibling);
        } else {
            wrap.appendChild(s2Button);
        }
    }

    function createIframe() {
        const gui = document.querySelector("div.guiPlayer");
        if (!gui) return null;
        const f = document.createElement("iframe");
        f.id = "s2frame";
        f.style.width = "100%";
        f.style.height = "400px";
        f.style.border = "0";
        f.allow = "fullscreen";
        f.src = "https://scratchflash.pages.dev/player/#" + getProjectId();
        gui.appendChild(f);
        return f;
    }

    function toggle() {
        state = !state;
        const stage = document.querySelector("section.stage-wrapper_stage-wrapper_odn2t.box_box_bP3Aq");
        let f = document.querySelector("#s2frame");

        if (state) {
            if (stage) stage.style.display = "none";
            if (!f) f = createIframe();
        } else {
            if (stage) stage.style.display = "";
            if (f) f.remove();
        }
    }

    function tick() {
        insertButtons();
    }

    setInterval(tick, 500);
    window.addEventListener("load", tick);
    window.addEventListener("popstate", tick);

})();
