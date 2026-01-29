var swf = document.querySelector('#scratch embed');

window.gotZipBase64 = function(content) {
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
                $('#downloader').animate({height: 0}, 1000);
            }, 100);
        } else if (tries >= 10) {
            clearInterval(openTimeout);
            $("#log").text("Hook not found"+"\n"+$("#log").text());
            if (!hasFlash) {
                location.href = `https://ie10.ieonchrome.com/#${location.href}`;
            }
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

$("#log").text("");
$("#progress").removeClass("error success");
$("#progress").css("opacity", 1);
$("#log").text("value"+"\n"+$("#log").text());
document.getElementById("downloader").style.height = "100px";
document.getElementById("downloader").style.display = "block";

var value = decodeURI(location.hash.slice(1));

$("#log").text(value+"\n"+$("#log").text());

if (value.includes('#')) {
    value = value.split('#').pop();
} else if (value.startsWith('http')) {
    value = value
        .split('/')
        .find(part => /^\d+$/.test(part)) || '';
}

$("#log").text(value+"\n"+$("#log").text());

$("#log").text(JSwillDownload()+"\n"+$("#log").text());

if (JSwillDownload()) {
    document.body.classList.add('download');
    startDownload(value);
}
