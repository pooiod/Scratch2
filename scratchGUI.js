var style2409 = document.createElement("style");
style2409.innerHTML = `
.s2-popup { position: fixed; top: 50px; left: 50px; width: 800px; height: 500px; background: #E0E0E0; border-radius: 8px; border: 1px solid #B0B0B0; box-shadow: 0 10px 25px rgba(0,0,0,0.3); display: flex; flex-direction: column; overflow: hidden; z-index: 2147483647; font-family: Helvetica, Arial, sans-serif; }
.s2-header { height: 35px; background: linear-gradient(#E0E0E0, #C0C0C0); border-bottom: 1px solid #A0A0A0; display: flex; align-items: center; padding: 0 10px; justify-content: space-between; cursor: move; }
.s2-title { font-weight: bold; font-size: 14px; }
.s2-close { width: 22px; height: 22px; background: #929292; border-radius: 4px; color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.s2-toolbar { padding: 8px; background: #D0D0D0; border-bottom: 1px solid #B0B0B0; display: flex; gap: 8px; }
.s2-input { flex: 1; padding: 5px; border: 1px solid #999; border-radius: 4px; }
.s2-btn { padding: 5px 12px; background: linear-gradient(#4CB7FF, #2E95DC); border: 1px solid #2080C0; border-radius: 4px; color: white; font-weight: bold; cursor: pointer; }
.s2-grid { position: relative; flex: 1; overflow-y: auto; padding: 10px; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; background: #F2F2F2; }
.s2-card { background: #fff; border: 1px solid #C0C0C0; border-radius: 4px; padding: 8px; cursor: pointer; }
.s2-thumb { width: 100%; aspect-ratio: 4/3; background: #ddd; margin-bottom: 6px; }
.s2-img { width: 100%; height: 100%; object-fit: cover; }
.s2-name { font-size: 13px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.s2-meta { font-size: 11px; color: #777; }
.s2-msg { grid-column: 1 / -1; text-align: center; padding: 40px; color: #666; font-size: 14px; }
.s2-spinner { position: absolute; bottom: 10px; right: 10px; width: 28px; height: 28px; border: 4px solid #bbb; border-top-color: #4CB7FF; border-radius: 50%; animation: s2spin 1s linear infinite; display: none; }
@keyframes s2spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

@media (max-width: 1000px) {
    .s2-header { cursor: default; }
    .s2-popup {
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        border-radius: 0 !important;
    }
}

.s2-mini-window {
    position: fixed;
    top: 20%;
    left: 50%;
    transform: translateX(-50%);
    width: 380px;
    background-color: #f2f2f2;
    border: 1px solid #999;
    border-radius: 8px 8px 0 0;
    z-index: 999999999;
    font-family: Arial, Helvetica, sans-serif;
    color: #4a4a4a;
    user-select: none;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.s2-mini-header {
    background: linear-gradient(180deg, #FAFAFA 0%, #D2D2D2 100%);
    border-bottom: 1px solid #999;
    padding: 4px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: move;
    height: 26px;
}

.s2-mini-title {
    font-size: 12px;
    font-weight: bold;
    flex-grow: 1;
    text-align: center;
    color: #333;
}

.s2-mini-close-x {
    font-size: 16px;
    cursor: pointer;
    line-height: 1;
}

.s2-mini-body {
    background-color: white;
    padding: 12px 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-radius: 0 0 8px 8px;
}

.s2-mini-section-head {
    font-size: 16px;
    font-weight: bold;
    margin: 0;
}

.s2-mini-text {
    font-size: 12px;
    line-height: 1.4;
    margin: 0 0 4px 0;
    white-space: pre-wrap;
    max-height: 120px;
    overflow-y: auto;
}

.s2-mini-footer {
    display: flex;
    justify-content: center;
    padding-top: 4px;
}

.s2-mini-ok {
    background: linear-gradient(180deg, #FAFAFA 0%, #D2D2D2 100%);
    border: 1px solid #aaa;
    border-radius: 5px;
    padding: 4px 18px;
    font-size: 12px;
    color: #333;
    cursor: pointer;
    box-shadow: inset 0 1px 0 white;
}

.s2-mini-ok:active {
    background: #ccc;
}
`;
document.head.appendChild(style2409);

function showProjectPicker(willreload) {
    var popup = document.createElement("div");
    popup.className = "s2-popup";

    var header = document.createElement("div");
    header.className = "s2-header";

    var title = document.createElement("div");
    title.className = "s2-title";
    title.innerText = "Scratch Project Browser";

    var close = document.createElement("div");
    close.className = "s2-close";
    close.innerText = "×";
    close.onclick = function () { popup.remove(); };

    header.appendChild(title);
    if (!window.skipgui2) header.appendChild(close);

    var toolbar = document.createElement("div");
    toolbar.className = "s2-toolbar";

    var input = document.createElement("input");
    input.className = "s2-input";
    input.placeholder = "Project id, url, or search query";

    var btn = document.createElement("button");
    btn.className = "s2-btn";
    btn.innerText = "Go";

    toolbar.appendChild(input);
    toolbar.appendChild(btn);
    if (!navigator.maxTouchPoints > 0) input.focus();

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
        dragging = true;
        ox = popup.offsetLeft - e.clientX;
        oy = popup.offsetTop - e.clientY;
    };

    document.onmousemove = function (e) {
        if (dragging) {
            popup.style.left = e.clientX + ox + "px";
            popup.style.top = e.clientY + oy + "px";
        }
    };

    document.onmouseup = function () {
        dragging = false;
    };

    var page = 0;
    var query = "";
    var loading = false;
    var done = false;
    var limit = 40;

    function showText(txt) {
        grid.innerHTML = `<div class="s2-msg">${txt}</div>`;
        grid.appendChild(spinner);
    }

    function addCard(p) {
        var card = document.createElement("div");
        card.className = "s2-card";
        card.onclick = function () {
            window.location.hash = p.id;
            startDownload(p.id);
            close.click();
            if (window.skipgui2) location.reload();
        };

        var thumb = document.createElement("div");
        thumb.className = "s2-thumb";

        var img = document.createElement("img");
        img.className = "s2-img";
        img.src = p.image;

        thumb.appendChild(img);

        var name = document.createElement("div");
        name.className = "s2-name";
        name.innerText = p.title;

        var author = p.author ? p.author.username : null;
        var desc = p.description || p.instructions;
        desc = desc.length > 16 ? desc.slice(0,16) + "..." : desc;

        if (!author) author = {
            "170160419": "S2Listing",
            "30177353": "pooiod7",
            "40377592": "BlueEngineer3",
            "17680060": "rookmein",
            "4839310": "-ScratchOs",
            "333184": "RokCoder",
            "1882674": "griffpatch",
            "2690799": "griffpatch_tutor",
            "26235259": "Gracher",
            "3398978": "squig3",
            "574993": "BobbyF",
            "3994425": "Hobson-TV",
            "6777752": "PutneyCat",
            "2544155": "MCAnimator3D",
            "3398978": "squig3",
            "5016638": "IguanaLover",
            "2716932": "ilikelegos",
            "34908": "AddZero",
            "46103807": "Howtomakeausername",
            "44776373": "Spidertest_Recovered",
            "3954248": "_youtubeN1",
            "31563725": "xXName77Xx",
            "94780": "colorgram",
            "1132083": "WO997",
            "14864375": "Java_Programmer",
            "98183580": "alltrue",
            "14036013": "ajzat25",
            "2117258": "AlphaAxle",
            "10249132": "MartinBraendli",
            "14370369": "IguanaLover_PT",
            "3838581": "chooper100",
            "925220": "DadOfMrLog",
            "4496993": "MegaApuTurkUltra",
            "395764": "djdolphin",
            "4549915": "Ctrl-Alt-Llama",
            "52179808": "Xatalyst"
        }[p.author.id] || null;

        var meta = document.createElement("div");
        meta.className = "s2-meta";
        if (author) meta.innerText = "by " + author;
        else if (desc) meta.innerText = desc;
        else meta.innerText = "By unknown";

        card.appendChild(thumb);
        card.appendChild(name);
        card.appendChild(meta);
        grid.appendChild(card);
    }

    function load(reset) {
        if (/^\d+$/.test(query) || query.startsWith("http")) {
            var sid = query.match(/^https:\/\/scratch\.mit\.edu\/projects\/(\d+)\/?$/);
            query = sid ? sid[1] : query;

            if (query.startsWith("http")) {
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.set('project_url', query);
                window.history.replaceState({}, '', newUrl);
            } else {
                window.location.hash = query;
            }
            close.click();
            if (window.skipgui2 || willreload) location.reload();
            startDownload(query);
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
            : "https://scratch.pooiod7.workers.dev/users/S2Listing/favorites?q=824&mode=recent&limit=" + limit + "&offset=" + (page * limit); // /explore/projects

        fetch(api)
            .then(r => r.json())
            .then(data => {
                if (!data || data.length == 0 || !data.length || data == {}) {
                    if (page == 0) {
                        if (query) {
                            showText("No projects found");
                        } else {
                            showText("Make a search to find projects");
                        }
                    }
                    done = true;
                } else {
                    if (!query) {
                        function seededRandom(seed) {
                            let x = Math.sin(seed) * 10000
                            return x - Math.floor(x)
                        }

                        function shuffleWithSeed(arr, seed) {
                            let a = [...arr];
                            for (let i = a.length - 1; i > 0; i--) {
                                let j = Math.floor(seededRandom(seed + i) * (i + 1));
                                ;[a[i], a[j]] = [a[j], a[i]];
                            }
                            return a;
                        }

                        shuffleWithSeed(data, 824).forEach(addCard);
                    } else {
                        data.forEach(addCard);
                    }
                    page++;
                }
                spinner.style.display = "none";
                loading = false;
            })
            .catch((err) => {
                spinner.style.display = "none";
                loading = false;
                done = true;
                showText(err.message || "Unable to load projects");
            });
    }

    grid.onscroll = function () {
        if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 80) {
            load(false);
        }
    };

    btn.onclick = function () {
        query = input.value.trim();
        load(true);
    };

    input.onkeydown = function (e) {
        if (e.key === "Enter") {
            query = input.value.trim();
            load(true);
        }
    };

    query = input.value.trim();
    load(true);
}

function swap() {
    if (window.noswap) return;
    if (location.pathname.includes("player")) {
        const url = new URL(window.location.href);
        url.pathname = url.pathname.replace(/\/player\/?$/, '');
        window.location.href = url.href;
    } else {
        const url = new URL(window.location.href);
        url.pathname = url.pathname.replace(/\/$/, "") + "/player";
        window.location.href = url.href;
    }
}

window.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();

        if (key === 'p' || key === 'e') {
            e.preventDefault();
            swap();
        }
    }
});

async function ShowCard(id) {
    try {
        const response = await fetch(`https://scratch.pooiod7.workers.dev/projects/${id}`);
        const data = await response.json();

        if (!data.instructions && !data.description) return;

        const win = document.createElement('div');
        win.className = 's2-mini-window';

        win.innerHTML = `
            <div class="s2-mini-header">
                <span class="s2-mini-title">${data.title}</span>
                <div class="s2-mini-close-x">&times;</div>
            </div>
            <div class="s2-mini-body">
                <div ${data.instructions?"":'style="display:none"'}>
                    <h2 class="s2-mini-section-head">Instructions</h2>
                    <p class="s2-mini-text">${data.instructions || ""}</p>
                </div ${data.description?"":'style="display:none"'}>
                <div>
                    <h2 class="s2-mini-section-head">Notes and Credits</h2>
                    <p class="s2-mini-text">${data.description || ""}</p>
                </div>
                <div class="s2-mini-footer" ${window.noswap?'style="display:none;"':""}>
                    <div class="s2-mini-ok" id="btnok" style="margin-right: 10px;">OK</div>
                    ${location.pathname.includes("player")?`
                        <div class="s2-mini-ok" id="btnswp" title="ctrl + e" style="margin-right: 10px;">Swap to editor</div>
                        <div class="s2-mini-ok" id="btnswp3" title="a high-performance player">Swap to phosphorus</div>
                    `:`
                        <div class="s2-mini-ok" id="btnswp" title="Do this for better cloud support">Swap to player</div>
                    `}
                </div>
            </div>
        `;

        document.body.appendChild(win);

        const close = () => win.remove();
        win.querySelector('.s2-mini-close-x').onclick = close;
        win.querySelector('#btnok').onclick = close;
        win.querySelector('#btnswp').onclick = swap;
        if (win.querySelector('#btnswp3')) win.querySelector('#btnswp3').onclick = () => {
            const url = new URL(window.location.href);
            url.pathname = url.pathname = url.pathname.replace(/\/player\/?$/, '/phosphorus/player').replace(/#/g, "?id=");
            window.location.href = url.href;
        };

        const header = win.querySelector('.s2-mini-header');
        let active = false, curX, curY, initX, initY, xOff = 0, yOff = 0;

        header.onmousedown = (e) => {
            initX = e.clientX - xOff;
            initY = e.clientY - yOff;
            if (e.target === header || e.target.classList.contains('s2-mini-title')) active = true;
        };

        document.onmousemove = (e) => {
            if (active) {
                e.preventDefault();
                curX = e.clientX - initX;
                curY = e.clientY - initY;
                xOff = curX;
                yOff = curY;
                win.style.transform = `translateX(-50%) translate(${curX}px, ${curY}px)`;
            }
        };

        document.onmouseup = () => active = false;

    } catch (err) {
        console.error(err);
    }
}

// var button = document.createElement('button');
// button.style.position = 'absolute';
// button.style.left = '40px';
// button.style.top = '0px';
// button.style.height = '30px';
// button.style.width = '35px';
// button.style.backgroundColor = 'red';
// button.style.zIndex = '99999';
// button.style.opacity = '0';
// button.style.pointerEvents = 'none';
// document.body.appendChild(button);

// var secondButton;

// document.addEventListener('mousemove', (e) => {
//     const x = e.clientX;
//     const y = e.clientY;
//     const rect = button.getBoundingClientRect();
//     const hovering = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
//     if (hovering && !secondButton) {
//         secondButton = document.createElement('button');
//         secondButton.style.position = 'absolute';
//         secondButton.style.left = '40px';
//         secondButton.style.top = '54px';
//         secondButton.style.height = '30px';
//         secondButton.style.width = '250px';
//         secondButton.style.backgroundColor = 'red';
//         secondButton.style.cursor = "pointer";
//         secondButton.style.opacity = '0';
//         secondButton.style.zIndex = '99999';
//         secondButton.onclick = showProjectPicker;
//         document.body.appendChild(secondButton);
//     }
// });

// const removeSecondButton = () => {
//     setTimeout(() => {
//         if (secondButton) {
//             secondButton.remove();
//             secondButton = null;
//         }
//     }, 200);
// };

// if (!window.skipgui2) {
//     window.addEventListener('mouseup', removeSecondButton, true);
//     window.addEventListener('mousedown', removeSecondButton, true);
// }

if (window.skipgui2 && !location.hash && !new URLSearchParams(window.location.search).has("project_url")) showProjectPicker();

function checkHash() {
  if (location.hash === "#96659160") {
    location.href = "/scratchx/box2dcar";
  }
}

checkHash();
window.addEventListener("hashchange", checkHash);
