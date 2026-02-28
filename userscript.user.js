// ==UserScript==
// @name         Scratch3 to Scratch2
// @namespace    http://tampermonkey.net/
// @version      2026-02-28
// @description  Replace Scratch3 with Scratch2
// @author       You
// @match        https://scratch.mit.edu/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=scratch.mit.edu
// @run-at       document-start
// @grant        none
// ==/UserScript==

(async function() {
    'use strict';

    window.VM = null;
    window.RufflePlayer = window.RufflePlayer || {};
    window.RufflePlayer.config = {
        allowScriptAccess: true 
    };


    const externalscripts = [
        "https://unpkg.com/@ruffle-rs/ruffle@0.2.0-nightly.2026.2.2/ruffle.js",
        "https://scratchflash.pages.dev/scratchx/swfobject.js",
        "https://scratchflash.pages.dev/scratchx/jquery-1.11.2.min.js",
        "https://scratchflash.pages.dev/scratchx/download.js"
    ];

    window.loadedexternal = false;

    let loaded = 0;

    externalscripts.forEach(url => {
        const s = document.createElement("script");
        s.src = url;
        s.async = true;
        s.onload = () => {
            loaded++;
            if (loaded === externalscripts.length) {
                window.loadedexternal = true;
            }
        };
        document.head.appendChild(s);
    });


    const REPO_BASE = "https://raw.githubusercontent.com/ScratchAddons/ScratchAddons/refs/heads/master/addons/scratch3to2";
    const JSON_URL = `${REPO_BASE}/addon.json`;
    const STYLE_ID_PREFIX = "s3to2-style-";

    function isForbiddenLogoPresent() {
        return !!document.querySelector('a.logo[href="/"]');
    }

    function isUrlMatch(patterns) {
        const path = window.location.pathname;
        const href = window.location.href;

        return patterns.some(p => {
            if (p === "*") return true;
            if (p === "projects") return /^\/projects\/\d+/.test(path);
            if (p === "studios") return /^\/studios\/\d+/.test(path);
            if (p === "projectEmbeds") return path.includes('/embed');
            if (p === "scratchWWWNoProject") {
                return !path.includes('/editor') && !/^\/projects\/\d+/.test(path);
            }
            if (p.startsWith("http")) {
                const regex = new RegExp("^" + p.split("*").join(".*") + "$");
                return regex.test(href);
            }
            return false;
        });
    }

    async function fetchAndInjectCSS(fileName) {
        if (isForbiddenLogoPresent()) return;

        try {
            const response = await fetch(`${REPO_BASE}/${fileName}`);
            if (!response.ok) return;

            let cssText = await response.text();
            cssText = cssText.split('%addon-self-dir%').join(REPO_BASE);

            if (isForbiddenLogoPresent()) return;

            const style = document.createElement('style');
            style.className = "scratch3to2-injected-style";
            style.id = STYLE_ID_PREFIX + fileName.replace(/[^a-z0-9]/g, '-');
            style.textContent = cssText;

            (document.head || document.documentElement).appendChild(style);
        } catch (err) {
            console.error(`Error loading ${fileName}:`, err);
        }
    }

    const observer = new MutationObserver(() => {
        if (isForbiddenLogoPresent()) {
            const injected = document.querySelectorAll('.scratch3to2-injected-style');
            if (injected.length > 0) {
                injected.forEach(el => el.remove());
            }
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    try {
        const response = await fetch(JSON_URL);
        if (!response.ok) return;

        const data = await response.json();

        data.userstyles.forEach(styleEntry => {
            if (styleEntry.if) return;

            if (isUrlMatch(styleEntry.matches)) {
                fetchAndInjectCSS(styleEntry.url);
            }
        });
    } catch (err) {
        console.error("Could not fetch addon configuration:", err);
    }





    function OpenProjectPage(){
        var el53=document.querySelector('.button_outlined-button_Uhh7R.menu-bar_menu-bar-button_MpcwB.community-button_community-button_XhVUT');
        if (!el53) return;
        el53.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
        el53.dispatchEvent(new MouseEvent('click',{bubbles:true}));
        el53.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    }

	const TIMEOUT_MS = 60000;
	const originalBind = Function.prototype.bind;

	new Promise((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			Function.prototype.bind = originalBind;
			reject(new Error("Timeout"));
		}, TIMEOUT_MS);

		Function.prototype.bind = function(...args) {
			if (Function.prototype.bind === originalBind) return originalBind.apply(this, args);
			if (args[0] && args[0].runtime) {
				Function.prototype.bind = originalBind;
				clearTimeout(timeoutId);
				resolve(args[0]);
				return originalBind.apply(this, args);
			}
			return originalBind.apply(this, args);
		};
	}).then(vm => {
        window.VM = vm;
		console.log(vm);

        if (location.pathname.includes("projects")) loadScratch2(vm);
	}).catch(err => {
		if (err.message == "Timeout") {
            console.log("No runtime found");
        } else {
            console.log("Failed to acquire VM", err);
        }
	});

    const style2435 = document.createElement("style");
    style2435.textContent = `/*.gui.box_box_bP3Aq{display:none!important;}*/
ruffle-player {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 99999999;
}
`;
    document.head.appendChild(style2435);

    async function loadScratch2(VM) {
        await new Promise(r=>{const i=setInterval(()=>window.loadedexternal&&(clearInterval(i),r()),0)});
    
        var flashVars = {
            autostart: 'false',
            extensionDevMode: 'true',
            server: encodeURIComponent(location.host),
            cloudToken: '4af4863d-a921-4004-b2cb-e0ad00ee1927',
            cdnToken: '34f16bc63e8ada7dfd7ec12c715d0c94',
            urlOverrides: {
                sitePrefix: "https://scratch.mit.edu/",
                siteCdnPrefix: "https://cdn.scratch.mit.edu/",
                assetPrefix: "https://assets.scratch.mit.edu/",
                assetCdnPrefix: "https://cdn.assets.scratch.mit.edu/",
                projectPrefix: "https://projects.scratch.mit.edu/",
                projectCdnPrefix: "https://cdn.projects.scratch.mit.edu/",
                internalAPI: "internalapi/",
                siteAPI: "site-api/",
                staticFiles: "scratchr2/static/"
            },
            inIE: (navigator.userAgent.indexOf('MSIE') > -1)
        };

        var params = {
            allowscriptaccess: 'always',
            allowfullscreen: 'true',
            wmode: 'direct',
            menu: 'false'
        };

        $.each(flashVars, function(prop, val) {
            if ($.isPlainObject(val)) {
                val = encodeURIComponent(JSON.stringify(val));
            }
            if (typeof params.flashvars !== 'undefined') {
                params.flashvars += '&' + prop + '=' + val;
            } else {
                params.flashvars = prop + '=' + val;
            }
        });

        swfobject.switchOffAutoHideShow();
        var swfAttributes = {
            data: 'https://scratchflash.pages.dev/WScratch.swf',
            width: '100%',
            height: '100%'
        };

        const div = document.createElement("div");
        div.id = "scratch";
        Object.assign(div.style,{
            position:"fixed",
            top:"0",
            left:"0",
            width:"100vw",
            height:"100vh",
            zIndex:"9999"
        });
        document.body.appendChild(div);

        var swf = swfobject.createSWF(swfAttributes, params, "scratch");

        await new Promise(r=>{const i=setInterval(()=>document.querySelector("ruffle-player").ASloadProject&&(clearInterval(i),r()),0)});

        const match = location.href.match(/projects\/(\d+)/);
        if(match) startDownload(match[1]);
        // document.querySelector("ruffle-player").setEditMode(!1)
    }
})();
