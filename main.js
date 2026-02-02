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
