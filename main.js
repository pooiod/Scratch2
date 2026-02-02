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
    var isIE = true || /MSIE|Trident/.test(navigator.userAgent);

    if (!isIE) {
        var a = document.createElement('a');
        a.href = 'data:application/octet-stream;charset=utf-16le;base64,' + data;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
    }

    var byteChars = atob(data);
    var byteNums = new Array(byteChars.length);
    for (var i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
    var blob = new Blob([new Uint8Array(byteNums)], { type: 'application/octet-stream' });

    var fd = new FormData();
    fd.append('reqtype', 'fileupload');
    fd.append('time', '1h');
    fd.append('fileToUpload', blob, filename);

    var res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', { method: 'POST', body: fd });
    var url = (await res.text()).trim();

    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999999';

    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:12px;width:360px;padding:20px;font-family:Arial,Helvetica,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3)';

    var title = document.createElement('div');
    title.textContent = 'Your file is ready!';
    title.style.cssText = 'font-size:20px;font-weight:bold;margin-bottom:10px;color:#ff9900';

    var link = document.createElement('a');
    link.href = url;
    link.textContent = url;
    link.target = '_blank';
    link.style.cssText = 'display:block;word-break:break-all;background:#f2f2f2;padding:10px;border-radius:8px;color:#0066cc;text-decoration:none;margin-bottom:15px';

    var btn = document.createElement('button');
    btn.textContent = 'Close';
    btn.style.cssText = 'background:#ff9900;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:14px;cursor:pointer';
    btn.onclick = function () { overlay.remove(); };

    box.appendChild(title);
    box.appendChild(link);
    box.appendChild(btn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
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
