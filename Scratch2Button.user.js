// ==UserScript==
// @name         Scratch2 support
// @namespace    https://scratchflash.pages.dev
// @version      2026-16-09
// @description  A button to load projects that don't work in scratch3 using actual scratch2
// @author       pooiod7
// @match        https://scratch.mit.edu/projects/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=scratch.mit.edu
// @grant        none
// @downloadURL https://update.greasyfork.org/scripts/572142/Scratch2%20support.user.js
// @updateURL https://update.greasyfork.org/scripts/572142/Scratch2%20support.meta.js
// ==/UserScript==

(function() {
    let state = false;

    var hasFlash;
    try {
        hasFlash=Boolean(new ActiveXObject("ShockwaveFlash.ShockwaveFlash"));
    } catch(e) {
        hasFlash=navigator.mimeTypes && navigator.mimeTypes["application/x-shockwave-flash"] !== undefined;
    }

    const TIMEOUT_MS = 60000;
    const originalBind = Function.prototype.bind;
    var VM = false;

    new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            Function.prototype.bind = originalBind;
            console.error("Unable to find VM");
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
        VM = vm;
        window.scrtchvm = vm;
        console.log(vm);
    });

    function getProjectId() {
        const match = location.pathname.match(/\/projects\/(\d+)/);
        return match ? match[1] : "";
    }

    function createButton() {
        const btn = document.createElement("button");
        btn.id = "s2btn";
        btn.className = "button sa-s2-button";
        btn.title = "Scratch 2";
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
        const img = document.createElement("img");
        img.src = "/favicon.ico";
        img.style.width = "1.25rem";
        img.style.height = "1.25rem";
        btn.appendChild(img);
        btn.onclick = toggle;
        return btn;
    }

    async function insertButton() {
        const wrap = document.querySelector("div.project-buttons");
        if (!wrap) return;
        if (document.querySelector("#s2btn")) return;

        const s2Button = createButton();
        const remixButton = wrap.querySelector('button.remix-button');
        const seeInsideButton = wrap.querySelector('button.see-inside-button');

        window.scratchActiveSounds = true;

        if (remixButton) {
            wrap.insertBefore(s2Button, remixButton.nextSibling);
        } else if (seeInsideButton) {
            wrap.insertBefore(s2Button, seeInsideButton.nextSibling);
        } else {
            wrap.appendChild(s2Button);
        }

        setTimeout(() => {
            var s2Button = document.getElementById("s2btn")
            if (!document.getElementById("scriptLabel")) {
                s2Button.style.transform = "translateY(5px)";
            } else {
                s2Button.style.transform = "translateY(0px)";
            }
        }, 1000);

        if (!document.getElementById("scriptLabel")) {
            s2Button.style.transform = "translateY(5px)";
        } else {
            s2Button.style.transform = "translateY(0px)";
        }

        window.RufflePlayer = window.RufflePlayer || {};
        window.RufflePlayer.config = {
            allowScriptAccess: true
        };

        await loadLibs([
            {
                global: 'jQuery',
                src: 'https://cdnjs.cloudflare.com/ajax/libs/jquery/2.1.3/jquery.min.js'
            },
            {
                global: 'JSZip',
                src: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
            },
            {
                global: 'SB3ToSB2',
                src: 'https://scratchflash.pages.dev/convert.js'
            },
            "https://scratchflash.pages.dev/rufflesound.js"
        ]);
    }

    async function GetProjectData() {
        const zip = new JSZip();
        const runtime = VM.runtime || VM;

        const rawTargets = runtime.targets || [VM];

        const transformInput = (inp) => {
            if (!inp) return null;
            if (Array.isArray(inp)) return inp;
            if (typeof inp === 'object') {
                const bId = inp.block || null;
                const sId = inp.shadow || null;
                if (bId && sId) {
                    return bId === sId ? [1, bId] : [3, bId, sId];
                }
                if (bId) return [2, bId];
                if (sId) return [1, sId];
            }
            return inp;
        };

        const transformField = (fld) => {
            if (!fld) return ["", null];
            if (Array.isArray(fld)) return fld;
            if (typeof fld === 'object') {
                return [fld.value !== undefined ? String(fld.value) : "", fld.id || null];
            }
            return [String(fld), null];
        };

        const targets = rawTargets.map((target, index) => {
            const isStage = !!target.isStage;
            const name = isStage ? "Stage" : (target.sprite?.name || target.name || `Sprite${index}`);

            const variables = {};
            if (target.variables) {
                Object.entries(target.variables).forEach(([id, v]) => {
                    if (v && v.name !== undefined) {
                        variables[id] = v.isCloud ? [v.name, v.value, true] : [v.name, v.value];
                    }
                });
            }

            const lists = {};
            if (target.lists) {
                Object.entries(target.lists).forEach(([id, l]) => {
                    if (l && l.name !== undefined) {
                        lists[id] = [l.name, Array.isArray(l.value) ? l.value : []];
                    }
                });
            }

            const broadcasts = {};
            if (target.broadcasts) {
                Object.entries(target.broadcasts).forEach(([id, b]) => {
                    broadcasts[id] = typeof b === 'string' ? b : (b.name || b);
                });
            }

            const rawBlocks = target.blocks?._blocks || target.blocks || {};
            const blocks = {};
            Object.entries(rawBlocks).forEach(([id, b]) => {
                if (!b || typeof b !== 'object') return;

                const cleanedInputs = {};
                if (b.inputs) {
                    Object.entries(b.inputs).forEach(([inpName, inpVal]) => {
                        cleanedInputs[inpName] = transformInput(inpVal);
                    });
                }

                const cleanedFields = {};
                if (b.fields) {
                    Object.entries(b.fields).forEach(([fldName, fldVal]) => {
                        cleanedFields[fldName] = transformField(fldVal);
                    });
                }

                const blockObj = {
                    opcode: b.opcode || "",
                    next: b.next || null,
                    parent: b.parent || null,
                    inputs: cleanedInputs,
                    fields: cleanedFields,
                    shadow: !!b.shadow,
                    topLevel: !!b.topLevel
                };

                if (b.topLevel) {
                    blockObj.x = typeof b.x === 'number' ? b.x : 0;
                    blockObj.y = typeof b.y === 'number' ? b.y : 0;
                }

                if (b.mutation) {
                    const mut = {
                        ...b.mutation
                    };
                    delete mut.children;
                    blockObj.mutation = mut;
                }

                blocks[id] = blockObj;
            });

            const rawComments = target.comments || {};
            const comments = {};
            Object.entries(rawComments).forEach(([id, c]) => {
                if (c && typeof c === 'object') {
                    comments[id] = {
                        blockId: c.blockId || null,
                        x: c.x || 0,
                        y: c.y || 0,
                        width: c.width || 200,
                        height: c.height || 200,
                        minimized: !!c.minimized,
                        text: c.text || ""
                    };
                }
            });

            const rawCostumes = target.sprite?.costumes || target.costumes || [];
            const costumes = rawCostumes.map(c => ({
                name: c.name || "costume",
                bitmapResolution: c.bitmapResolution || 1,
                dataFormat: c.dataFormat || "svg",
                assetId: c.assetId || "",
                md5ext: c.md5ext || c.md5 || `${c.assetId}.${c.dataFormat || 'svg'}`,
                rotationCenterX: c.rotationCenterX ?? 0,
                rotationCenterY: c.rotationCenterY ?? 0
            }));

            const rawSounds = target.sprite?.sounds || target.sounds || [];
            const sounds = rawSounds.map(s => ({
                name: s.name || "sound",
                assetId: s.assetId || "",
                dataFormat: s.dataFormat || "wav",
                format: s.format || "",
                rate: s.rate || 44100,
                sampleCount: s.sampleCount || 0,
                md5ext: s.md5ext || s.md5 || `${s.assetId}.${s.dataFormat || 'wav'}`
            }));

            const targetObj = {
                isStage: isStage,
                name: name,
                variables: variables,
                lists: lists,
                broadcasts: broadcasts,
                blocks: blocks,
                comments: comments,
                currentCostume: target.currentCostume || 0,
                costumes: costumes,
                sounds: sounds,
                volume: target.volume ?? 100,
                layerOrder: target.layerOrder ?? 0
            };

            if (isStage) {
                targetObj.tempo = target.tempo ?? 60;
                targetObj.videoTransparency = target.videoTransparency ?? 50;
                targetObj.videoState = target.videoState || "on";
                targetObj.textToSpeechLanguage = target.textToSpeechLanguage || null;
            } else {
                targetObj.visible = target.visible ?? true;
                targetObj.x = target.x ?? 0;
                targetObj.y = target.y ?? 0;
                targetObj.size = target.size ?? 100;
                targetObj.direction = target.direction ?? 90;
                targetObj.draggable = target.draggable ?? false;
                targetObj.rotationStyle = target.rotationStyle || "all around";
            }

            return targetObj;
        });

        let monitors = [];
        if (runtime._monitored) {
            if (typeof runtime._monitored.values === 'function') {
                monitors = Array.from(runtime._monitored.values());
            } else if (typeof runtime._monitored === 'object') {
                monitors = Object.values(runtime._monitored);
            }
        }

        let extensions = [];
        if (runtime.peripheralExtensions) {
            extensions = Object.keys(runtime.peripheralExtensions);
        }

        const projectJsonObj = {
            targets: targets,
            monitors: monitors,
            extensions: extensions,
            meta: {
                semver: "3.0.0",
                vm: "0.2.0",
                agent: navigator.userAgent
            }
        };

        const projectJsonString = JSON.stringify(projectJsonObj);
        zip.file('project.json', projectJsonString);

        const assets = new Map();
        rawTargets.forEach(target => {
            const costumes = target.sprite?.costumes || target.costumes || [];
            const sounds = target.sprite?.sounds || target.sounds || [];

            [...costumes, ...sounds].forEach(item => {
                if (item && item.asset) {
                    const ext = item.dataFormat || item.asset.dataFormat;
                    const id = item.assetId || item.asset.assetId;
                    const fileName = `${id}.${ext}`;
                    let buffer = item.asset.cleanBuffer || item.asset.data;
                    if (!buffer && typeof item.asset.getBuffer === 'function') {
                        buffer = item.asset.getBuffer();
                    }
                    if (buffer) {
                        assets.set(fileName, buffer);
                    } else {
                        console.warn(`GetProjectData: Warning - asset buffer missing for ${fileName}`);
                    }
                }
            });
        });

        assets.forEach((data, fileName) => {
            zip.file(fileName, data, {
                binary: true
            });
        });

        const blob = await zip.generateAsync({
            type: 'blob',
            mimeType: 'application/x.scratch.sb3',
            compression: 'DEFLATE'
        });

        const dataUri = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = (err) => {
                reject(err);
            };
            reader.readAsDataURL(blob);
        });

        return dataUri;
    }

    async function loadLibs(libraries) {
        for (const lib of libraries) {
            const src = typeof lib === 'string' ? lib : lib.src;
            const globalName = typeof lib === 'object' ? lib.global : null;

            if (globalName && typeof window[globalName] !== 'undefined') {
                continue;
            }

            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = () => resolve();
                script.onerror = (err) => {
                    console.error(`Failed to load script: ${src}`, err);
                    reject(err);
                };
                document.head.appendChild(script);
            });
        }
    }

    async function createIframe() {
        const gui = document.querySelector("div.guiPlayer");
        if (!gui) return null;
        var f;

        if (VM && !document.querySelector("#view > div > div.inner > div:nth-child(2) > div.guiPlayer > section > div.stage-wrapper_stage-canvas-wrapper_C8yio.box_box_bP3Aq > div > div.stage_green-flag-overlay-wrapper_8QGSL.box_box_bP3Aq")) {
            f = document.createElement("div");
            f.id = "s2frame";
            f.style.width = "100%";
            f.style.height = "400px";

            function getHTML() {
                return `<style>
                    .scratch-loader-overlay {
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background-color: #4d97ff;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        z-index: 9999;
                        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
                        color: #fff;
                        overflow: hidden;
                        pointer-events: none;
                        transition: opacity ease-in-out 0.5s;
                    }

                    #BigLoader .loader-content {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        width: 100%;
                        max-width: 400px;
                        text-align: center;
                    }

                    #LoaderStatus {
                        color: white;
                    }

                    #BigLoader .block-stack {
                        display: flex;
                        flex-direction: column;
                        align-items: flex-start;
                        margin-bottom: 20px;
                        filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));
                    }

                    #BigLoader .loader-block {
                        display: block;
                        height: 45px;
                        margin-top: -5px;
                        opacity: 0;
                        transform: translateY(20px);
                        animation: blockSlideIn 1.8s infinite ease-in-out;
                    }

                    #BigLoader .block-top { animation-delay: 0s; }
                    #BigLoader .block-mid { animation-delay: 0.2s; }
                    #BigLoader .block-bottom { animation-delay: 0.4s; }

                    @keyframes blockSlideIn {
                        0%, 10% { opacity: 0; transform: translateY(20px); }
                        30%, 70% { opacity: 1; transform: translateY(0px); }
                        90%, 100% { opacity: 0; transform: translateY(-10px); }
                    }

                    #BigLoader .loader-title {
                        font-size: 28px;
                        font-weight: bold;
                        margin: 10px 0 5px 0;
                        letter-spacing: -0.5px;
                        color: white !important;
                    }

                    #BigLoader .loader-status {
                        font-size: 14px;
                        opacity: 0.8;
                        margin-bottom: 25px;
                        font-weight: 300;
                    }

                    #BigLoader .progress-container {
                        width: 250px;
                        height: 10px;
                        background: rgba(255, 255, 255, 0.2);
                        border-radius: 20px;
                        overflow: hidden;
                        position: relative;
                        box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
                        opacity: 0;
                    }

                    #BigLoader .progress-bar {
                        height: 100%;
                        background-color: #fff;
                        border-radius: 20px;
                        transition: width 0.4s ease;
                        box-shadow: 0 0 10px rgba(255,255,255,0.5);
                    }
                </style>
                <object width='100%' height='100%' id='scratch'>
                    <param name='allowscriptaccess' value='always'>
                    <param name="wmode" value="opaque" />
                    <embed src='https://scratchflash.pages.dev/Scratch.swf' allowScriptAccess="always" wmode="opaque" width='100%' height='100%'>
                </object>
                <div class="scratch-loader-overlay" id="BigLoader">
                    <div class="loader-content">
                        <div class="block-stack">
                            <img class="loader-block block-top" src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+Cjxzdmcgd2lkdGg9Ijk2cHgiIGhlaWdodD0iMzVweCIgdmlld0JveD0iMCAwIDk2IDM1IiB2ZXJzaW9uPSIxLjEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiPgogICAgPCEtLSBHZW5lcmF0b3I6IFNrZXRjaCA0OC4xICg0NzI1MCkgLSBodHRwOi8vd3d3LmJvaGVtaWFuY29kaW5nLmNvbS9za2V0Y2ggLS0+CiAgICA8dGl0bGU+dG9wLWJsb2NrPC90aXRsZT4KICAgIDxkZXNjPkNyZWF0ZWQgd2l0aCBTa2V0Y2guPC9kZXNjPgogICAgPGRlZnM+CiAgICAgICAgPHBhdGggZD0iTTAsMi40NjA2MzQ2MiBDMCwxLjEwMTYyNzIyIDEuMSwwIDIuNDU3LDAgTDguODEsMCBDOS40NjIsMCAxMC4wODcsMC4yNTkzODMxMzYgMTAuNTQ4LDAuNzIxMDY1MDg5IEwxNC4wMjIsNC4yMDAyMDQxNCBDMTQuNDgzLDQuNjYxODg2MDkgMTUuMTA4LDQuOTIxMjY5MjMgMTUuNzYsNC45MjEyNjkyMyBMMjMuNTUyLDQuOTIxMjY5MjMgQzI0LjIwNCw0LjkyMTI2OTIzIDI0LjgyOSw0LjY2MTg4NjA5IDI1LjI5LDQuMjAwMjA0MTQgTDI4Ljc2NCwwLjcyMTA2NTA4OSBDMjkuMjI1LDAuMjU5MzgzMTM2IDI5Ljg1LDAgMzAuNTAyLDAgTDkzLjM2NCwwIEM5NC43MjEsMCA5NS44MjEsMS4xMDE2MjcyMiA5NS44MjEsMi40NjA2MzQ2MiBMOTUuODIxLDI3LjA2Njk4MDggQzk1LjgyMSwyOC40MjU5ODgyIDk0LjcyMSwyOS41Mjc2MTU0IDkzLjM2NCwyOS41Mjc2MTU0IEwzMC41MDIsMjkuNTI3NjE1NCBDMjkuODUsMjkuNTI3NjE1NCAyOS4yMjUsMjkuNzg2OTk4NSAyOC43NjQsMzAuMjQ4NjgwNSBMMjUuMjksMzMuNzI3ODE5NSBDMjQuODI5LDM0LjE4OTUwMTUgMjQuMjA0LDM0LjQ0ODg4NDYgMjMuNTUyLDM0LjQ0ODg4NDYgTDE1Ljc2LDM0LjQ0ODg4NDYgQzE1LjEwOCwzNC40NDg4ODQ2IDE0LjQ4MywzNC4xODk1MDE1IDE0LjAyMiwzMy43Mjc4MTk1IEwxMC41NDgsMzAuMjQ4NjgwNSBDMTAuMDg3LDI5Ljc4Njk5ODUgOS40NjIsMjkuNTI3NjE1NCA4LjgxLDI5LjUyNzYxNTQgTDIuNDU3LDI5LjUyNzYxNTQgQzEuMSwyOS41Mjc2MTU0IDAsMjguNDI1OTg4MiAwLDI3LjA2Njk4MDggTDAsMi40NjA2MzQ2MiBaIiBpZD0icGF0aC0xIj48L3BhdGg+CiAgICA8L2RlZnM+CiAgICA8ZyBpZD0iTG9hZGluZy1TdGF0ZSIgc3Ryb2tlPSJub25lIiBzdHJva2Utd2lkdGg9IjEiIGZpbGw9Im5vbmUiIGZpbGwtcnVsZT0iZXZlbm9kZCIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTU4OS4wMDAwMDAsIC0xOTIuMDAwMDAwKSI+CiAgICAgICAgPGcgaWQ9IkFuaW1hdGlvbiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNTg5LjAwMDAwMCwgMTkyLjAwMDAwMCkiPgogICAgICAgICAgICA8ZyBpZD0idG9wLWJsb2NrIj4KICAgICAgICAgICAgICAgIDx1c2UgZmlsbC1vcGFjaXR5PSIwLjIiIGZpbGw9IiNGRkZGRkYiIGZpbGwtcnVsZT0iZXZlbm9kZCIgeGxpbms6aHJlZj0iI3BhdGgtMSI+PC91c2U+CiAgICAgICAgICAgICAgICA8cGF0aCBzdHJva2Utb3BhY2l0eT0iMC4xIiBzdHJva2U9IiNGRkZGRkYiIHN0cm9rZS13aWR0aD0iMSIgZD0iTTAuNSwyLjQ2MDYzNDYyIEwwLjUsMjcuMDY2OTgwOCBDMC41LDI4LjE1MDAxMTEgMS4zNzYzMDc5NiwyOS4wMjc2MTU0IDIuNDU3LDI5LjAyNzYxNTQgTDguODEsMjkuMDI3NjE1NCBDOS41OTQ3MDUyNywyOS4wMjc2MTU0IDEwLjM0NzAwMzIsMjkuMzM5NzU2NCAxMC45MDE4MTQ2LDI5Ljg5NTM4ODUgTDE0LjM3NTgxNDYsMzMuMzc0NTI3NSBDMTQuNzQzMTA1OCwzMy43NDIzNjIxIDE1LjI0MDg1MDMsMzMuOTQ4ODg0NiAxNS43NiwzMy45NDg4ODQ2IEwyMy41NTIsMzMuOTQ4ODg0NiBDMjQuMDcxMTQ5NywzMy45NDg4ODQ2IDI0LjU2ODg5NDIsMzMuNzQyMzYyMSAyNC45MzYxODU0LDMzLjM3NDUyNzUgTDI4LjQxMDE4NTQsMjkuODk1Mzg4NSBDMjguOTY0OTk2OCwyOS4zMzk3NTY0IDI5LjcxNzI5NDcsMjkuMDI3NjE1NCAzMC41MDIsMjkuMDI3NjE1NCBMOTMuMzY0LDI5LjAyNzYxNTQgQzk0LjQ0NDY5MiwyOS4wMjc2MTU0IDk1LjMyMSwyOC4xNTAwMTExIDk1LjMyMSwyNy4wNjY5ODA4IEw5NS4zMjEsMi40NjA2MzQ2MiBDOTUuMzIxLDEuMzc3NjA0MjggOTQuNDQ0NjkyLDAuNSA5My4zNjQsMC41IEwzMC41MDIsMC41IEMyOS45ODI4NTAzLDAuNSAyOS40ODUxMDU4LDAuNzA2NTIyNTA4IDI5LjExNzgxNDYsMS4wNzQzNTcwNyBMMjUuNjQzODE0Niw0LjU1MzQ5NjEzIEMyNS4wODkwMDMyLDUuMTA5MTI4MjIgMjQuMzM2NzA1Myw1LjQyMTI2OTIzIDIzLjU1Miw1LjQyMTI2OTIzIEwxNS43Niw1LjQyMTI2OTIzIEMxNC45NzUyOTQ3LDUuNDIxMjY5MjMgMTQuMjIyOTk2OCw1LjEwOTEyODIyIDEzLjY2ODE4NTQsNC41NTM0OTYxMyBMMTAuMTk0MTg1NCwxLjA3NDM1NzA3IEM5LjgyNjg5NDE2LDAuNzA2NTIyNTA4IDkuMzI5MTQ5NjksMC41IDguODEsMC41IEwyLjQ1NywwLjUgQzEuMzc2MzA3OTYsMC41IDAuNSwxLjM3NzYwNDI4IDAuNSwyLjQ2MDYzNDYyIFoiPjwvcGF0aD4KICAgICAgICAgICAgPC9nPgogICAgICAgIDwvZz4KICAgIDwvZz4KPC9zdmc+">
                            <img class="loader-block block-mid" src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+Cjxzdmcgd2lkdGg9IjY4cHgiIGhlaWdodD0iMzVweCIgdmlld0JveD0iMCAwIDY4IDM1IiB2ZXJzaW9uPSIxLjEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiPgogICAgPCEtLSBHZW5lcmF0b3I6IFNrZXRjaCA0OC4xICg0NzI1MCkgLSBodHRwOi8vd3d3LmJvaGVtaWFuY29kaW5nLmNvbS9za2V0Y2ggLS0+CiAgICA8dGl0bGU+bWlkZGxlLWJsb2NrPC90aXRsZT4KICAgIDxkZXNjPkNyZWF0ZWQgd2l0aCBTa2V0Y2guPC9kZXNjPgogICAgPGRlZnM+CiAgICAgICAgPHBhdGggZD0iTTAsMzQuNDYwNjM0NiBDMCwzMy4xMDE2MjcyIDEuMSwzMiAyLjQ1NywzMiBMOC44MSwzMiBDOS40NjIsMzIgMTAuMDg3LDMyLjI1OTM4MzEgMTAuNTQ4LDMyLjcyMTA2NTEgTDE0LjAyMiwzNi4yMDAyMDQxIEMxNC40ODMsMzYuNjYxODg2MSAxNS4xMDgsMzYuOTIxMjY5MiAxNS43NiwzNi45MjEyNjkyIEwyMy41NTIsMzYuOTIxMjY5MiBDMjQuMjA0LDM2LjkyMTI2OTIgMjQuODI5LDM2LjY2MTg4NjEgMjUuMjksMzYuMjAwMjA0MSBMMjguNzY0LDMyLjcyMTA2NTEgQzI5LjIyNSwzMi4yNTkzODMxIDI5Ljg1LDMyIDMwLjUwMiwzMiBMNjUuMzY0LDMyIEM2Ni43MjEsMzIgNjcuODIxLDMzLjEwMTYyNzIgNjcuODIxLDM0LjQ2MDYzNDYgTDY3LjgyMSw1OS4wNjY5ODA4IEM2Ny44MjEsNjAuNDI1OTg4MiA2Ni43MjEsNjEuNTI3NjE1NCA2NS4zNjQsNjEuNTI3NjE1NCBMMzAuNTAyLDYxLjUyNzYxNTQgQzI5Ljg1LDYxLjUyNzYxNTQgMjkuMjI1LDYxLjc4Njk5ODUgMjguNzY0LDYyLjI0ODY4MDUgTDI1LjI5LDY1LjcyNzgxOTUgQzI0LjgyOSw2Ni4xODk1MDE1IDI0LjIwNCw2Ni40NDg4ODQ2IDIzLjU1Miw2Ni40NDg4ODQ2IEwxNS43Niw2Ni40NDg4ODQ2IEMxNS4xMDgsNjYuNDQ4ODg0NiAxNC40ODMsNjYuMTg5NTAxNSAxNC4wMjIsNjUuNzI3ODE5NSBMMTAuNTQ4LDYyLjI0ODY4MDUgQzEwLjA4Nyw2MS43ODY5OTg1IDkuNDYyLDYxLjUyNzYxNTQgOC44MSw2MS41Mjc2MTU0IEwyLjQ1Nyw2MS41Mjc2MTU0IEMxLjEsNjEuNTI3NjE1NCAwLDYwLjQyNTk4ODIgMCw1OS4wNjY5ODA4IEwwLDM0LjQ2MDYzNDYgWiIgaWQ9InBhdGgtMSI+PC9wYXRoPgogICAgPC9kZWZzPgogICAgPGcgaWQ9IkxvYWRpbmctU3RhdGUiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIxIiBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIHRyYW5zZm9ybT0idHJhbnNsYXRlKC01ODkuMDAwMDAwLCAtMjI0LjAwMDAwMCkiPgogICAgICAgIDxnIGlkPSJBbmltYXRpb24iIHRyYW5zZm9ybT0idHJhbnNsYXRlKDU4OS4wMDAwMDAsIDE5Mi4wMDAwMDApIj4KICAgICAgICAgICAgPGcgaWQ9Im1pZGRsZS1ibG9jayI+CiAgICAgICAgICAgICAgICA8dXNlIGZpbGwtb3BhY2l0eT0iMC4yIiBmaWxsPSIjRkZGRkZGIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIHhsaW5rOmhyZWY9IiNwYXRoLTEiPjwvdXNlPgogICAgICAgICAgICAgICAgPHBhdGggc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlPSIjRkZGRkZGIiBzdHJva2Utd2lkdGg9IjEiIGQ9Ik0wLjUsMzQuNDYwNjM0NiBMMC41LDU5LjA2Njk4MDggQzAuNSw2MC4xNTAwMTExIDEuMzc2MzA3OTYsNjEuMDI3NjE1NCAyLjQ1Nyw2MS4wMjc2MTU0IEw4LjgxLDYxLjAyNzYxNTQgQzkuNTk0NzA1MjcsNjEuMDI3NjE1NCAxMC4zNDcwMDMyLDYxLjMzOTc1NjQgMTAuOTAxODE0Niw2MS44OTUzODg1IEwxNC4zNzU4MTQ2LDY1LjM3NDUyNzUgQzE0Ljc0MzEwNTgsNjUuNzQyMzYyMSAxNS4yNDA4NTAzLDY1Ljk0ODg4NDYgMTUuNzYsNjUuOTQ4ODg0NiBMMjMuNTUyLDY1Ljk0ODg4NDYgQzI0LjA3MTE0OTcsNjUuOTQ4ODg0NiAyNC41Njg4OTQyLDY1Ljc0MjM2MjEgMjQuOTM2MTg1NCw2NS4zNzQ1Mjc1IEwyOC40MTAxODU0LDYxLjg5NTM4ODUgQzI4Ljk2NDk5NjgsNjEuMzM5NzU2NCAyOS43MTcyOTQ3LDYxLjAyNzYxNTQgMzAuNTAyLDYxLjAyNzYxNTQgTDY1LjM2NCw2MS4wMjc2MTU0IEM2Ni40NDQ2OTIsNjEuMDI3NjE1NCA2Ny4zMjEsNjAuMTUwMDExMSA2Ny4zMjEsNTkuMDY2OTgwOCBMNjcuMzIxLDM0LjQ2MDYzNDYgQzY3LjMyMSwzMy4zNzc2MDQzIDY2LjQ0NDY5MiwzMi41IDY1LjM2NCwzMi41IEwzMC41MDIsMzIuNSBDMjkuOTgyODUwMywzMi41IDI5LjQ4NTEwNTgsMzIuNzA2NTIyNSAyOS4xMTc4MTQ2LDMzLjA3NDM1NzEgTDI1LjY0MzgxNDYsMzYuNTUzNDk2MSBDMjUuMDg5MDAzMiwzNy4xMDkxMjgyIDI0LjMzNjcwNTMsMzcuNDIxMjY5MiAyMy41NTIsMzcuNDIxMjY5MiBMMTUuNzYsMzcuNDIxMjY5MiBDMTQuOTc1Mjk0NywzNy40MjEyNjkyIDE0LjIyMjk5NjgsMzcuMTA5MTI4MiAxMy42NjgxODU0LDM2LjU1MzQ5NjEgTDEwLjE5NDE4NTQsMzMuMDc0MzU3MSBDOS44MjY4OTQxNiwzMi43MDY1MjI1IDkuMzI5MTQ5NjksMzIuNSA4LjgxLDMyLjUgTDIuNDU3LDMyLjUgQzEuMzc2MzA3OTYsMzIuNSAwLjUsMzMuMzc3NjA0MyAwLjUsMzQuNDYwNjM0NiBaIj48L3BhdGg+CiAgICAgICAgICAgIDwvZz4KICAgICAgICA8L2c+CiAgICA8L2c+Cjwvc3ZnPg==">
                            <img class="loader-block block-bottom" src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+Cjxzdmcgd2lkdGg9Ijg1cHgiIGhlaWdodD0iMzVweCIgdmlld0JveD0iMCAwIDg1IDM1IiB2ZXJzaW9uPSIxLjEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiPgogICAgPCEtLSBHZW5lcmF0b3I6IFNrZXRjaCA0OC4xICg0NzI1MCkgLSBodHRwOi8vd3d3LmJvaGVtaWFuY29kaW5nLmNvbS9za2V0Y2ggLS0+CiAgICA8dGl0bGU+Ym90dG9tLWJsb2NrPC90aXRsZT4KICAgIDxkZXNjPkNyZWF0ZWQgd2l0aCBTa2V0Y2guPC9kZXNjPgogICAgPGRlZnM+CiAgICAgICAgPHBhdGggZD0iTTAsNjYuNDYwNjM0NiBDMCw2NS4xMDE2MjcyIDEuMSw2NCAyLjQ1Nyw2NCBMOC44MSw2NCBDOS40NjIsNjQgMTAuMDg3LDY0LjI1OTM4MzEgMTAuNTQ4LDY0LjcyMTA2NTEgTDE0LjAyMiw2OC4yMDAyMDQxIEMxNC40ODMsNjguNjYxODg2MSAxNS4xMDgsNjguOTIxMjY5MiAxNS43Niw2OC45MjEyNjkyIEwyMy41NTIsNjguOTIxMjY5MiBDMjQuMjA0LDY4LjkyMTI2OTIgMjQuODI5LDY4LjY2MTg4NjEgMjUuMjksNjguMjAwMjA0MSBMMjguNzY0LDY0LjcyMTA2NTEgQzI5LjIyNSw2NC4yNTkzODMxIDI5Ljg1LDY0IDMwLjUwMiw2NCBMODIuMzY0LDY0IEM4My43MjEsNjQgODQuODIxLDY1LjEwMTYyNzIgODQuODIxLDY2LjQ2MDYzNDYgTDg0LjgyMSw5MS4wNjY5ODA4IEM4NC44MjEsOTIuNDI1OTg4MiA4My43MjEsOTMuNTI3NjE1NCA4Mi4zNjQsOTMuNTI3NjE1NCBMMzAuNTAyLDkzLjUyNzYxNTQgQzI5Ljg1LDkzLjUyNzYxNTQgMjkuMjI1LDkzLjc4Njk5ODUgMjguNzY0LDk0LjI0ODY4MDUgTDI1LjI5LDk3LjcyNzgxOTUgQzI0LjgyOSw5OC4xODk1MDE1IDI0LjIwNCw5OC40NDg4ODQ2IDIzLjU1Miw5OC40NDg4ODQ2IEwxNS43Niw5OC40NDg4ODQ2IEMxNS4xMDgsOTguNDQ4ODg0NiAxNC40ODMsOTguMTg5NTAxNSAxNC4wMjIsOTcuNzI3ODE5NSBMMTAuNTQ4LDk0LjI0ODY4MDUgQzEwLjA4Nyw5My43ODY5OTg1IDkuNDYyLDkzLjUyNzYxNTQgOC44MSw5My41Mjc2MTU0IEwyLjQ1Nyw5My41Mjc2MTU0IEMxLjEsOTMuNTI3NjE1NCAwLDkyLjQyNTk4ODIgMCw5MS4wNjY5ODA4IEwwLDY2LjQ2MDYzNDYgWiIgaWQ9InBhdGgtMSI+PC9wYXRoPgogICAgPC9kZWZzPgogICAgPGcgaWQ9IkxvYWRpbmctU3RhdGUiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIxIiBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIHRyYW5zZm9ybT0idHJhbnNsYXRlKC01ODkuMDAwMDAwLCAtMjU2LjAwMDAwMCkiPgogICAgICAgIDxnIGlkPSJBbmltYXRpb24iIHRyYW5zZm9ybT0idHJhbnNsYXRlKDU4OS4wMDAwMDAsIDE5Mi4wMDAwMDApIj4KICAgICAgICAgICAgPGcgaWQ9ImJvdHRvbS1ibG9jayI+CiAgICAgICAgICAgICAgICA8dXNlIGZpbGwtb3BhY2l0eT0iMC4yIiBmaWxsPSIjRkZGRkZGIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIHhsaW5rOmhyZWY9IiNwYXRoLTEiPjwvdXNlPgogICAgICAgICAgICAgICAgPHBhdGggc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlPSIjRkZGRkZGIiBzdHJva2Utd2lkdGg9IjEiIGQ9Ik0wLjUsNjYuNDYwNjM0NiBMMC41LDkxLjA2Njk4MDggQzAuNSw5Mi4xNTAwMTExIDEuMzc2MzA3OTYsOTMuMDI3NjE1NCAyLjQ1Nyw5My4wMjc2MTU0IEw4LjgxLDkzLjAyNzYxNTQgQzkuNTk0NzA1MjcsOTMuMDI3NjE1NCAxMC4zNDcwMDMyLDkzLjMzOTc1NjQgMTAuOTAxODE0Niw5My44OTUzODg1IEwxNC4zNzU4MTQ2LDk3LjM3NDUyNzUgQzE0Ljc0MzEwNTgsOTcuNzQyMzYyMSAxNS4yNDA4NTAzLDk3Ljk0ODg4NDYgMTUuNzYsOTcuOTQ4ODg0NiBMMjMuNTUyLDk3Ljk0ODg4NDYgQzI0LjA3MTE0OTcsOTcuOTQ4ODg0NiAyNC41Njg4OTQyLDk3Ljc0MjM2MjEgMjQuOTM2MTg1NCw5Ny4zNzQ1Mjc1IEwyOC40MTAxODU0LDkzLjg5NTM4ODUgQzI4Ljk2NDk5NjgsOTMuMzM5NzU2NCAyOS43MTcyOTQ3LDkzLjAyNzYxNTQgMzAuNTAyLDkzLjAyNzYxNTQgTDgyLjM2NCw5My4wMjc2MTU0IEM4My40NDQ2OTIsOTMuMDI3NjE1NCA4NC4zMjEsOTIuMTUwMDExMSA4NC4zMjEsOTEuMDY2OTgwOCBMODQuMzIxLDY2LjQ2MDYzNDYgQzg0LjMyMSw2NS4zNzc2MDQzIDgzLjQ0NDY5Miw2NC41IDgyLjM2NCw2NC41IEwzMC41MDIsNjQuNSBDMjkuOTgyODUwMyw2NC41IDI5LjQ4NTEwNTgsNjQuNzA2NTIyNSAyOS4xMTc4MTQ2LDY1LjA3NDM1NzEgTDI1LjY0MzgxNDYsNjguNTUzNDk2MSBDMjUuMDg5MDAzMiw2OS4xMDkxMjgyIDI0LjMzNjcwNTMsNjkuNDIxMjY5MiAyMy41NTIsNjkuNDIxMjY5MiBMMTUuNzYsNjkuNDIxMjY5MiBDMTQuOTc1Mjk0Nyw2OS40MjEyNjkyIDE0LjIyMjk5NjgsNjkuMTA5MTI4MiAxMy42NjgxODU0LDY4LjU1MzQ5NjEgTDEwLjE5NDE4NTQsNjUuMDc0MzU3MSBDOS44MjY4OTQxNiw2NC43MDY1MjI1IDkuMzI5MTQ5NjksNjQuNSA4LjgxLDY0LjUgTDIuNDU3LDY0LjUgQzEuMzc2MzA3OTYsNjQuNSAwLjUsNjUuMzc3NjA0MyAwLjUsNjYuNDYwNjM0NiBaIj48L3BhdGg+CiAgICAgICAgICAgIDwvZz4KICAgICAgICA8L2c+CiAgICA8L2c+Cjwvc3ZnPg==">
                        </div>

                        <h1 class="loader-title">Loading Project</h1>
                        <p class="loader-status" id="LoaderStatus">Preparing Scratch2...</p>

                        <div class="progress-container" id="loadholder">
                            <div class="progress-bar" id="loadprogress" style="width: 0%;"></div>
                        </div>
                    </div>
                </div>`;
            } f.innerHTML = getHTML();

            if (!hasFlash) {
                function ruffleit() {
                    var ruffle = window.RufflePlayer.newest();
                    var player = ruffle.createPlayer();
                    player.style.width = "100%";
                    player.style.height = "100%";
                    document.getElementById("scratch")?.remove();
                    f.appendChild(player);
                    player.load({url:"https://scratchflash.pages.dev/Scratch.swf", autoplay:"on", unmuteOverlay:"hidden", "wmode": "opaque", maxExecutionDuration: 99999999999});
                    swf = document.querySelector('#scratch embed') || document.querySelector('ruffle-player') || document.querySelector('ruffle-player');

                    const wrapper = document.createElement("div");
                    const box = document.createElement("div");
                    const topBar = document.createElement("div");
                    const redButton = document.createElement("div");

                    function sizeBox() {
                        const pWidth = f.clientWidth;
                        const pHeight = f.clientHeight;
                        const pad = pWidth < 550 ? 0 : 10;
                        const maxW = pWidth - pad * 2;
                        const maxH = pHeight - pad * 2 - 40;
                        let w = maxW;
                        let h = w * 3 / 4;
                        if (h > maxH) {
                            h = maxH;
                            w = h * 4 / 3;
                        }
                        box.style.width = w + "px";
                        box.style.height = h + "px";
                        wrapper.style.width = w + "px";
                        wrapper.style.height = h + 40 + "px";
                    }

                    Object.assign(wrapper.style, {
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        pointerEvents: "none",
                        opacity: "0"
                    });

                    Object.assign(topBar.style, {
                        height: "40px",
                        width: "100%",
                        background: "rgba(153,153,153,0.5)",
                        display: "flex",
                        alignItems: "center"
                    });

                    Object.assign(redButton.style, {
                        width: "60px",
                        height: "100%",
                        background: "red",
                        pointerEvents: "auto",
                        cursor: "pointer"
                    });

                    Object.assign(box.style, {
                        padding: "5px",
                        boxSizing: "border-box",
                        background: "rgba(204,204,204,0.5)"
                    });

                    topBar.appendChild(redButton);
                    wrapper.appendChild(topBar);
                    wrapper.appendChild(box);
                    f.appendChild(wrapper);

                    window.addEventListener("resize", sizeBox);
                    sizeBox();

                    function toggleFullscreen() {
                        var f = document.getElementById("s2frame");
                        if (!document.fullscreenElement) {
                            if (f.requestFullscreen) {
                                f.requestFullscreen();
                            } else if (f.webkitRequestFullscreen) {
                                f.webkitRequestFullscreen();
                            }
                        } else {
                            document.exitFullscreen();
                        }
                    }

                    function handleClick(e) {
                        const rect = redButton.getBoundingClientRect();
                        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
                            toggleFullscreen();
                        }
                    }

                    window.addEventListener("mousedown", handleClick);
                    window.addEventListener("touchstart", e => {
                        handleClick(e.touches[0]);
                    });
                }

                if (!window.RufflePlayer.sources) {
                    var s = document.createElement("script");
                    s.src = "https://cdn.jsdelivr.net/npm/@ruffle-rs/ruffle";
                    s.onload = function(){
                        ruffleit();
                    };
                    document.head.appendChild(s);
                } else {
                    ruffleit();
                }
            } else {
                swf = document.querySelector('#scratch embed') || document.querySelector('ruffle-embed') || document.querySelector('ruffle-player');
            }

            gotZipBase64 = function(content) {
                var tries = 0;

                var openTimeout = setInterval(function() {
                    tries += 1;
                    console.log("Waiting for flash,", tries, "seconds");

                    if (tries >= 40) {
                        document.getElementById("LoaderStatus").innerText = "Something may be wrong";
                    }

                    swf = document.querySelector('#scratch embed') || document.querySelector('ruffle-embed') || document.querySelector('ruffle-player');
                    if (typeof swf !== 'undefined' && swf.ASopenProjectFromData) {
                        clearInterval(openTimeout);
                        swf.ASopenProjectFromData(content);
                        swf.AScallFlashFunction("setEditMode", [false]);

                        setTimeout(function() {
                            document.getElementById("BigLoader").style.opacity = "0";
                        }, 800);
                    }
                }, 1000);
            };

            window.JSeditorReady = async function() {
                document.getElementById("LoaderStatus").innerText = "Getting project from vm...";
                var dataUri = await GetProjectData();

                const base64Data = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
                const sourceZip = await JSZip.loadAsync(base64Data, { base64: true });
                const projectJsonText = await sourceZip.file('project.json').async('string');
                const projectData = JSON.parse(projectJsonText);
                window.SB3ToSB2.setLogHandler(console.log);

                const targetZip = new JSZip();
                document.getElementById("LoaderStatus").innerText = "Converting project...";
                await window.SB3ToSB2.processSB3(projectData, targetZip, sourceZip);

                dataUri = await targetZip.generateAsync({ type: 'base64' });
                gotZipBase64(dataUri);
            }


        } else {
            f = document.createElement("iframe");
            f.id = "s2frame";
            f.style.width = "100%";
            f.style.height = "400px";
            f.style.border = "0";
            f.allow = "fullscreen";
            f.src = "https://scratchflash.pages.dev/embed/#" + getProjectId();
        }

        gui.appendChild(f);

        return f;
    }

    function toggle() {
        if (document.querySelector(".sa-tw-iframe-container")) return;

        state = !state;

        const stage = document.querySelector("section.stage-wrapper_stage-wrapper_odn2t.box_box_bP3Aq");
        const info = document.querySelector("div.project-info-alerts");
        let f = document.querySelector("#s2frame");

        if (state) {
            if (stage) stage.style.display = "none";
            if (info) info.style.display = "none";
            if (!f) f = createIframe();
        } else {
            if (stage) stage.style.display = "";
            if (info) info.style.display = "";
            if (f) f.remove();
        }
    }

    function tick() {
        insertButton();
    }

    setInterval(tick, 500);
    window.addEventListener("load", tick);
    window.addEventListener("popstate", tick);
})();
