function showProjectPicker() {
    var css = `
    .s2-popup { position: fixed; top: 100px; left: 100px; width: 800px; height: 500px; background: #E0E0E0; border-radius: 8px; border: 1px solid #B0B0B0; box-shadow: 0 10px 25px rgba(0,0,0,0.3); display: flex; flex-direction: column; overflow: hidden; z-index: 2147483647; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
    .s2-header { height: 35px; background: linear-gradient(to bottom, #E0E0E0, #C0C0C0); border-bottom: 1px solid #A0A0A0; display: flex; align-items: center; padding: 0 10px; justify-content: space-between; cursor: move; user-select: none; }
    .s2-title { font-weight: bold; color: #505050; font-size: 14px; text-shadow: 0 1px 0 #FFF; pointer-events: none; }
    .s2-close { width: 22px; height: 22px; background: #CC3333; border: 1px solid #AA2222; border-radius: 4px; color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 12px; font-weight: bold; }
    .s2-close:hover { background: #FF4444; }
    .s2-toolbar { padding: 8px; background: #D0D0D0; border-bottom: 1px solid #B0B0B0; display: flex; gap: 8px; }
    .s2-input { flex: 1; padding: 5px; border: 1px solid #999; border-radius: 4px; outline: none; }
    .s2-btn { padding: 5px 12px; background: linear-gradient(to bottom, #4CB7FF, #2E95DC); border: 1px solid #2080C0; border-radius: 4px; color: white; font-weight: bold; cursor: pointer; }
    .s2-grid { flex: 1; overflow-y: auto; padding: 10px; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; background: #F2F2F2; }
    .s2-card { background: white; border: 1px solid #C0C0C0; border-radius: 4px; padding: 8px; cursor: pointer; }
    .s2-card:hover { border-color: #4CB7FF; background: #F9F9F9; }
    .s2-thumb { width: 100%; aspect-ratio: 4/3; background: #ddd; margin-bottom: 6px; border: 1px solid #e0e0e0; }
    .s2-img { width: 100%; height: 100%; object-fit: cover; }
    .s2-name { font-size: 13px; font-weight: bold; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .s2-meta { font-size: 11px; color: #777; margin-top: 4px; }
    .s2-msg { grid-column: 1/-1; text-align: center; padding: 20px; color: #666; }
    `;
    var style = document.createElement('style');
    style.innerHTML = css;
    document.head.appendChild(style);

    var popup = document.createElement('div');
    popup.className = 's2-popup';

    var header = document.createElement('div');
    header.className = 's2-header';
    var title = document.createElement('span');
    title.className = 's2-title';
    title.innerText = 'Scratch Project Browser';
    var close = document.createElement('div');
    close.className = 's2-close';
    close.innerText = '×';
    close.onclick = function() { document.body.removeChild(popup); };
    header.appendChild(title);
    header.appendChild(close);

    var toolbar = document.createElement('div');
    toolbar.className = 's2-toolbar';
    var input = document.createElement('input');
    input.className = 's2-input';
    input.placeholder = 'Search projects...';
    var btn = document.createElement('button');
    btn.className = 's2-btn';
    btn.innerText = 'Go';
    toolbar.appendChild(input);
    toolbar.appendChild(btn);

    var grid = document.createElement('div');
    grid.className = 's2-grid';

    popup.appendChild(header);
    popup.appendChild(toolbar);
    popup.appendChild(grid);
    document.body.appendChild(popup);

    var isDragging = false, offset = [0,0];
    header.onmousedown = function(e) { isDragging = true; offset = [popup.offsetLeft - e.clientX, popup.offsetTop - e.clientY]; };
    document.onmousemove = function(e) { if(isDragging) { popup.style.left = (e.clientX + offset[0]) + 'px'; popup.style.top = (e.clientY + offset[1]) + 'px'; } };
    document.onmouseup = function() { isDragging = false; };

    var page = 0, query = '', loading = false, finished = false;

    function createCard(p) {
        var c = document.createElement('div');
        c.className = 's2-card';
        c.onclick = function() { window.location.hash = '#' + p.id; window.location.reload(); };
        var imgBox = document.createElement('div');
        imgBox.className = 's2-thumb';
        var img = document.createElement('img');
        img.className = 's2-img';
        img.src = p.image;
        imgBox.appendChild(img);
        var name = document.createElement('div');
        name.className = 's2-name';
        name.innerText = p.title;
        var meta = document.createElement('div');
        meta.className = 's2-meta';
        meta.innerText = 'by ' + (p.author ? p.author.username : '???');
        c.appendChild(imgBox);
        c.appendChild(name);
        c.appendChild(meta);
        grid.appendChild(c);
    }

    function load(q, reset) {
        if(loading || finished) return;
        loading = true;
        if(reset) { page = 0; grid.innerHTML = '<div class="s2-msg">Loading...</div>'; finished = false; }
        var limit = 20;
        var api;
        if(/^\d+$/.test(q)) {
            api = 'https://api.scratch.mit.edu/projects/' + q;
            fetch(api).then(r => r.json()).then(p => { grid.innerHTML = ''; createCard(p); finished = true; }).catch(() => { grid.innerHTML = '<div class="s2-msg">Project not found.</div>'; finished = true; });
            loading = false;
            return;
        }
        api = q ? `https://api.scratch.mit.edu/search/projects?q=${encodeURIComponent(q)}&limit=${limit}&offset=${page*limit}` : `https://api.scratch.mit.edu/explore/projects?limit=${limit}&offset=${page*limit}`;
        var proxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(api);
        fetch(proxy).then(r => r.json()).then(data => {
            if(reset) grid.innerHTML = '';
            if(!data || data.length === 0) { if(page===0) grid.innerHTML = '<div class="s2-msg">No projects found.</div>'; finished = true; return; }
            data.forEach(createCard);
            page++;
            loading = false;
        }).catch(() => { if(page===0) grid.innerHTML = '<div class="s2-msg">Error.</div>'; loading = false; });
    }

    grid.onscroll = function() { if(grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 50) load(query, false); };
    btn.onclick = function() { query = input.value; finished = false; load(query, true); };
    input.onkeydown = function(e) { if(e.key==='Enter') { query = input.value; finished = false; load(query, true); } };

    if(/^\d+$/.test(input.value)) load(input.value, true);
    else load('', true);
}


var button = document.createElement('button');
button.style.position = 'absolute';
button.style.left = '40px';
button.style.top = '0px';
button.style.height = '30px';
button.style.width = '30px';
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
