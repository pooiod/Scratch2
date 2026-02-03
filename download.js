var maxWidth = 0;
var jszip = null;
var id = null;
var sourceZip = null;

function logMessage(msg) {
    $("#log").text(msg + "\n" + $("#log").text());
}

function setProgress(perc) {
    maxWidth = $("#downloader").width();
    $("#progress").width(perc + '%');

    maxWidth = $("#loadholder").width();
    $("#loadprogress").width(perc + '%');
}

function animError() {
    setProgress(100);
    $("#progress").addClass("error");
    $("#scratchloader").css("opacity", 0);
    $("#downloader").css("height", 30);
    $("#progress").animate({ opacity: 0 }, 1000, function () {
        $(this).css({ "opacity": 1, width: 0 });
    });
}

function psuccess() {
    setProgress(100);
    setTimeout(function () {
        $("#progress").addClass("success");
        $("#progress").animate({ opacity: 0 }, 1000, function () {
            $(this).css({ "opacity": 1, width: 0 });
        });
    }, 100);
}

function perror(err) {
    console.error(err);
    alert("Error: " + err.message);
    logMessage("Error: " + err.message);
    animError();
}

function startDownload(projectId) {
    $("#progress").removeClass("error success");
    $("#progress").css("opacity", 1);
    $("#scratchloader").css("opacity", 1);
    document.getElementById("loadholder").className = document.getElementById("loadholder").className.replace(/\bpulse\b/g, '');

    logMessage("Initializing download for ID: " + projectId);
    setProgress(5);

    var isDirectSource = projectId && (typeof projectId === 'string') && (projectId.indexOf('http') === 0 || projectId.indexOf('data:') === 0);

    if (isDirectSource) {
        logMessage('Downloading project...');
        setProgress(10);
        window.DownloadedTitle = projectId.split('/').pop().split('.').slice(0, -1).join('.') || 'project';

        var xhr = new XMLHttpRequest();
        xhr.open('GET', projectId, true);
        xhr.responseType = 'blob';
        xhr.onload = function () {
            if (xhr.status !== 200) {
                perror(new Error('Failed to download project from URL.'));
                return;
            }
            var blob = xhr.response;
            handleProjectBlob(blob, isDirectSource);
        };
        xhr.onerror = function () {
            perror(new Error('Network error during download.'));
        };
        xhr.send();
    } else {
        logMessage('Fetching project token...');
        $.getJSON("https://trampoline.turbowarp.org/api/projects/" + projectId, function (metaData) {
            var token = metaData.project_token;
            window.DownloadedTitle = metaData.title;
            logMessage('Downloading project JSON...');
            $.getJSON("https://projects.scratch.mit.edu/" + projectId + "?token=" + token, function (projectData) {
                handleProjectData(projectData);
            }).fail(function () {
                perror(new Error('Failed to download project JSON.'));
            });
        }).fail(function (xhr) {
            if (xhr.status === 404) perror(new Error('Project not found.'));
            else perror(new Error('Failed to fetch project token.'));
        });
    }
}

function handleProjectBlob(blob, isDirectSource) {
    var arrayBufferToBinaryString = function (ab) {
        var bytes = new Uint8Array(ab);
        var CHUNK = 0x8000;
        var str = '';
        for (var i = 0; i < bytes.length; i += CHUNK) {
            str += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        return str;
    };

    var getProjectTextFromZip = function (zipInstance) {
        var deferred = $.Deferred();
        var entry = null;
        if (zipInstance && typeof zipInstance.file === 'function') {
            entry = zipInstance.file('project.json');
            if (!entry && zipInstance.files) {
                for (var name in zipInstance.files) {
                    if (name.toLowerCase().indexOf('project.json', name.length - 12) !== -1) {
                        entry = zipInstance.file(name);
                        break;
                    }
                }
            }
        }
        if (entry) {
            if (typeof entry.async === 'function') {
                entry.async('string').then(function (s) { deferred.resolve(s); });
                return deferred.promise();
            }
            if (typeof entry.asText === 'function') {
                deferred.resolve(entry.asText());
                return deferred.promise();
            }
        }
        deferred.resolve(null);
        return deferred.promise();
    };

    var reader = new FileReader();
    reader.onload = function () {
        var ab = reader.result;
        var zip = new JSZip();
        zip.loadAsync(ab).then(function (loadedZip) {
            sourceZip = loadedZip;
            getProjectTextFromZip(loadedZip).then(function (projText) {
                if (projText) {
                    var projectData = JSON.parse(projText);
                    handleProjectData(projectData, isDirectSource, blob);
                } else {
                    parseAsRawText(blob, isDirectSource);
                }
            });
        }, function () {
            parseAsRawText(blob, isDirectSource);
        });
    };
    reader.readAsArrayBuffer(blob);
}

function parseAsRawText(blob, isDirectSource) {
    var reader = new FileReader();
    reader.onload = function () {
        try {
            var projectData = JSON.parse(reader.result);
            handleProjectData(projectData, isDirectSource, blob);
        } catch (e) {
            perror(new Error('Downloaded file is not a valid project JSON or SB archive.'));
        }
    };
    reader.readAsText(blob);
}

function handleProjectData(projectData, isDirectSource, blob) {
    var isSB3 = projectData && projectData.targets && Array.isArray(projectData.targets);

    if (isDirectSource && !isSB3) {
        var reader = new FileReader();
        reader.onload = function () {
            var base64 = reader.result.split(',')[1];
            if (window.gotZipBase64) {
                window.gotZipBase64(base64);
                psuccess();
            } else {
                perror(new Error('window.gotZipBase64 not found.'));
            }
        };
        reader.readAsDataURL(blob);
        return;
    }

    jszip = new JSZip();
    jszip.comment = "Converted sb3 to sb2 by pooiod7's converter (scratchflash.pages.dev/download)";

    if (isSB3) {
        logMessage('Detected Scratch 3.0 project. Starting conversion...');
        processSB3(projectData);
    } else {
        logMessage('Detected Legacy (SB2) project.');
        processLegacy(projectData);
    }
}

function processSB3(projectData) {
    var converter = new ProjectConverter();
    converter.compat = true;
    converter.unlimJoin = false;
    converter.limList = false;
    converter.penFill = false;

    var totalAssets = 0;
    var completedAssets = 0;
    for (var i = 0; i < projectData.targets.length; i++) {
        var t = projectData.targets[i];
        totalAssets += t.costumes.length + t.sounds.length;
    }

    logMessage("Found " + totalAssets + " assets to convert.");

    var targets = projectData.targets;
    var stage = null;
    var sprites = [];

    var processTargetsSequentially = function (index) {
        if (index >= targets.length) {
            sprites.sort(function (a, b) { return a.layerOrder - b.layerOrder; });
            for (var j = 0; j < sprites.length; j++) delete sprites[j].layerOrder;

            if (!stage) { perror(new Error("No Stage found in JSON.")); return; }
            stage.children = sprites;
            stage.info = stage.info || {};
            stage.info.flashVersion = "MAC 32,0,0,0";
            stage.info.swfVersion = "v461";
            stage.info.spriteCount = sprites.length;
            var scriptCount = stage.scripts.length;
            for (var k = 0; k < sprites.length; k++) scriptCount += sprites[k].scripts.length;
            stage.info.scriptCount = scriptCount;

            jszip.file("project.json", JSON.stringify(stage));
            finalizeZip();
            return;
        }

        var target = targets[index];
        converter.convertTarget(target, jszip, function () {
            completedAssets++;
            var progress = 10 + (80 * (completedAssets / totalAssets));
            setProgress(progress);
        }).then(function (convertedTarget) {
            if (target.isStage) {
                stage = convertedTarget;
            } else {
                convertedTarget.layerOrder = target.layerOrder;
                sprites.push(convertedTarget);
            }
            logMessage("Processed: " + target.name);
            processTargetsSequentially(index + 1);
        });
    };

    processTargetsSequentially(0);
}

function finalizeZip() {
    logMessage("Compressing archive...");
    setProgress(95);
    jszip.generateAsync({ type: "base64" }).then(function (content) {
        finish(content);
    });
}

function finish(content) {
    logMessage("Passing to player...");
    setProgress(100);
    if (window.gotZipBase64) {
        window.gotZipBase64(content);
        psuccess();
    } else {
        logMessage("Error: window.gotZipBase64 not found.");
    }
}

function processLegacy(projectData) {
    var costumeId = 0;
    var soundId = 0;
    var textLayerIDCounter = 100000;
    var assetsToDownload = [];

    var parseNode = function (node) {
        if (node.costumes) {
            for (var i = 0; i < node.costumes.length; i++) {
                var c = node.costumes[i];
                c.baseLayerID = costumeId++;
                c.textLayerID = textLayerIDCounter++;
                assetsToDownload.push({ type: 'costume', data: c });
            }
        }
        if (node.sounds) {
            for (var j = 0; j < node.sounds.length; j++) {
                var s = node.sounds[j];
                s.soundID = soundId++;
                assetsToDownload.push({ type: 'sound', data: s });
            }
        }
        if (node.children) {
            for (var k = 0; k < node.children.length; k++) {
                parseNode(node.children[k]);
            }
        }
    };

    parseNode(projectData);
    var completed = 0;
    var total = assetsToDownload.length;
    logMessage("Found " + total + " legacy assets.");

    var downloadAsset = function (md5, filename) {
        var deferred = $.Deferred();
        if (!md5) { deferred.resolve(); return deferred.promise(); }
        var xhr = new XMLHttpRequest();
        xhr.open('GET', "https://assets.scratch.mit.edu/internalapi/asset/" + md5 + "/get/", true);
        xhr.responseType = 'blob';
        xhr.onload = function () {
            if (xhr.status !== 200) { deferred.resolve(); return; }
            var reader = new FileReader();
            reader.onload = function () {
                var b64 = reader.result.split(',')[1];
                jszip.file(filename, b64, { base64: true });
                deferred.resolve();
            };
            reader.readAsDataURL(xhr.response);
        };
        xhr.onerror = function () { deferred.resolve(); };
        xhr.send();
        return deferred.promise();
    };

    var processLegacySequentially = function (index) {
        if (index >= assetsToDownload.length) {
            jszip.file("project.json", JSON.stringify(projectData));
            finalizeZip();
            return;
        }
        var asset = assetsToDownload[index];
        var p;
        if (asset.type === 'costume') {
            var c = asset.data;
            var ext = c.baseLayerMD5.match(/\.[a-zA-Z0-9]+/)[0];
            p = downloadAsset(c.baseLayerMD5, c.baseLayerID + ext).then(function () {
                if (c.textLayerMD5) {
                    var textExt = c.textLayerMD5.match(/\.[a-zA-Z0-9]+/)[0];
                    return downloadAsset(c.textLayerMD5, c.textLayerID + textExt);
                }
            });
        } else {
            var s = asset.data;
            var sext = s.md5.match(/\.[a-zA-Z0-9]+/)[0];
            p = downloadAsset(s.md5, s.soundID + sext);
        }

        p.then(function () {
            completed++;
            setProgress(10 + (80 * (completed / total)));
            processLegacySequentially(index + 1);
        });
    };

    processLegacySequentially(0);
}

function BlockArgMapper(converter) {
    this.c = converter;
}

BlockArgMapper.prototype = {
    mapArgs: function (opcode, block, blocks) {
        if (this[opcode]) return this[opcode](block, blocks);
        return null;
    },
    motion_movesteps: function (b, bs) { return ['forward:', this.c.inputVal('STEPS', b, bs)]; },
    motion_turnright: function (b, bs) { return ['turnRight:', this.c.inputVal('DEGREES', b, bs)]; },
    motion_turnleft: function (b, bs) { return ['turnLeft:', this.c.inputVal('DEGREES', b, bs)]; },
    motion_pointindirection: function (b, bs) { return ['heading:', this.c.inputVal('DIRECTION', b, bs)]; },
    motion_pointtowards: function (b, bs) { return ['pointTowards:', this.c.inputVal('TOWARDS', b, bs)]; },
    motion_gotoxy: function (b, bs) { return ['gotoX:y:', this.c.inputVal('X', b, bs), this.c.inputVal('Y', b, bs)]; },
    motion_goto: function (b, bs) { return ['gotoSpriteOrMouse:', this.c.inputVal('TO', b, bs)]; },
    motion_glidesecstoxy: function (b, bs) { return ['glideSecs:toX:y:elapsed:from:', this.c.inputVal('SECS', b, bs), this.c.inputVal('X', b, bs), this.c.inputVal('Y', b, bs)]; },
    motion_changexby: function (b, bs) { return ['changeXposBy:', this.c.inputVal('DX', b, bs)]; },
    motion_setx: function (b, bs) { return ['xpos:', this.c.inputVal('X', b, bs)]; },
    motion_changeyby: function (b, bs) { return ['changeYposBy:', this.c.inputVal('DY', b, bs)]; },
    motion_sety: function (b, bs) { return ['ypos:', this.c.inputVal('Y', b, bs)]; },
    motion_ifonedgebounce: function (b, bs) { return ['bounceOffEdge']; },
    motion_setrotationstyle: function (b, bs) { return ['setRotationStyle', this.c.fieldVal('STYLE', b)]; },
    motion_xposition: function (b, bs) { return ['xpos']; },
    motion_yposition: function (b, bs) { return ['ypos']; },
    motion_direction: function (b, bs) { return ['heading']; },
    looks_sayforsecs: function (b, bs) { return ['say:duration:elapsed:from:', this.c.inputVal('MESSAGE', b, bs), this.c.inputVal('SECS', b, bs)]; },
    looks_say: function (b, bs) { return ['say:', this.c.inputVal('MESSAGE', b, bs)]; },
    looks_thinkforsecs: function (b, bs) { return ['think:duration:elapsed:from:', this.c.inputVal('MESSAGE', b, bs), this.c.inputVal('SECS', b, bs)]; },
    looks_think: function (b, bs) { return ['think:', this.c.inputVal('MESSAGE', b, bs)]; },
    looks_show: function (b, bs) { return ['show']; },
    looks_hide: function (b, bs) { return ['hide']; },
    looks_switchcostumeto: function (b, bs) { return ['lookLike:', this.c.inputVal('COSTUME', b, bs)]; },
    looks_nextcostume: function (b, bs) { return ['nextCostume']; },
    looks_switchbackdropto: function (b, bs) { return ['startScene', this.c.inputVal('BACKDROP', b, bs)]; },
    looks_nextbackdrop: function (b, bs) { return ['nextScene']; },
    looks_changeeffectby: function (b, bs) {
        var f = this.c.fieldVal('EFFECT', b);
        if (typeof f === 'string') f = f.toLowerCase();
        return ['changeGraphicEffect:by:', f, this.c.inputVal('CHANGE', b, bs)];
    },
    looks_seteffectto: function (b, bs) {
        var f = this.c.fieldVal('EFFECT', b);
        if (typeof f === 'string') f = f.toLowerCase();
        return ['setGraphicEffect:to:', f, this.c.inputVal('VALUE', b, bs)];
    },
    looks_cleargraphiceffects: function (b, bs) { return ['filterReset']; },
    looks_changesizeby: function (b, bs) { return ['changeSizeBy:', this.c.inputVal('CHANGE', b, bs)]; },
    looks_setsizeto: function (b, bs) { return ['setSizeTo:', this.c.inputVal('SIZE', b, bs)]; },
    looks_gotofrontback: function (b, bs) { return this.c.fieldVal('FRONT_BACK', b) === 'front' ? ['comeToFront'] : ['goBackByLayers:', 1.79e+308]; },
    looks_goforwardbackwardlayers: function (b, bs) {
        var layers = this.c.inputVal('NUM', b, bs);
        if (this.c.fieldVal('FORWARD_BACKWARD', b) === 'forward') {
            if (typeof layers === 'number') layers *= -1;
            else layers = ['*', -1, layers];
        }
        return ['goBackByLayers:', layers];
    },
    looks_costumenumbername: function (b, bs) {
        var numName = this.c.fieldVal('NUMBER_NAME', b);
        if (numName === 'number') return ['costumeIndex'];
        if (this.c.compat && !this.c.targetIsStage) {
            return ['getLine:ofList:', ['costumeIndex'], this.c.varName('SpriteCostumes')];
        }
        return ['costumeName'];
    },
    looks_backdropnumbername: function (b, bs) { return this.c.fieldVal('NUMBER_NAME', b) === 'number' ? ['backgroundIndex'] : ['sceneName']; },
    looks_size: function (b, bs) { return ['scale']; },
    sound_play: function (b, bs) { return ['playSound:', this.c.inputVal('SOUND_MENU', b, bs)]; },
    sound_playuntildone: function (b, bs) { return ['doPlaySoundAndWait', this.c.inputVal('SOUND_MENU', b, bs)]; },
    sound_stopallsounds: function (b, bs) { return ['stopAllSounds']; },
    sound_changevolumeby: function (b, bs) { return ['changeVolumeBy:', this.c.inputVal('VOLUME', b, bs)]; },
    sound_setvolumeto: function (b, bs) { return ['setVolumeTo:', this.c.inputVal('VOLUME', b, bs)]; },
    sound_volume: function (b, bs) { return ['volume']; },
    event_whenflagclicked: function (b, bs) { return ['whenGreenFlag']; },
    event_whenkeypressed: function (b, bs) { return ['whenKeyPressed', this.c.fieldVal('KEY_OPTION', b)]; },
    event_whenthisspriteclicked: function (b, bs) { return ['whenClicked']; },
    event_whenstageclicked: function (b, bs) { return ['whenClicked']; },
    event_whenbackdropswitchesto: function (b, bs) { return ['whenSceneStarts', this.c.fieldVal('BACKDROP', b)]; },
    event_whengreaterthan: function (b, bs) {
        var f = this.c.fieldVal('WHENGREATERTHANMENU', b);
        if (typeof f === 'string') f = f.toLowerCase();
        return ['whenSensorGreaterThan', f, this.c.inputVal('VALUE', b, bs)];
    },
    event_whenbroadcastreceived: function (b, bs) { return ['whenIReceive', this.c.fieldVal('BROADCAST_OPTION', b)]; },
    event_broadcast: function (b, bs) { return ['broadcast:', this.c.inputVal('BROADCAST_INPUT', b, bs)]; },
    event_broadcastandwait: function (b, bs) { return ['doBroadcastAndWait', this.c.inputVal('BROADCAST_INPUT', b, bs)]; },
    control_wait: function (b, bs) { return ['wait:elapsed:from:', this.c.inputVal('DURATION', b, bs)]; },
    control_repeat: function (b, bs) { return ['doRepeat', this.c.inputVal('TIMES', b, bs), this.c.substackVal('SUBSTACK', b, bs)]; },
    control_forever: function (b, bs) { return ['doForever', this.c.substackVal('SUBSTACK', b, bs)]; },
    control_if: function (b, bs) { return ['doIf', this.c.inputVal('CONDITION', b, bs), this.c.substackVal('SUBSTACK', b, bs)]; },
    control_if_else: function (b, bs) { return ['doIfElse', this.c.inputVal('CONDITION', b, bs), this.c.substackVal('SUBSTACK', b, bs), this.c.substackVal('SUBSTACK2', b, bs)]; },
    control_wait_until: function (b, bs) { return ['doWaitUntil', this.c.inputVal('CONDITION', b, bs)]; },
    control_repeat_until: function (b, bs) { return ['doUntil', this.c.inputVal('CONDITION', b, bs), this.c.substackVal('SUBSTACK', b, bs)]; },
    control_stop: function (b, bs) { return ['stopScripts', this.c.fieldVal('STOP_OPTION', b)]; },
    control_start_as_clone: function (b, bs) { return ['whenCloned']; },
    control_create_clone_of: function (b, bs) { return ['createCloneOf', this.c.inputVal('CLONE_OPTION', b, bs)]; },
    control_delete_this_clone: function (b, bs) { return ['deleteClone']; },
    sensing_touchingobject: function (b, bs) { return ['touching:', this.c.inputVal('TOUCHINGOBJECTMENU', b, bs)]; },
    sensing_touchingcolor: function (b, bs) { return ['touchingColor:', this.c.inputVal('COLOR', b, bs)]; },
    sensing_coloristouchingcolor: function (b, bs) { return ['color:sees:', this.c.inputVal('COLOR', b, bs), this.c.inputVal('COLOR2', b, bs)]; },
    sensing_distanceto: function (b, bs) { return ['distanceTo:', this.c.inputVal('DISTANCETOMENU', b, bs)]; },
    sensing_askandwait: function (b, bs) { return ['doAsk', this.c.inputVal('QUESTION', b, bs)]; },
    sensing_answer: function (b, bs) { return ['answer']; },
    sensing_keypressed: function (b, bs) { return ['keyPressed:', this.c.inputVal('KEY_OPTION', b, bs)]; },
    sensing_mousedown: function (b, bs) { return ['mousePressed']; },
    sensing_mousex: function (b, bs) { return ['mouseX']; },
    sensing_mousey: function (b, bs) { return ['mouseY']; },
    sensing_loudness: function (b, bs) { return ['soundLevel']; },
    sensing_timer: function (b, bs) { return ['timer']; },
    sensing_resettimer: function (b, bs) { return ['timerReset']; },
    sensing_of: function (b, bs) {
        var attr = this.c.fieldVal('PROPERTY', b);
        var obj = this.c.inputVal('OBJECT', b, bs);
        var STAGE_ATTRS_IE = { 'backdrop #': true, 'backdrop name': true, 'volume': true };
        var SPRITE_ATTRS_IE = { 'x position': true, 'y position': true, 'direction': true, 'costume #': true, 'costume name': true, 'size': true, 'volume': true };
        if (obj === '_stage_') { if (!STAGE_ATTRS_IE[attr]) attr = this.c.varName(attr); }
        else if (!SPRITE_ATTRS_IE[attr]) { attr = this.c.varName(attr); }
        return ['getAttribute:of:', attr, obj];
    },
    sensing_current: function (b, bs) {
        var f = this.c.fieldVal('CURRENTMENU', b);
        if (typeof f === 'string') f = f.toLowerCase();
        return ['timeAndDate', f];
    },
    sensing_dayssince2000: function (b, bs) { return ['timestamp']; },
    sensing_username: function (b, bs) { return ['getUserName']; },
    operator_add: function (b, bs) { return ['+', this.c.inputVal('NUM1', b, bs), this.c.inputVal('NUM2', b, bs)]; },
    operator_subtract: function (b, bs) { return ['-', this.c.inputVal('NUM1', b, bs), this.c.inputVal('NUM2', b, bs)]; },
    operator_multiply: function (b, bs) { return ['*', this.c.inputVal('NUM1', b, bs), this.c.inputVal('NUM2', b, bs)]; },
    operator_divide: function (b, bs) { return ['/', this.c.inputVal('NUM1', b, bs), this.c.inputVal('NUM2', b, bs)]; },
    operator_random: function (b, bs) { return ['randomFrom:to:', this.c.inputVal('FROM', b, bs), this.c.inputVal('TO', b, bs)]; },
    operator_gt: function (b, bs) { return ['>', this.c.inputVal('OPERAND1', b, bs), this.c.inputVal('OPERAND2', b, bs)]; },
    operator_lt: function (b, bs) { return ['<', this.c.inputVal('OPERAND1', b, bs), this.c.inputVal('OPERAND2', b, bs)]; },
    operator_equals: function (b, bs) { return ['=', this.c.inputVal('OPERAND1', b, bs), this.c.inputVal('OPERAND2', b, bs)]; },
    operator_and: function (b, bs) { return ['&', this.c.inputVal('OPERAND1', b, bs), this.c.inputVal('OPERAND2', b, bs)]; },
    operator_or: function (b, bs) { return ['|', this.c.inputVal('OPERAND1', b, bs), this.c.inputVal('OPERAND2', b, bs)]; },
    operator_not: function (b, bs) { return ['not', this.c.inputVal('OPERAND', b, bs)]; },
    operator_join: function (b, bs) {
        if (this.c.unlimJoin) {
            this.c.joinStr = true;
            var stackReporter = ['call', 'join %s %s', this.c.inputVal('STRING1', b, bs), this.c.inputVal('STRING2', b, bs)];
            if (this.c.compatStackReporters.length > 0) this.c.compatStackReporters[this.c.compatStackReporters.length - 1].push(stackReporter);
            return ['getLine:ofList:', (this.c.compatStackReporters.length > 0 ? this.c.compatStackReporters[this.c.compatStackReporters.length - 1].length : 1), this.c.compatVarName('results')];
        }
        return ['concatenate:with:', this.c.inputVal('STRING1', b, bs), this.c.inputVal('STRING2', b, bs)];
    },
    operator_letter_of: function (b, bs) { return ['letter:of:', this.c.inputVal('LETTER', b, bs), this.c.inputVal('STRING', b, bs)]; },
    operator_length: function (b, bs) { return ['stringLength:', this.c.inputVal('STRING', b, bs)]; },
    operator_mod: function (b, bs) { return ['%', this.c.inputVal('NUM1', b, bs), this.c.inputVal('NUM2', b, bs)]; },
    operator_round: function (b, bs) { return ['rounded', this.c.inputVal('NUM', b, bs)]; },
    operator_mathop: function (b, bs) { return ['computeFunction:of:', this.c.fieldVal('OPERATOR', b), this.c.inputVal('NUM', b, bs)]; },
    data_variable: function (b, bs) { return ['readVariable', this.c.fieldVal('VARIABLE', b)]; },
    data_setvariableto: function (b, bs) { return ['setVar:to:', this.c.fieldVal('VARIABLE', b), this.c.inputVal('VALUE', b, bs)]; },
    data_changevariableby: function (b, bs) { return ['changeVar:by:', this.c.fieldVal('VARIABLE', b), this.c.inputVal('VALUE', b, bs)]; },
    data_showvariable: function (b, bs) { return ['showVariable:', this.c.fieldVal('VARIABLE', b)]; },
    data_hidevariable: function (b, bs) { return ['hideVariable:', this.c.fieldVal('VARIABLE', b)]; },
    data_listcontents: function (b, bs) { return ['contentsOfList:', this.c.fieldVal('LIST', b)]; },
    data_addtolist: function (b, bs) {
        if (this.c.limList) { this.c.addList = true; return ['call', 'add %s to %m.list', this.c.inputVal('ITEM', b, bs), this.c.fieldVal('LIST', b)]; }
        return ['append:toList:', this.c.inputVal('ITEM', b, bs), this.c.fieldVal('LIST', b)];
    },
    data_deleteoflist: function (b, bs) { return ['deleteLine:ofList:', this.c.inputVal('INDEX', b, bs), this.c.fieldVal('LIST', b)]; },
    data_deletealloflist: function (b, bs) { return ['deleteLine:ofList:', 'all', this.c.fieldVal('LIST', b)]; },
    data_insertatlist: function (b, bs) {
        if (this.c.limList) { this.c.insertList = true; return ['call', 'insert %s at %n of %m.list', this.c.inputVal('ITEM', b, bs), this.c.inputVal('INDEX', b, bs), this.c.fieldVal('LIST', b)]; }
        return ['insert:at:ofList:', this.c.inputVal('ITEM', b, bs), this.c.inputVal('INDEX', b, bs), this.c.fieldVal('LIST', b)];
    },
    data_replaceitemoflist: function (b, bs) { return ['setLine:ofList:to:', this.c.inputVal('INDEX', b, bs), this.c.fieldVal('LIST', b), this.c.inputVal('ITEM', b, bs)]; },
    data_itemoflist: function (b, bs) { return ['getLine:ofList:', this.c.inputVal('INDEX', b, bs), this.c.fieldVal('LIST', b)]; },
    data_lengthoflist: function (b, bs) { return ['lineCountOfList:', this.c.fieldVal('LIST', b)]; },
    data_listcontainsitem: function (b, bs) { return ['list:contains:', this.c.fieldVal('LIST', b), this.c.inputVal('ITEM', b, bs)]; },
    data_showlist: function (b, bs) { return ['showList:', this.c.fieldVal('LIST', b)]; },
    data_hidelist: function (b, bs) { return ['hideList:', this.c.fieldVal('LIST', b)]; },
    procedures_definition: function (b, bs) {
        var customBlock = bs[b.inputs.custom_block[1]];
        var procData = customBlock.mutation;
        var args = JSON.parse(procData.argumentnames);
        var defaults = JSON.parse(procData.argumentdefaults);
        while (defaults.length < args.length) defaults.push('');
        var warp = procData.warp === 'true' || procData.warp === true;
        return ['procDef', this.c.varName(procData.proccode), args, defaults, warp];
    },
    procedures_call: function (b, bs) {
        var output = ['call', this.c.varName(b.mutation.proccode)];
        var ids = JSON.parse(b.mutation.argumentids);
        for (var i = 0; i < ids.length; i++) output.push(this.c.inputVal(ids[i], b, bs));
        return output;
    },
    argument_reporter_string_number: function (b, bs) { return ['getParam', this.c.fieldVal('VALUE', b), 'r']; },
    argument_reporter_boolean: function (b, bs) { return ['getParam', this.c.fieldVal('VALUE', b), 'b']; },
    pen_clear: function (b, bs) { return ['clearPenTrails']; },
    pen_stamp: function (b, bs) { return ['stampCostume']; },
    pen_penDown: function (b, bs) {
        if (this.c.compat) { this.c.penUpDown = true; return ['call', 'pen down']; }
        return ['putPenDown'];
    },
    pen_penUp: function (b, bs) {
        if (this.c.compat) { this.c.penUpDown = true; return ['call', 'pen up']; }
        return ['putPenUp'];
    },
    pen_setPenColorToColor: function (b, bs) { return ['penColor:', this.c.inputVal('COLOR', b, bs)]; },
    pen_changePenSizeBy: function (b, bs) { return ['changePenSizeBy:', this.c.inputVal('SIZE', b, bs)]; },
    pen_setPenSizeTo: function (b, bs) { return ['penSize:', this.c.inputVal('SIZE', b, bs)]; }
};

function ProjectConverter() {
    this.argMapper = new BlockArgMapper(this);
    this.compatStackReporters = [];
    this.soundAssets = {};
    this.costumeAssets = {};
    this.sounds = [];
    this.costumes = [];
    this.monitors = [];
    this.lists = {};
    this.stageLists = {};
    this.compat = false;
    this.unlimJoin = false;
    this.limList = false;
    this.penFill = false;
    this.timerCompat = false;
    this.resetTimer = false;
    this.penUpDown = false;
    this.penColor = false;
    this.joinStr = false;
    this.addList = false;
    this.insertList = false;
    this.targetIsStage = false;
    this._fontFiles = {
        'Noto Sans': 'https://raw.githubusercontent.com/towerofnix/scratch-render-fonts/refs/heads/master/src/NotoSans-Medium.ttf',
        'Source Serif Pro': 'https://raw.githubusercontent.com/towerofnix/scratch-render-fonts/refs/heads/master/src/SourceSerifPro-Regular.otf',
        'Handlee': 'https://raw.githubusercontent.com/towerofnix/scratch-render-fonts/refs/heads/master/src/handlee-regular.ttf',
        'Knewave': 'https://raw.githubusercontent.com/towerofnix/scratch-render-fonts/refs/heads/master/src/Knewave.ttf',
        'Griffy': 'https://raw.githubusercontent.com/towerofnix/scratch-render-fonts/refs/heads/master/src/Griffy-Regular.ttf',
        'Grand9K Pixel': 'https://raw.githubusercontent.com/towerofnix/scratch-render-fonts/refs/heads/master/src/Grand9K-Pixel.ttf'
    };
    this._fontCache = {};
}

ProjectConverter.prototype = {
    varName: function (name) {
        if (typeof name === 'string') return (this.compat ? '\u00A0' : '') + name;
        if (this.compat) return ['concatenate:with:', '\u00A0', name];
        return name;
    },
    compatVarName: function (name) { return (this.targetIsStage ? 'Stage: ' : '') + name; },
    specialNum: function (num) {
        if (num === '-Infinity') return -Infinity;
        if (num === 'Infinity') return Infinity;
        if (num === 'NaN') return NaN;
        return num;
    },
    hexToDec: function (hex) {
        if (typeof hex === 'string' && hex.indexOf('#') === 0) return parseInt(hex.substring(1), 16);
        return hex;
    },
    inputVal: function (valName, block, blocks) {
        if (!block.inputs[valName]) return false;
        var input = block.inputs[valName];
        if (input[1] === null) return null;
        if (input[0] === 1) {
            if (typeof input[1] === 'string') return this.convertBlock(blocks[input[1]], blocks);
            return input[1][1];
        }
        var out = input[1];
        if (Array.isArray(out)) {
            var type = out[0];
            var val = out[1];
            if (type === 12) return ['readVariable', this.varName(val)];
            if (type === 13) return ['contentsOfList:', this.varName(val)];
            var numericTypes = { 4: true, 5: true, 6: true, 7: true, 8: true };
            if (numericTypes[type]) {
                var n = parseFloat(val);
                if (!isNaN(n)) val = n;
            } else if (type === 9) { val = this.hexToDec(val); }
            return this.specialNum(val);
        } else {
            try { return this.convertBlock(blocks[out], blocks); } catch (e) { return false; }
        }
    },
    fieldVal: function (fieldName, block) {
        if (!block.fields[fieldName]) return null;
        var out = block.fields[fieldName][0];
        if (fieldName === 'VARIABLE' || fieldName === 'LIST') out = this.varName(out);
        return out;
    },
    substackVal: function (stackName, block, blocks) {
        if (!block.inputs[stackName]) return null;
        var stack = block.inputs[stackName];
        if (stack.length < 2 || stack[1] === null) return [];
        return this.convertSubstack(stack[1], blocks);
    },
    convertBlock: function (block, blocks) {
        var opcode = block.opcode;
        if (block.shadow && !block.topLevel) {
            var keys = [];
            for (var k in block.fields) keys.push(k);
            if (keys.length > 0) return this.fieldVal(keys[0], block);
        }
        try {
            var res = this.argMapper.mapArgs(opcode, block, blocks);
            if (res) return res;
            return [opcode];
        } catch (e) { return null; }
    },
    convertSubstack: function (startBlockId, blocks) {
        this.compatStackReporters.push([]);
        var script = [];
        var currId = startBlockId;
        while (currId) {
            this.compatStackReporters[this.compatStackReporters.length - 1] = [];
            var block = blocks[currId];
            if (!block) break;
            var output = this.convertBlock(block, blocks);
            var sReporters = this.compatStackReporters[this.compatStackReporters.length - 1];
            if (sReporters.length > 0) {
                script.push(['deleteLine:ofList:', 'all', this.compatVarName('results')]);
                for (var i = 0; i < sReporters.length; i++) script.push(sReporters[i]);
                if (output && output[0] === 'doUntil') {
                    if (!Array.isArray(output[2])) output[2] = [];
                    output[2].push(['deleteLine:ofList:', 'all', this.compatVarName('results')]);
                    for (var j = 0; j < sReporters.length; j++) output[2].push(sReporters[j]);
                }
            }
            if (output) script.push(output);
            currId = block.next;
        }
        this.compatStackReporters.pop();
        return script;
    },
    _readZipEntry: function (entry) {
        var deferred = $.Deferred();
        if (!entry) { deferred.resolve(null); return deferred.promise(); }
        if (typeof entry.async === 'function') {
            entry.async('uint8array').then(function (out) {
                if (out instanceof Uint8Array) deferred.resolve(out);
                else if (out instanceof ArrayBuffer) deferred.resolve(new Uint8Array(out));
                else deferred.resolve(null);
            });
            return deferred.promise();
        }
        deferred.resolve(null);
        return deferred.promise();
    },
    addCostume: function (c, zipOut) {
        var self = this;
        var deferred = $.Deferred();
        if (!this.costumeAssets[c.assetId]) {
            var ext = c.dataFormat;
            var url = "https://assets.scratch.mit.edu/internalapi/asset/" + c.md5ext + "/get/";
            var onDataReady = function (finalData) {
                var index = Object.keys(self.costumeAssets).length;
                if (ext === 'svg') {
                    var svgText = '';
                    for (var i = 0; i < finalData.length; i++) svgText += String.fromCharCode(finalData[i]);
                    zipOut.file(index + ".svg", svgText);
                    self._rasterizeSvgToPng(svgText, c.bitmapResolution || 1).then(function (pngBuffer) {
                        zipOut.file(index + ".png", pngBuffer);
                        self.costumeAssets[c.assetId] = [index, c.name, index + ".png"];
                        deferred.resolve();
                    }, function () {
                        self.costumeAssets[c.assetId] = [index, c.name, index + ".svg"];
                        deferred.resolve();
                    });
                } else {
                    zipOut.file(index + "." + ext, finalData);
                    self.costumeAssets[c.assetId] = [index, c.name, index + "." + ext];
                    deferred.resolve();
                }
            };

            var entry = null;
            if (sourceZip) {
                if (typeof sourceZip.file === 'function') entry = sourceZip.file(c.md5ext) || sourceZip.file('assets/' + c.md5ext);
                if (!entry && sourceZip.files) {
                    for (var name in sourceZip.files) {
                        if (name === c.md5ext || name.indexOf('/' + c.md5ext, name.length - (c.md5ext.length + 1)) !== -1) { entry = sourceZip.file(name); break; }
                    }
                }
            }
            if (entry) {
                this._readZipEntry(entry).then(onDataReady);
            } else {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.responseType = 'arraybuffer';
                xhr.onload = function () {
                    onDataReady(new Uint8Array(xhr.response));
                };
                xhr.onerror = function () {
                    onDataReady(new Uint8Array(0));
                };
                xhr.send();
            }
        } else {
            deferred.resolve();
        }

        return deferred.promise().then(function () {
            var assetData = self.costumeAssets[c.assetId];
            self.costumes.push({
                costumeName: c.name,
                baseLayerID: assetData[0],
                baseLayerMD5: assetData[2],
                rotationCenterX: c.rotationCenterX,
                rotationCenterY: c.rotationCenterY,
                bitmapResolution: c.bitmapResolution || 1
            });
        });
    },
    _rasterizeSvgToPng: function (svgText, scale) {
        var self = this;
        var deferred = $.Deferred();
        var fontMap = { 'Sans Serif': 'Noto Sans', 'Serif': 'Source Serif Pro', 'Marker': 'Knewave', 'Handwriting': 'Handlee', 'Curly': 'Griffy', 'Pixel': 'Grand9K Pixel' };
        for (var scratchFont in fontMap) {
            var targetFont = fontMap[scratchFont];
            svgText = svgText.split('font-family="' + scratchFont + '"').join('font-family="' + targetFont + '"');
            svgText = svgText.split("font-family='" + scratchFont + "'").join("font-family='" + targetFont + "'");
        }

        this._embedFontsInSvg(svgText).then(function (styledSvg) {
            var size = { width: 480, height: 360 };
            var outW = Math.max(1, Math.round(size.width * scale));
            var outH = Math.max(1, Math.round(size.height * scale));
            var svgBlob = new Blob([styledSvg], { type: 'image/svg+xml;charset=utf-8' });
            var url = URL.createObjectURL(svgBlob);
            var img = new Image();
            img.onload = function () {
                var canvas = document.createElement('canvas');
                canvas.width = outW; canvas.height = outH;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, outW, outH);
                var dataUrl = canvas.toDataURL('image/png');
                var bin = atob(dataUrl.split(',')[1]);
                var arr = new Uint8Array(bin.length);
                for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                URL.revokeObjectURL(url);
                deferred.resolve(arr);
            };
            img.onerror = function () { deferred.reject(); };
            img.src = url;
        });
        return deferred.promise();
    },
    _embedFontsInSvg: function (svgText) {
        var deferred = $.Deferred();
        var self = this;
        var rules = [];
        var fontsToLoad = [];
        for (var name in this._fontFiles) {
            if (svgText.indexOf(name) !== -1) fontsToLoad.push(name);
        }
        if (fontsToLoad.length === 0) { deferred.resolve(svgText); return deferred.promise(); }

        var loadNext = function (idx) {
            if (idx >= fontsToLoad.length) {
                var style = '<style type="text/css"><![CDATA[\n' + rules.join('\n') + '\n]]></style>';
                var tagEnd = svgText.indexOf('>');
                deferred.resolve(svgText.slice(0, tagEnd + 1) + style + svgText.slice(tagEnd + 1));
                return;
            }
            var fName = fontsToLoad[idx];
            self._fetchFontAsBase64(fName, self._fontFiles[fName]).then(function (f) {
                if (f) rules.push("@font-face { font-family: '" + fName + "'; src: url('data:" + f.mime + ";base64," + f.base64 + "') format('" + f.format + "'); }");
                loadNext(idx + 1);
            });
        };
        loadNext(0);
        return deferred.promise();
    },
    _fetchFontAsBase64: function (name, url) {
        var deferred = $.Deferred();
        if (this._fontCache[name]) { deferred.resolve(this._fontCache[name]); return deferred.promise(); }
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        var self = this;
        xhr.onload = function () {
            var bytes = new Uint8Array(xhr.response);
            var binary = '';
            for (var i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
            var ext = url.split('.').pop().toLowerCase();
            var fmt = ext === 'otf' ? 'opentype' : 'truetype';
            var res = { base64: btoa(binary), mime: "font/" + ext, format: fmt };
            self._fontCache[name] = res;
            deferred.resolve(res);
        };
        xhr.onerror = function () { deferred.resolve(null); };
        xhr.send();
        return deferred.promise();
    },
    addSound: function (s, zipOut) {
        var self = this;
        var deferred = $.Deferred();
        var entry = null;
        if (sourceZip) {
            if (typeof sourceZip.file === 'function') entry = sourceZip.file(s.md5ext) || sourceZip.file('assets/' + s.md5ext);
        }
        var handleSoundData = function (ab) {
            var ext = s.dataFormat;
            var index = Object.keys(self.soundAssets).length;
            zipOut.file(index + "." + ext, ab);
            self.soundAssets[s.assetId] = [index, s.name, s.sampleCount, s.rate, index + "." + ext];
            self.sounds.push({ soundName: s.name, soundID: index, md5: index + "." + ext, sampleCount: s.sampleCount, rate: s.rate, format: '' });
            deferred.resolve();
        };
        if (entry) {
            entry.async('arraybuffer').then(handleSoundData);
        } else {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', "https://assets.scratch.mit.edu/internalapi/asset/" + s.md5ext + "/get/", true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = function () { handleSoundData(xhr.response); };
            xhr.onerror = function () { deferred.resolve(); };
            xhr.send();
        }
        return deferred.promise();
    },
    convertTarget: function (target, zipOut, progressCallback) {
        var self = this;
        this.sounds = [];
        this.costumes = [];
        this.targetIsStage = target.isStage;

        var processAssets = function () {
            var def = $.Deferred();
            var soundIdx = 0;
            var loadSounds = function () {
                if (soundIdx >= target.sounds.length) { loadCostumes(); return; }
                self.addSound(target.sounds[soundIdx++], zipOut).then(function () {
                    if (progressCallback) progressCallback();
                    loadSounds();
                });
            };
            var costumeIdx = 0;
            var loadCostumes = function () {
                if (costumeIdx >= target.costumes.length) { def.resolve(); return; }
                self.addCostume(target.costumes[costumeIdx++], zipOut).then(function () {
                    if (progressCallback) progressCallback();
                    loadCostumes();
                });
            };
            loadSounds();
            return def.promise();
        };

        return processAssets().then(function () {
            var variables = [];
            for (var k in target.variables) {
                var v = target.variables[k];
                variables.push({ name: self.varName(v[0]), value: self.specialNum(v[1]), isPersistent: v.length >= 3 && v[2] });
            }
            var lists = [];
            for (var lk in target.lists) {
                var l = target.lists[lk];
                lists.push({ listName: self.varName(l[0]), contents: l[1].map(function (x) { return self.specialNum(x); }), isPersistent: false, x: 0, y: 0, width: 100, height: 200, visible: false });
            }
            var scripts = [];
            var blocks = target.blocks;
            for (var bk in blocks) {
                var b = blocks[bk];
                if (b.topLevel) {
                    var x = Math.round(b.x / 1.5) || 0;
                    var y = Math.round(b.y / 1.8) || 0;
                    self.compatStackReporters = [];
                    var stack = self.convertSubstack(bk, blocks);
                    if (stack && stack.length > 0) scripts.push([x, y, stack]);
                }
            }
            var obj = {
                objName: target.isStage ? 'Stage' : target.name,
                scripts: scripts, variables: variables, lists: lists,
                sounds: self.sounds, costumes: self.costumes, currentCostumeIndex: target.currentCostume
            };
            if (target.isStage) {
                obj.tempoBPM = target.tempo;
                obj.videoAlpha = (100 - target.videoTransparency) / 100;
                obj.info = { videoOn: target.videoState === 'on' };
                obj.children = [];
            } else {
                obj.scratchX = target.x; obj.scratchY = target.y;
                obj.scale = target.size / 100; obj.direction = target.direction;
                var styles = { 'all around': 'normal', 'left-right': 'leftRight', "don't rotate": 'none' };
                obj.rotationStyle = styles[target.rotationStyle] || 'normal';
                obj.isDraggable = target.draggable; obj.visible = target.visible;
                obj.spriteInfo = {};
            }
            return obj;
        });
    }
};
