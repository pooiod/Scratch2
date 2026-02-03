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

function xhrFetch(url, responseType) {
    return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.responseType = responseType || 'text';
        xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.response);
            } else {
                reject(new Error('Request failed with status ' + xhr.status));
            }
        };
        xhr.onerror = function () { reject(new Error('Network error')); };
        xhr.send();
    });
}

function startDownload(projectId) {
    $("#progress").removeClass("error success");
    $("#progress").css("opacity", 1);
    $("#scratchloader").css("opacity", 1);
    document.getElementById("loadholder").classList.remove("pulse");

    logMessage("Initializing download for ID: " + projectId);
    setProgress(5);

    var isDirectSource = projectId && (typeof projectId === 'string') && (projectId.indexOf('http') === 0 || projectId.indexOf('data:') === 0);

    var p;
    if (isDirectSource) {
        logMessage('Downloading project...');
        setProgress(10);
        window.DownloadedTitle = projectId.split('/').pop().split('.').slice(0, -1).join('.') || 'project';
        p = xhrFetch(projectId, 'blob');
    } else {
        logMessage('Fetching project token...');
        p = xhrFetch('https://trampoline.turbowarp.org/api/projects/' + projectId, 'json')
            .then(function (metaData) {
                window.DownloadedTitle = metaData.title;
                logMessage('Downloading project JSON...');
                return xhrFetch('https://projects.scratch.mit.edu/' + projectId + '?token=' + metaData.project_token, 'json');
            });
    }

    p.then(function (data) {
        if (isDirectSource) {
            var blob = data;
            return handleDirectBlob(blob);
        } else {
            return data;
        }
    }).then(function (projectData) {
        var isSB3 = projectData && projectData.targets && Array.isArray(projectData.targets);
        jszip = new JSZip();
        jszip.comment = "Converted sb3 to sb2 by pooiod7's converter (scratchflash.pages.dev/download)";

        if (isSB3) {
            logMessage('Detected Scratch 3.0 project. Starting conversion...');
            return processSB3(projectData);
        } else {
            logMessage('Detected Legacy (SB2) project.');
            return processLegacy(projectData);
        }
    })["catch"](perror);
}

function handleDirectBlob(blob) {
    return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
            var ab = reader.result;
            var zip = new JSZip();
            zip.loadAsync(ab).then(function (loadedZip) {
                sourceZip = loadedZip;
                var projFile = loadedZip.file(/project\.json$/i)[0];
                if (projFile) {
                    return projFile.async("string").then(function (text) {
                        var projectData = JSON.parse(text);
                        var isSB3 = projectData && projectData.targets && Array.isArray(projectData.targets);
                        if (!isSB3 && window.gotZipBase64) {
                            var reader2 = new FileReader();
                            reader2.onload = function () {
                                window.gotZipBase64(reader2.result.split(',')[1]);
                                psuccess();
                            };
                            reader2.readAsDataURL(blob);
                            return null;
                        }
                        return projectData;
                    });
                }
                throw new Error('Project JSON not found in zip.');
            }).then(resolve)["catch"](function () {
                var readerText = new FileReader();
                readerText.onload = function () {
                    try {
                        resolve(JSON.parse(readerText.result));
                    } catch (e) {
                        reject(new Error('Invalid project file.'));
                    }
                };
                readerText.readAsText(blob);
            });
        };
        reader.readAsArrayBuffer(blob);
    });
}

// Based on https://github.com/RexScratch/sb3tosb2
function processSB3(projectData) {
    var converter = new ProjectConverter();
    converter.compat = true;
    converter.unlimJoin = false;
    converter.limList = false;
    converter.penFill = false;

    var totalAssets = 0;
    var completedAssets = 0;
    projectData.targets.forEach(function (t) {
        totalAssets += t.costumes.length + t.sounds.length;
    });

    logMessage("Found " + totalAssets + " assets to convert.");

    var targets = projectData.targets;
    var stage = null;
    var sprites = [];

    var sequence = Promise.resolve();
    targets.forEach(function (target) {
        sequence = sequence.then(function () {
            return converter.convertTarget(target, jszip, function () {
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
            });
        });
    });

    return sequence.then(function () {
        sprites.sort(function (a, b) { return a.layerOrder - b.layerOrder; });
        sprites.forEach(function (s) { delete s.layerOrder; });

        if (!stage) throw new Error("No Stage found in JSON.");
        stage.children = sprites;
        stage.info = stage.info || {};
        stage.info.flashVersion = "MAC 32,0,0,0";
        stage.info.swfVersion = "v461";
        stage.info.spriteCount = sprites.length;
        stage.info.scriptCount = sprites.reduce(function (acc, s) { return acc + s.scripts.length; }, 0) + stage.scripts.length;

        jszip.file("project.json", JSON.stringify(stage));
        finalizeZip();
    });
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

    function parseNode(node) {
        if (node.costumes) {
            node.costumes.forEach(function (c) {
                c.baseLayerID = costumeId++;
                c.textLayerID = textLayerIDCounter++;
                assetsToDownload.push({ type: 'costume', data: c });
            });
        }
        if (node.sounds) {
            node.sounds.forEach(function (s) {
                s.soundID = soundId++;
                assetsToDownload.push({ type: 'sound', data: s });
            });
        }
        if (node.children) {
            node.children.forEach(function (child) { parseNode(child); });
        }
    }

    parseNode(projectData);
    var completed = 0;
    var total = assetsToDownload.length;
    logMessage("Found " + total + " legacy assets.");

    var downloadAsset = function (md5, filename) {
        if (!md5) return Promise.resolve();
        return xhrFetch('https://assets.scratch.mit.edu/internalapi/asset/' + md5 + '/get/', 'blob')
            .then(function (blob) {
                return new Promise(function (resolve) {
                    var reader = new FileReader();
                    reader.onload = function () {
                        var b64 = reader.result.split(',')[1];
                        jszip.file(filename, b64, { base64: true });
                        resolve();
                    };
                    reader.readAsDataURL(blob);
                });
            })["catch"](function () { return Promise.resolve(); });
    };

    var sequence = Promise.resolve();
    assetsToDownload.forEach(function (asset) {
        sequence = sequence.then(function () {
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
                var ext = s.md5.match(/\.[a-zA-Z0-9]+/)[0];
                p = downloadAsset(s.md5, s.soundID + ext);
            }
            return p.then(function () {
                completed++;
                setProgress(10 + (80 * (completed / total)));
            });
        });
    });

    return sequence.then(function () {
        jszip.file("project.json", JSON.stringify(projectData));
        finalizeZip();
    });
}

var STAGE_ATTRS = { 'backdrop #': true, 'backdrop name': true, 'volume': true };
var SPRITE_ATTRS = { 'x position': true, 'y position': true, 'direction': true, 'costume #': true, 'costume name': true, 'size': true, 'volume': true };
var ROTATION_STYLES = { 'all around': 'normal', 'left-right': 'leftRight', "don't rotate": 'none' };
var ASSET_HOST = "https://assets.scratch.mit.edu/internalapi/asset";

function BlockArgMapper(converter) { this.c = converter; }
BlockArgMapper.prototype = {
    mapArgs: function (opcode, block, blocks) {
        if (this[opcode]) return this[opcode](block, blocks);
        return null;
    },
    // Motion
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
    // Looks
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
    // Sound
    sound_play: function (b, bs) { return ['playSound:', this.c.inputVal('SOUND_MENU', b, bs)]; },
    sound_playuntildone: function (b, bs) { return ['doPlaySoundAndWait', this.c.inputVal('SOUND_MENU', b, bs)]; },
    sound_stopallsounds: function (b, bs) { return ['stopAllSounds']; },
    sound_changevolumeby: function (b, bs) { return ['changeVolumeBy:', this.c.inputVal('VOLUME', b, bs)]; },
    sound_setvolumeto: function (b, bs) { return ['setVolumeTo:', this.c.inputVal('VOLUME', b, bs)]; },
    sound_volume: function (b, bs) { return ['volume']; },
    // Events
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
    // Control
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
    // Sensing
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
        if (obj === '_stage_') { if (!STAGE_ATTRS[attr]) attr = this.c.varName(attr); }
        else if (!SPRITE_ATTRS[attr]) { attr = this.c.varName(attr); }
        return ['getAttribute:of:', attr, obj];
    },
    sensing_current: function (b, bs) {
        var f = this.c.fieldVal('CURRENTMENU', b);
        if (typeof f === 'string') f = f.toLowerCase();
        return ['timeAndDate', f];
    },
    sensing_dayssince2000: function (b, bs) { return ['timestamp']; },
    sensing_username: function (b, bs) { return ['getUserName']; },
    // Operators
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
    operator_join: function (b, bs) { return ['concatenate:with:', this.c.inputVal('STRING1', b, bs), this.c.inputVal('STRING2', b, bs)]; },
    operator_letter_of: function (b, bs) { return ['letter:of:', this.c.inputVal('LETTER', b, bs), this.c.inputVal('STRING', b, bs)]; },
    operator_length: function (b, bs) { return ['stringLength:', this.c.inputVal('STRING', b, bs)]; },
    operator_mod: function (b, bs) { return ['%', this.c.inputVal('NUM1', b, bs), this.c.inputVal('NUM2', b, bs)]; },
    operator_round: function (b, bs) { return ['rounded', this.c.inputVal('NUM', b, bs)]; },
    operator_mathop: function (b, bs) { return ['computeFunction:of:', this.c.fieldVal('OPERATOR', b), this.c.inputVal('NUM', b, bs)]; },
    // Data
    data_variable: function (b, bs) { return ['readVariable', this.c.fieldVal('VARIABLE', b)]; },
    data_setvariableto: function (b, bs) { return ['setVar:to:', this.c.fieldVal('VARIABLE', b), this.c.inputVal('VALUE', b, bs)]; },
    data_changevariableby: function (b, bs) { return ['changeVar:by:', this.c.fieldVal('VARIABLE', b), this.c.inputVal('VALUE', b, bs)]; },
    data_showvariable: function (b, bs) { return ['showVariable:', this.c.fieldVal('VARIABLE', b)]; },
    data_hidevariable: function (b, bs) { return ['hideVariable:', this.c.fieldVal('VARIABLE', b)]; },
    data_listcontents: function (b, bs) { return ['contentsOfList:', this.c.fieldVal('LIST', b)]; },
    data_addtolist: function (b, bs) { return ['append:toList:', this.c.inputVal('ITEM', b, bs), this.c.fieldVal('LIST', b)]; },
    data_deleteoflist: function (b, bs) { return ['deleteLine:ofList:', this.c.inputVal('INDEX', b, bs), this.c.fieldVal('LIST', b)]; },
    data_deletealloflist: function (b, bs) { return ['deleteLine:ofList:', 'all', this.c.fieldVal('LIST', b)]; },
    data_insertatlist: function (b, bs) { return ['insert:at:ofList:', this.c.inputVal('ITEM', b, bs), this.c.inputVal('INDEX', b, bs), this.c.fieldVal('LIST', b)]; },
    data_replaceitemoflist: function (b, bs) { return ['setLine:ofList:to:', this.c.inputVal('INDEX', b, bs), this.c.fieldVal('LIST', b), this.c.inputVal('ITEM', b, bs)]; },
    data_itemoflist: function (b, bs) { return ['getLine:ofList:', this.c.inputVal('INDEX', b, bs), this.c.fieldVal('LIST', b)]; },
    data_lengthoflist: function (b, bs) { return ['lineCountOfList:', this.c.fieldVal('LIST', b)]; },
    data_listcontainsitem: function (b, bs) { return ['list:contains:', this.c.fieldVal('LIST', b), this.c.inputVal('ITEM', b, bs)]; },
    data_showlist: function (b, bs) { return ['showList:', this.c.fieldVal('LIST', b)]; },
    data_hidelist: function (b, bs) { return ['hideList:', this.c.fieldVal('LIST', b)]; },
    // Procedures
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
    // Pen
    pen_clear: function (b, bs) { return ['clearPenTrails']; },
    pen_stamp: function (b, bs) { return ['stampCostume']; },
    pen_penDown: function (b, bs) { return ['putPenDown']; },
    pen_penUp: function (b, bs) { return ['putPenUp']; },
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
    this.targetIsStage = false;
    this.compat = false;
}

ProjectConverter.prototype = {
    varName: function (name) {
        if (typeof name === 'string') return (this.compat ? '\u00A0' : '') + name;
        if (this.compat) return ['concatenate:with:', '\u00A0', name];
        return name;
    },
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
            if (type >= 4 && type <= 8) {
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
            var keys = Object.keys(block.fields);
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
            var block = blocks[currId];
            if (!block) break;
            var output = this.convertBlock(block, blocks);
            if (output) script.push(output);
            currId = block.next;
        }
        this.compatStackReporters.pop();
        return script;
    },
    _rasterizeSvgToPng: function (svgText, scale) {
        return new Promise(function (resolve, reject) {
            var canvasElem = document.createElement('canvas');
            var fabricCanvas = new fabric.StaticCanvas(canvasElem);
            fabric.loadSVGFromString(svgText, function (objects, options) {
                var obj = fabric.util.groupSVGElements(objects, options);
                var outW = Math.max(1, Math.round((obj.width || 480) * scale));
                var outH = Math.max(1, Math.round((obj.height || 360) * scale));
                fabricCanvas.setDimensions({ width: outW, height: outH });
                obj.set({ scaleX: scale, scaleY: scale, left: 0, top: 0 });
                fabricCanvas.add(obj);
                fabricCanvas.renderAll();
                var dataUrl = fabricCanvas.toDataURL({ format: 'png' });
                var bin = atob(dataUrl.split(',')[1]);
                var arr = new Uint8Array(bin.length);
                for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                resolve(arr);
            });
        });
    },
    addCostume: function (c, zipOut) {
        var self = this;
        if (!this.costumeAssets[c.assetId]) {
            var ext = c.dataFormat;
            var url = ASSET_HOST + "/" + c.md5ext + "/get/";
            var p;
            if (sourceZip) {
                var entry = sourceZip.file(c.md5ext) || sourceZip.file('assets/' + c.md5ext);
                p = entry ? entry.async("uint8array") : Promise.resolve(new Uint8Array(0));
            } else {
                p = xhrFetch(url, 'blob').then(function (blob) {
                    return new Promise(function (res) {
                        var r = new FileReader();
                        r.onload = function () { res(new Uint8Array(r.result)); };
                        r.readAsArrayBuffer(blob);
                    });
                });
            }

            return p.then(function (data) {
                var index = Object.keys(self.costumeAssets).length;
                if (ext === 'svg') {
                    var svgText = "";
                    for (var i = 0; i < data.length; i++) svgText += String.fromCharCode(data[i]);
                    zipOut.file(index + ".svg", svgText);
                    return self._rasterizeSvgToPng(svgText, c.bitmapResolution || 1).then(function (png) {
                        zipOut.file(index + ".png", png);
                        self.costumeAssets[c.assetId] = [index, c.name, index + ".png"];
                    });
                } else {
                    zipOut.file(index + "." + ext, data);
                    self.costumeAssets[c.assetId] = [index, c.name, index + "." + ext];
                }
            }).then(function () {
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
        } else {
            var assetData = this.costumeAssets[c.assetId];
            this.costumes.push({
                costumeName: c.name,
                baseLayerID: assetData[0],
                baseLayerMD5: assetData[2],
                rotationCenterX: c.rotationCenterX,
                rotationCenterY: c.rotationCenterY,
                bitmapResolution: c.bitmapResolution || 1
            });
            return Promise.resolve();
        }
    },
    addSound: function (s, zipOut) {
        var self = this;
        if (!this.soundAssets[s.assetId]) {
            var ext = s.dataFormat;
            var url = ASSET_HOST + "/" + s.md5ext + "/get/";
            var p;
            if (sourceZip) {
                var entry = sourceZip.file(s.md5ext) || sourceZip.file('assets/' + s.md5ext);
                p = entry ? entry.async("uint8array") : Promise.resolve(new Uint8Array(0));
            } else {
                p = xhrFetch(url, 'blob').then(function (blob) {
                    return new Promise(function (res) {
                        var r = new FileReader();
                        r.onload = function () { res(new Uint8Array(r.result)); };
                        r.readAsArrayBuffer(blob);
                    });
                });
            }
            return p.then(function (data) {
                var index = Object.keys(self.soundAssets).length;
                var outName = index + "." + ext;
                zipOut.file(outName, data);
                self.soundAssets[s.assetId] = [index, s.name, s.sampleCount, s.rate, outName];
            }).then(function () {
                var assetData = self.soundAssets[s.assetId];
                self.sounds.push({
                    soundName: assetData[1],
                    soundID: assetData[0],
                    md5: assetData[4],
                    sampleCount: assetData[2],
                    rate: assetData[3],
                    format: ''
                });
            });
        } else {
            var assetData = this.soundAssets[s.assetId];
            this.sounds.push({
                soundName: assetData[1],
                soundID: assetData[0],
                md5: assetData[4],
                sampleCount: assetData[2],
                rate: assetData[3],
                format: ''
            });
            return Promise.resolve();
        }
    },
    convertTarget: function (target, zipOut, progressCallback) {
        var self = this;
        this.sounds = [];
        this.costumes = [];
        this.targetIsStage = target.isStage;

        var sequence = Promise.resolve();
        target.sounds.forEach(function (s) {
            sequence = sequence.then(function () {
                return self.addSound(s, zipOut).then(function () { if (progressCallback) progressCallback(); });
            });
        });
        target.costumes.forEach(function (c) {
            sequence = sequence.then(function () {
                return self.addCostume(c, zipOut).then(function () { if (progressCallback) progressCallback(); });
            });
        });

        return sequence.then(function () {
            var variables = [];
            for (var k in target.variables) {
                var v = target.variables[k];
                variables.push({ name: self.varName(v[0]), value: self.specialNum(v[1]), isPersistent: v.length >= 3 && v[2] });
            }
            var lists = [];
            for (var kl in target.lists) {
                var l = target.lists[kl];
                lists.push({ listName: self.varName(l[0]), contents: l[1].map(function (x) { return self.specialNum(x); }), isPersistent: false, x: 0, y: 0, width: 100, height: 200, visible: false });
            }
            var scripts = [];
            var blocks = target.blocks;
            for (var kb in blocks) {
                var b = blocks[kb];
                if (b.topLevel) {
                    var x = Math.round(b.x / 1.5) || 0;
                    var y = Math.round(b.y / 1.8) || 0;
                    var stack = self.convertSubstack(kb, blocks);
                    if (stack && stack.length > 0) scripts.push([x, y, stack]);
                }
            }
            var obj = {
                objName: target.isStage ? 'Stage' : target.name,
                scripts: scripts,
                variables: variables,
                lists: lists,
                sounds: self.sounds,
                costumes: self.costumes,
                currentCostumeIndex: target.currentCostume
            };
            if (target.isStage) {
                obj.tempoBPM = target.tempo;
                obj.videoAlpha = (100 - target.videoTransparency) / 100;
                obj.info = { videoOn: target.videoState === 'on' };
                obj.children = [];
            } else {
                obj.scratchX = target.x;
                obj.scratchY = target.y;
                obj.scale = target.size / 100;
                obj.direction = target.direction;
                obj.rotationStyle = ROTATION_STYLES[target.rotationStyle] || 'normal';
                obj.isDraggable = target.draggable;
                obj.visible = target.visible;
                obj.spriteInfo = {};
            }
            return obj;
        });
    }
};
