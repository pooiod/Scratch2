window.scratchActiveSounds = {};

function scratchSoundPlay(id, dataUri, volume) {
    var audio = new Audio();

    audio.src = dataUri;
    audio.volume = Math.max(0, Math.min(1, volume));

    window.scratchActiveSounds[id] = {
        audio: audio,
        playing: true
    };

    audio.onended = function() {
        if (window.scratchActiveSounds[id]) {
            window.scratchActiveSounds[id].playing = false;
            delete window.scratchActiveSounds[id];
        }
    };

    var playPromise = audio.play();

    if (playPromise !== undefined) {
        playPromise.catch(function(err) {
            console.error("Audio error:", err.name, err.message);

            if (window.scratchActiveSounds[id]) {
                window.scratchActiveSounds[id].playing = false;
            }
        });
    } else {
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
}

function scratchSoundIsPlaying(id) {
    var soundRecord = window.scratchActiveSounds[id];
    if (soundRecord) {
        var isPlaying = soundRecord.playing && !soundRecord.audio.paused && !soundRecord.audio.ended;
        return isPlaying;
    }
    return false;
}
