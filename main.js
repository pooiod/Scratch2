var swf = document.querySelector('#scratch embed');

window.gotZipBase64 = function(content) {
    if (swf.ASopenProjectFromData) {
        swf.ASopenProjectFromData(content);
    } else {
        $("#log").text("Failed to open in flash"+"\n"+$("#log").text());
    }
    setTimeout(() => {
        $('#downloader').animate({height: 0}, 1000);
    }, 100);
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
