function showProjectPicker() {
    var css = `
    .s2-popup { position: fixed; top: 100px; left: 100px; width: 800px; height: 500px; background: #E0E0E0; border-radius: 8px; border: 1px solid #B0B0B0; box-shadow: 0 10px 25px rgba(0,0,0,0.3); display: flex; flex-direction: column; overflow: hidden; z-index: 2147483647; font-family: Helvetica, Arial, sans-serif; }
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
    `;
    var style = document.createElement("style");
    style.innerHTML = css;
    document.head.appendChild(style);

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
    header.appendChild(close);

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

        var meta = document.createElement("div");
        meta.className = "s2-meta";
        meta.innerText = "by " + (p.author ? p.author.username : "?");

        card.appendChild(thumb);
        card.appendChild(name);
        card.appendChild(meta);
        grid.appendChild(card);
    }

    function load(reset) {
        if (/^\d+$/.test(query) || query.startsWith("http")) {
            if (query.startsWith("http")) {
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.set('project_url', query);
                window.history.replaceState({}, '', newUrl);
            } else {
                window.location.hash = query;
            }
            startDownload(query);
            close.click();
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
            : "https://scratch.pooiod7.workers.dev/users/S2Listing/favorites?q=08246&mode=recent&limit=" + limit + "&offset=" + (page * limit); // /explore/projects

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
                    data.forEach(addCard);
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

var button = document.createElement('button');
button.style.position = 'absolute';
button.style.left = '40px';
button.style.top = '0px';
button.style.height = '30px';
button.style.width = '35px';
button.style.backgroundColor = 'red';
button.style.zIndex = '99999';
button.style.opacity = '0';
button.style.pointerEvents = 'none';
document.body.appendChild(button);

var secondButton;

document.addEventListener('mousemove', (e) => {
    const x = e.clientX;
    const y = e.clientY;
    const rect = button.getBoundingClientRect();
    const hovering = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    if (hovering && !secondButton) {
        secondButton = document.createElement('button');
        secondButton.style.position = 'absolute';
        secondButton.style.left = '40px';
        secondButton.style.top = '54px';
        secondButton.style.height = '30px';
        secondButton.style.width = '250px';
        secondButton.style.backgroundColor = 'red';
        secondButton.style.cursor = "pointer";
        secondButton.style.opacity = '0';
        secondButton.style.zIndex = '99999';
        secondButton.onclick = showProjectPicker;
        document.body.appendChild(secondButton);
    }
});

const removeSecondButton = () => {
    setTimeout(() => {
        if (secondButton) {
            secondButton.remove();
            secondButton = null;
        }
    }, 200);
};

window.addEventListener('mouseup', removeSecondButton, true);
window.addEventListener('mousedown', removeSecondButton, true);

function checkHash() {
  if (location.hash === "#96659160") {
    location.href = "/scratchx/box2dcar";
  }
}

checkHash();
window.addEventListener("hashchange", checkHash);
