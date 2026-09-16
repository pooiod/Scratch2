window.scratchActiveSounds = {};

// loading spinner to make it more obvious that the page has not crashed
function getOrCreateSpinner() {
    var spinner = document.getElementById("scratch-audio-spinner");
    if (!spinner) {
        spinner = document.createElement("div");
        spinner.id = "scratch-audio-spinner";

        var style = document.createElement("style");
        style.textContent = `
            #scratch-audio-spinner {
                position: fixed;
                top: 1px;
                right: 1px;
                width: 20px;
                height: 20px;
                border: 3px solid rgba(0, 0, 0, 0.1);
                border-top-color: #3498db;
                border-radius: 50%;
                animation: scratch-spin 0.8s linear infinite;
                z-index: 99999;
                display: none;
                pointer-events: none;
                transition: border-color 0.3s ease-in-out;
            }
            @keyframes scratch-spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(spinner);
    }
    return spinner;
}

function showSpinner() {
    var spinner = getOrCreateSpinner();
    spinner.style.display = "block";
}

function hideSpinner() {
    var spinner = document.getElementById("scratch-audio-spinner");
    if (spinner) {
        spinner.style.display = "none";
    }
}

function startloadingaudio() {
    getOrCreateSpinner().borderTopColor = "#3498db";
    showSpinner(false)
}

function scratchSoundPlay(id, dataUri, volume) {
    getOrCreateSpinner().borderTopColor = "#8adb34";
    showSpinner(true);

    var audio = new Audio();

    audio.src = dataUri;
    audio.volume = Math.max(0, Math.min(1, volume));

    window.scratchActiveSounds[id] = {
        audio: audio,
        playing: true
    };

    audio.oncanplaythrough = function() {
        hideSpinner();
    };

    audio.onended = function() {
        if (window.scratchActiveSounds[id]) {
            window.scratchActiveSounds[id].playing = false;
            delete window.scratchActiveSounds[id];
        }
    };

    var playPromise = audio.play();

    if (playPromise !== undefined) {
        playPromise
            .then(function() {
                hideSpinner();
            })
            .catch(function(err) {
                hideSpinner();
                console.error("Audio error:", err.name, err.message);

                if (window.scratchActiveSounds[id]) {
                    window.scratchActiveSounds[id].playing = false;
                }
            });
    } else {
        hideSpinner();
        console.warn("play() did not return a promise");
    }
}

function scratchSoundStop(id) {
    var soundRecord = window.scratchActiveSounds[id];
    if (soundRecord && soundRecord.audio) {
        soundRecord.audio.pause();
        soundRecord.audio.currentTime = 0;
        soundRecord.playing = false;
        delete window.scratchActiveSounds[id];
    }
    hideSpinner();
}

function scratchSoundIsPlaying(id) {
    var soundRecord = window.scratchActiveSounds[id];
    if (soundRecord) {
        var isPlaying = soundRecord.playing && !soundRecord.audio.paused && !soundRecord.audio.ended;
        return isPlaying;
    }
    return false;
}
