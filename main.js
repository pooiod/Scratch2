var swf = document.querySelector('#scratch embed') || document.querySelector('ruffle-player');

function getQueryParam(name) {
    var match = RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return match && decodeURIComponent(match[1].replace(/\+/g, ' '));
}

window.gotZipBase64 = function(content) {
    $("#loadholder").addClass("pulse");

    $("#log").text("Waiting for flash hook" + "\n" + $("#log").text());
    var tries = 0;

    var openTimeout = setInterval(function() {
        swf = document.querySelector('#scratch embed') || document.querySelector('ruffle-player');
        tries += 1;
        console.log("Waiting for flash", tries);

        if (swf && swf.ASopenProjectFromData) {
            $("#log").text("Preparing editor" + "\n" + $("#log").text());
            clearInterval(openTimeout);
            swf.ASopenProjectFromData(content);

            setTimeout(function() {
                $("#BigLoader").css("opacity", 0);
                $("#scratchloader").css("opacity", 0);
                $('#downloader').animate({ height: 0 }, 1000);
            }, 500);
        } else if (tries >= 40) {
            clearInterval(openTimeout);
            $("#log").text("Hook not found" + "\n" + $("#log").text()); // ꧁꧂

            if (window.HasFlashForCurrent) return;

            if (typeof hasFlash !== "undefined" && !hasFlash) {
                var id = (getQueryParam('project_url') || decodeURIComponent(getQueryParam('id') || location.hash.slice(1)))
                if (id) {
                    location.href = "/@#" + id;
                } else {
                    location.href = "/@" + location.hash;
                }
            }

            setTimeout(function() {
                $("#BigLoader").css("opacity", 0);
                $("#scratchloader").css("opacity", 0);
                $('#downloader').animate({ height: 0 }, 1000);
            }, 1000);
        }
    }, 1000);
};

var value = decodeURIComponent(getQueryParam('id') || location.hash.slice(1));

if (value.indexOf('#') !== -1) {
    value = value.split('#').pop();
}
// else if (value.indexOf('http') === 0) {
//     var parts = value.split('/');
//     var foundPart = '';
//     for (var i = 0; i < parts.length; i++) {
//         if (/^\d+$/.test(parts[i])) {
//             foundPart = parts[i];
//             break;
//         }
//     }
//     value = foundPart;
// }

window.startMain = function() {
    document.getElementById("scratchloader").classList.add("hiddenblocks")

    if (typeof JSwillDownload === "function" && JSwillDownload() && value) {
        $("body").addClass('download');
        $("#loadholder2").css("opacity", 1);
        startDownload(value);
    } else {
        var value2 = getQueryParam('project_url');
        if (typeof JSwillDownload === "function" && JSwillDownload() && value2) {
            $("body").addClass('download');
            $("#loadholder2").css("opacity", 1);
            startDownload(value2);
        } else {
            var tries = 0;
            $("#LoaderStatus").text("Loading editor...");
            var waitForScratch = setInterval(function() {
                tries += 1;
                if (document.getElementById("scratch")) {
                    clearInterval(waitForScratch);
                    $("#BigLoader").css("opacity", 0);
                } else if (tries >= 20) {
                    clearInterval(waitForScratch);
                    $("#BigLoader").css("opacity", 0);
                }
            }, 100);
        }
    }
};
