var swf = document.querySelector('#scratch embed');

// Scratch.FlashApp.ASobj.ASloadGithubURL(extensionUrl);

window.gotZipBase64 = function(content) {
    document.getElementById("loadholder").classList.add("pulse");

    $("#log").text("Waiting for flash hook"+"\n"+$("#log").text());
    var tries = 0;
    var openTimeout = setInterval(()=>{
        swf = document.querySelector('#scratch embed');
        tries += 1;

        console.log(tries);
        if (swf && swf.ASopenProjectFromData) {
            $("#log").text("Opening project"+"\n"+$("#log").text());
            clearInterval(openTimeout);
            swf.ASopenProjectFromData(content);
            setTimeout(() => {
                $("#scratchloader").css("opacity", 0);
                $('#downloader').animate({height: 0}, 1000);
            }, 500);
        } else if (tries >= 10) {
            clearInterval(openTimeout);
            $("#log").text("Hook not found"+"\n"+$("#log").text());
            if (!hasFlash) {
                if (confirm("Download this project?")) {
                    JSdownloadSB2(content, window.DownloadedTitle || "project.sb2");
                } else {
                    alert("Please download this modified scratch 2.0 app, or a browser that supports flash");
                    location.href = "https://pooiod7.itch.io/scratch2";
                }

                // history.replaceState(null,'',`${location.pathname}?id=${location.hash.slice(1)}`);
                // location.href = `https://ie10.ieonchrome.com/#${location.href}`; // Does not work because of js things
            } else {
                title = "Scratch2 - " + DownloadedTitle;
            }
            setTimeout(() => {
                $("#scratchloader").css("opacity", 0);
                $('#downloader').animate({height: 0}, 1000);
            }, 1000);
        }
    }, 1000);
};

window.JSdownloadSB2 = async function(data, filename) {
    var isIE = /MSIE|Trident/.test(navigator.userAgent);

    if (!isIE) {
        var a = document.createElement('a');
        a.href = 'data:application/octet-stream;charset=utf-16le;base64,' + data;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
    }

    var bytes = atob(data);
    var arr = new Array(bytes.length);
    for (var i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    var blob = new Blob([new Uint8Array(arr)], { type: 'application/octet-stream' });

    var fd = new FormData();
    fd.append('reqtype', 'fileupload');
    fd.append('time', '1h');
    fd.append('fileToUpload', blob, filename);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://litterbox.catbox.moe/resources/internals/api.php', true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        var url = xhr.responseText.replace(/\s+/g, '');

        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.45);z-index:9999';

        var box = document.createElement('div');
        box.style.cssText = 'width:380px;background:#fff;border-radius:14px;padding:18px;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-family:Arial';

        var title = document.createElement('div');
        title.textContent = 'Download your project';
        title.style.cssText = 'font-size:20px;font-weight:bold;color:#ff9900;margin-bottom:8px';

        var text = document.createElement('div');
        text.textContent = 'Go to this link to download this project:';
        text.style.cssText = 'font-size:14px;margin-bottom:10px';

        var link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.textContent = url;
        link.style.cssText = 'display:block;background:#f4f4f4;border-radius:8px;padding:10px;color:#0066cc;text-decoration:none;word-break:break-all;margin-bottom:14px';

        var btn = document.createElement('button');
        btn.textContent = 'OK';
        btn.style.cssText = 'background:#ff9900;color:#fff;border:0;border-radius:8px;padding:8px 18px;cursor:pointer';
        btn.onclick = function () { document.body.removeChild(overlay); };

        box.appendChild(title);
        box.appendChild(text);
        box.appendChild(link);
        box.appendChild(btn);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    };
    xhr.send(fd);
};

JSdownloadSB2("", "test.sb2");

// $("#log").text("");
// $("#progress").removeClass("error success");
// $("#progress").css("opacity", 1);
// $("#log").text("value"+"\n"+$("#log").text());
// document.getElementById("downloader").style.height = "100px";
// document.getElementById("downloader").style.display = "block";

var value = new URLSearchParams(window.location.search).get('id') || decodeURI(location.hash.slice(1));

if (value.includes('#')) {
    value = value.split('#').pop();
} else if (value.startsWith('http')) {
    value = value
        .split('/')
        .find(part => /^\d+$/.test(part)) || '';
}

if (JSwillDownload() && value) {
    document.body.classList.add('download');
    startDownload(value);
} else {
    var value2 = new URLSearchParams(window.location.search).get('project_url')
    if (JSwillDownload() && value2) {
        document.body.classList.add('download');
        startDownload(value2);
    }
}
