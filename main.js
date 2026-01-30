var swf = document.querySelector('#scratch embed');

window.gotZipBase64 = function(content) {
    $("#log").text("Waiting for flash hook" + "\n" + $("#log").text());
    var tries = 0;
    var openTimeout = setInterval(function(){
        swf = document.getElementById('scratch').getElementsByTagName('embed')[0];
        tries += 1;

        console.log(tries);
        if (swf && swf.ASopenProjectFromData) {
            $("#log").text("Opening project" + "\n" + $("#log").text());
            clearInterval(openTimeout);
            swf.ASopenProjectFromData(content);
            setTimeout(function() {
                $('#downloader').animate({height: 0}, 1000);
            }, 100);
        } else if (tries >= 10) {
            clearInterval(openTimeout);
            $("#log").text("Hook not found" + "\n" + $("#log").text());
            if (!hasFlash) {
                history.replaceState(null, '', location.pathname + '?id=' + location.hash.slice(1));
                location.href = 'https://ie10.ieonchrome.com/#' + location.href;
            }
            setTimeout(function() {
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

// $("#log").text("");
// $("#progress").removeClass("error success");
// $("#progress").css("opacity", 1);
// $("#log").text("value"+"\n"+$("#log").text());
// document.getElementById("downloader").style.height = "100px";
// document.getElementById("downloader").style.display = "block";

var value = (function(){
    var search = window.location.search;
    var hash = decodeURI(location.hash.slice(1));
    var id = '';
    if (search.indexOf('id=') !== -1) {
        id = search.split('id=')[1].split('&')[0];
    } else {
        id = hash;
    }

    if (id.indexOf('#') !== -1) {
        id = id.split('#').pop();
    } else if (id.indexOf('http') === 0) {
        var parts = id.split('/');
        for (var i = 0; i < parts.length; i++) {
            if (/^\d+$/.test(parts[i])) {
                id = parts[i];
                break;
            }
        }
    }
    return id;
})();

if (JSwillDownload()) {
    document.body.classList.add('download');
    startDownload(value);
}
