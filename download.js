var maxWidth = 0;
var jszip = null;
var id = null;
var sourceZip = null;

function loadConverterLibrary() {
    return new Promise((resolve, reject) => {
        if (window.SB3ToSB2) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://scratchflash.pages.dev/convert.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error("Failed to load convert.js"));
        document.head.appendChild(script);
    });
}

function logMessage(msg){
    console.log(msg);
    if (!document.getElementById("log")) return;
    $("#log").text(msg+"\n"+$("#log").text());
    $("#LoaderStatus").text(msg);
}

function setProgress(perc){
    if (!document.getElementById("log")) return;
    maxWidth = $("#downloader").width();
    $("#progress").width(perc + '%');
    maxWidth = $("#loadholder").width();
    $("#loadprogress").width(perc + '%');
    if (document.getElementById("virtual-kb-host")) {
        document.getElementById("loadholder").style.transform = "translateX(-30px)";
    }
    maxWidth = $("#loadholder2").width();
    $("#loadprogress2").width(perc + '%');
}

function animError() {
    if (!document.getElementById("log")) return;
    setProgress(100);
    $("#scratchloader").css("opacity", 0);
    $("#BigLoader").css("opacity", 0);
    $("#downloader").css("height", 50);
    $("#progress").addClass("error");
    $("#progress").animate({opacity:0}, 1000, function(){
        $(this).css({"opacity":1, width:0});
    });
}

function psuccess(){
    if (!document.getElementById("log")) return;
    setProgress(100);
    setTimeout(() => {
        $("#progress").addClass("success");
        $("#progress").animate({opacity:0}, 1000, function(){
            $(this).css({"opacity":1, width:0});
        });
    }, 100);
}

function perror(err){
    alert("Error: " + err.message);
    logMessage("Error: " + err.message);
    animError();
}

function finish(content) {
    logMessage("Opening project...");
    setProgress(100);
    if (window.gotZipBase64) {
        window.gotZipBase64(content);
        psuccess();
    } else {
        logMessage("Error: window.gotZipBase64 not found.");
    }
}

function finalizeZip(zip) {
    logMessage("Preparing sb2...");
    setProgress(95);
    
    if (typeof zip.generateAsync === "function") {
        zip.generateAsync({type: "base64"}).then(function(content) {
            finish(content);
        });
    } else {
        var content = zip.generate({type: "base64"});
        finish(content);
    }
}

async function startDownload(projectId) {
    if (document.getElementById("log")) {
        $("#progress").removeClass("error success");
        $("#progress").css("opacity", 1);
        $("#scratchloader").css("opacity", 1);
        document.getElementById("loadholder").classList.remove("pulse");
    }

    logMessage("Loading converter library...");
    try {
        await loadConverterLibrary();
    } catch(err) {
        perror(err);
        return;
    }

    window.SB3ToSB2.setLogHandler(logMessage);

    logMessage("Starting download for " + projectId);
    setProgress(5);

    try {
        const { projectData, sourceZip: szip, type, base64 } = await window.SB3ToSB2.downloadProject(projectId, setProgress);
        sourceZip = szip;
        jszip = new JSZip();

        if (type === 'base64') {
            if (window.gotZipBase64) {
                window.gotZipBase64(base64);
                psuccess();
            } else {
                throw new Error('window.gotZipBase64 not found.');
            }
            return;
        }

        if (type === 'sb3') {
            await window.SB3ToSB2.processSB3(projectData, jszip, sourceZip, setProgress);
            finalizeZip(jszip);
        } else if (type === 'legacy') {
            finish(projectData);
        } else {
            await window.SB3ToSB2.processNormal(projectData, jszip, setProgress);
            finalizeZip(jszip);
        }

    } catch (err) {
        console.error(err);
        perror(err);
    }
}
