var swf = document.querySelector('#scratch embed') || document.querySelector('#scratch ruffle-embed');

window.gotZipBase64 = function(content) {
    $("#log").text("Waiting for flash hook"+"\n"+$("#log").text());
    var tries = 0;
    var openTimeout = setInterval(()=>{
        swf = document.querySelector('#scratch embed') || document.querySelector('#scratch ruffle-embed');
        tries += 1;

        if (swf && swf.ASopenProjectFromData) {
            $("#log").text("Opening project"+"\n"+$("#log").text());
            clearInterval(openTimeout);
            swf.ASopenProjectFromData(content);
            setTimeout(() => {
                $('#downloader').animate({height: 0}, 1000);
            }, 100);
        } else if (tries >= 20) {
            clearInterval(openTimeout);
            $("#log").text("Hook not found"+"\n"+$("#log").text());
            alert("Unable to access flash apis");
            setTimeout(() => {
                $('#downloader').animate({height: 0}, 1000);
            }, 1000);
        }
    }, 1000);
};

window.JSdownloadSB2 = function(data, filename) {
    var a = document.createElement('a');
    a.href = 'data:application/octet-stream;charset=utf-16le;base64,' + data;
    a.setAttribute('download', filename);
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
};

if (JSwillDownload()) {
    document.body.classList.add('download');
    startDownload(location.hash.slice(1));
}
