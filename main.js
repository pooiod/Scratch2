var swf = document.querySelector('#scratch embed');

window.gotZipBase64 = function(content) {
    $("#log").text("Opening project"+"\n"+$("#log").text());
    var tries = 0;
    var openTimeout = setInterval(()=>{
        tries += 1;
        if (swf.ASopenProjectFromData) {
            clearInterval(openTimeout);
            swf.ASopenProjectFromData(content);
            setTimeout(() => {
                $('#downloader').animate({height: 0}, 1000);
            }, 100);
        } else if (tries >= 100) {
            clearInterval(openTimeout);
            $("#log").text("Failed to open project"+"\n"+$("#log").text());
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
