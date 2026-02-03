var maxWidth = 0;
var jszip = null;
var id = null;
var sourceZip = null;

function textEncode(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var utf8 = unescape(encodeURIComponent(str));
    var result = new Uint8Array(utf8.length);
    for (var i = 0; i < utf8.length; i++) result[i] = utf8.charCodeAt(i);
    return result;
}

function textDecode(u8) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(u8);
    var encodedString = String.fromCharCode.apply(null, u8);
    return decodeURIComponent(escape(encodedString));
}

function fetchCompat(url, type) {
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        if (type) xhr.responseType = type;
        xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.response);
            } else {
                reject(new Error(xhr.statusText));
            }
        };
        xhr.onerror = function() { reject(new Error('Network Error')); };
        xhr.send();
    });
}

function logMessage(msg){
    $("#log").text(msg+"\n"+$("#log").text());
}

function setProgress(perc){
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
    $("#progress").animate({opacity:0}, 1000, function(){
        $(this).css({"opacity":1, width:0});
    });
}

function psuccess(){
    setProgress(100);
    setTimeout(function() {
        $("#progress").addClass("success");
        $("#progress").animate({opacity:0}, 1000, function(){
            $(this).css({"opacity":1, width:0});
        });
    }, 100);
}

function perror(err){
    console.error(err);
    alert("Error: " + err.message);
    logMessage("Error: " + err.message);
    animError();
}

function startDownload(projectId) {
    $("#progress").removeClass("error success");
    $("#progress").css("opacity", 1);
    $("#scratchloader").css("opacity", 1);
    document.getElementById("loadholder").classList.remove("pulse");

    logMessage("Initializing download for ID: " + projectId);
    setProgress(5);

    var projectData = null;
    var isDirectSource = projectId && (typeof projectId === 'string' || projectId instanceof String) && (projectId.indexOf('http') === 0 || projectId.indexOf('data:') === 0);

    var promiseChain;

    if (isDirectSource) {
        logMessage('Downloading project...');
        setProgress(10);

        var splitUrl = projectId.split('/');
        var fileName = splitUrl[splitUrl.length - 1];
        window.DownloadedTitle = fileName.split('.').slice(0, -1).join('.') || 'project';

        promiseChain = fetchCompat(projectId, 'blob').then(function(blob) {
            var parsed = false;

            var arrayBufferToBinaryString = function(ab) {
                var bytes = new Uint8Array(ab);
                var CHUNK = 0x8000;
                var str = '';
                for (var i = 0; i < bytes.length; i += CHUNK) {
                    str += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
                }
                return str;
            };

            var getProjectTextFromZip = function(zipInstance) {
                var entry = null;
                if (zipInstance && typeof zipInstance.file === 'function') {
                    entry = zipInstance.file('project.json');
                    if (!entry && zipInstance.files) {
                        for (var name in zipInstance.files) {
                            if (name.toLowerCase().indexOf('project.json') !== -1) { entry = zipInstance.file(name); break; }
                        }
                    }
                }
                
                if (entry) {
                    if (typeof entry.async === 'function') return entry.async('string');
                    if (typeof entry.asText === 'function') return Promise.resolve(entry.asText());
                    if (entry._data) {
                        if (entry._data instanceof Uint8Array) return Promise.resolve(textDecode(entry._data));
                        if (typeof entry._data === 'string') return Promise.resolve(entry._data);
                    }
                } else if (zipInstance && zipInstance.files) {
                     for (var name in zipInstance.files) {
                        if (name.toLowerCase().indexOf('project.json') !== -1) {
                            var f = zipInstance.files[name];
                            if (!f) continue;
                            if (typeof f.async === 'function') return f.async('string');
                            if (typeof f.asText === 'function') return Promise.resolve(f.asText());
                            if (f._data) {
                                if (f._data instanceof Uint8Array) return Promise.resolve(textDecode(f._data));
                                if (typeof f._data === 'string') return Promise.resolve(f._data);
                            }
                        }
                    }
                }
                return Promise.resolve(null);
            };

            var loadZipPromise;
            if (JSZip && typeof JSZip.loadAsync === 'function') {
                loadZipPromise = JSZip.loadAsync(blob);
            } else {
                var z = new JSZip();
                loadZipPromise = new Promise(function(res, rej) {
                     var reader = new FileReader();
                     reader.onload = function(e) {
                         try {
                             var ab = e.target.result;
                             if (typeof z.loadAsync === 'function') {
                                 z.loadAsync(ab).then(res).catch(rej);
                             } else if (typeof z.load === 'function') {
                                 var bin = arrayBufferToBinaryString(ab);
                                 z.load(bin);
                                 res(z);
                             } else if (typeof JSZip.load === 'function') {
                                 var bin = arrayBufferToBinaryString(ab);
                                 res(JSZip.load(bin));
                             } else {
                                 rej(new Error('Unsupported JSZip API'));
                             }
                         } catch (err) { rej(err); }
                     };
                     reader.onerror = rej;
                     reader.readAsArrayBuffer(blob);
                });
            }

            return loadZipPromise.then(function(zip) {
                sourceZip = zip;
                return getProjectTextFromZip(zip);
            }).then(function(projText) {
                if (projText) {
                    projectData = JSON.parse(projText);
                    parsed = true;
                }
                return parsed;
            }).catch(function(err) {
                perror(err);
                return false;
            }).then(function(wasParsed) {
                if (!wasParsed) {
                     return new Promise(function(resolve, reject) {
                        var r = new FileReader();
                        r.onload = function() { resolve(r.result); };
                        r.onerror = reject;
                        r.readAsText(blob);
                     }).then(function(text) {
                        try {
                            projectData = JSON.parse(text);
                            parsed = true;
                        } catch (e) {
                            throw new Error('Downloaded file is not a valid project JSON or SB archive.');
                        }
                     });
                }
            }).then(function() {
                if (isDirectSource) {
                    var isSB3 = projectData && projectData.targets && Array.isArray(projectData.targets);
                    if (!isSB3) {
                        return new Promise(function(res, rej) {
                            var reader = new FileReader();
                            reader.onerror = function() { rej(new Error('Failed to read blob as base64')); };
                            reader.onload = function() {
                                var dataUrl = reader.result.split(',')[1];
                                res(dataUrl);
                            };
                            reader.readAsDataURL(blob);
                        }).then(function(base64) {
                            if (window.gotZipBase64) {
                                window.gotZipBase64(base64);
                                psuccess();
                                throw { earlyExit: true };
                            } else {
                                throw new Error('window.gotZipBase64 not found.');
                            }
                        });
                    }
                }
            });
        });

    } else {
        logMessage('Fetching project token...');
        promiseChain = fetchCompat('https://trampoline.turbowarp.org/api/projects/' + projectId, 'json')
        .then(function(metaData) {
            if (typeof metaData === 'string') metaData = JSON.parse(metaData);
            var token = metaData.project_token;
            window.DownloadedTitle = metaData.title;

            logMessage('Downloading project JSON...');
            return fetchCompat('https://projects.scratch.mit.edu/' + projectId + '?token=' + token, 'json');
        })
        .then(function(data) {
            if (typeof data === 'string') projectData = JSON.parse(data);
            else projectData = data;
        });
    }

    promiseChain.then(function() {
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
    }).catch(function(err) {
        if (err && err.earlyExit) return;
        perror(err);
    });
}

// Based on https://github.com/RexScratch/sb3tosb2
function processSB3(projectData) {
    var converter = new ProjectConverter();

    // CONVERTION SETTINGS
    converter.compat = true;
    converter.unlimJoin = false;
    converter.limList = false;
    converter.penFill = false;

    var totalAssets = 0;
    var completedAssets = 0;
    projectData.targets.forEach(function(t) {
        totalAssets += t.costumes.length + t.sounds.length;
    });

    logMessage('Found ' + totalAssets + ' assets to convert.');

    var targets = projectData.targets;
    var stage = null;
    var sprites = [];

    var chain = Promise.resolve();
    
    targets.forEach(function(target) {
        chain = chain.then(function() {
            return converter.convertTarget(target, jszip, function() {
                completedAssets++;
                var progress = 10 + (80 * (completedAssets / totalAssets));
                setProgress(progress);
            });
        }).then(function(convertedTarget) {
            if (target.isStage) {
                stage = convertedTarget;
            } else {
                convertedTarget.layerOrder = target.layerOrder;
                sprites.push(convertedTarget);
            }
            logMessage('Processed: ' + target.name);
        });
    });

    return chain.then(function() {
        sprites.sort(function(a, b) { return a.layerOrder - b.layerOrder; });
        sprites.forEach(function(s) { delete s.layerOrder; });

        if (!stage) throw new Error("No Stage found in JSON.");
        stage.children = sprites;

        stage.info = stage.info || {};
        stage.info.flashVersion = "MAC 32,0,0,0";
        stage.info.swfVersion = "v461";
        stage.info.spriteCount = sprites.length;
        stage.info.scriptCount = sprites.reduce(function(acc, s) { return acc + s.scripts.length; }, 0) + stage.scripts.length;

        jszip.file("project.json", JSON.stringify(stage));
        finalizeZip();
    });
}

function finalizeZip() {
    logMessage("Compressing archive...");
    setProgress(95);
    
    if (typeof jszip.generateAsync === "function") {
        jszip.generateAsync({type: "base64"}).then(function(content) {
            finish(content);
        });
    } else {
        var content = jszip.generate({type: "base64"});
        finish(content);
    }
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
            node.costumes.forEach(function(c) {
                c.baseLayerID = costumeId++;
                c.textLayerID = textLayerIDCounter++;
                assetsToDownload.push({ type: 'costume', data: c });
            });
        }
        if (node.sounds) {
            node.sounds.forEach(function(s) {
                s.soundID = soundId++;
                assetsToDownload.push({ type: 'sound', data: s });
            });
        }
        if (node.children) {
            node.children.forEach(function(child) { parseNode(child); });
        }
    }

    parseNode(projectData);

    var completed = 0;
    var total = assetsToDownload.length;

    logMessage('Found ' + total + ' legacy assets.');

    var downloadAsset = function(md5, filename) {
        if (!md5) return Promise.resolve();
        return fetchCompat('https://assets.scratch.mit.edu/internalapi/asset/' + md5 + '/get/', 'blob')
            .then(function(blob) {
                return new Promise(function(resolve) {
                    var reader = new FileReader();
                    reader.onload = function() {
                        var b64 = reader.result.split(',')[1];
                        jszip.file(filename, b64, {base64: true});
                        resolve();
                    };
                    reader.readAsDataURL(blob);
                });
            }).catch(function() {
                return Promise.resolve();
            });
    };

    var chain = Promise.resolve();
    assetsToDownload.forEach(function(asset) {
        chain = chain.then(function() {
            if (asset.type === 'costume') {
                var c = asset.data;
                var ext = c.baseLayerMD5.match(/\.[a-zA-Z0-9]+/)[0];
                return downloadAsset(c.baseLayerMD5, c.baseLayerID + ext).then(function() {
                    if (c.textLayerMD5) {
                        var textExt = c.textLayerMD5.match(/\.[a-zA-Z0-9]+/)[0];
                        return downloadAsset(c.textLayerMD5, c.textLayerID + textExt);
                    }
                });
            } else {
                var s = asset.data;
                var ext = s.md5.match(/\.[a-zA-Z0-9]+/)[0];
                return downloadAsset(s.md5, s.soundID + ext);
            }
        }).then(function() {
            completed++;
            setProgress(10 + (80 * (completed / total)));
        });
    });

    return chain.then(function() {
        jszip.file("project.json", JSON.stringify(projectData));
        finalizeZip();
    });
}

var STAGE_ATTRS = {};
STAGE_ATTRS['backdrop #'] = true; STAGE_ATTRS['backdrop name'] = true; STAGE_ATTRS['volume'] = true;
var SPRITE_ATTRS = {};
SPRITE_ATTRS['x position'] = true; SPRITE_ATTRS['y position'] = true; SPRITE_ATTRS['direction'] = true; SPRITE_ATTRS['costume #'] = true; SPRITE_ATTRS['costume name'] = true; SPRITE_ATTRS['size'] = true; SPRITE_ATTRS['volume'] = true;

var ROTATION_STYLES = { 'all around': 'normal', 'left-right': 'leftRight', "don't rotate": 'none' };
var ASSET_HOST = "https://assets.scratch.mit.edu/internalapi/asset";

var BlockArgMapper = function(converter) { this.c = converter; };
BlockArgMapper.prototype.mapArgs = function(opcode, block, blocks) {
    if (this[opcode]) return this[opcode](block, blocks);
    return null;
};
// Motion
BlockArgMapper.prototype.motion_movesteps = function(b, bs) { return ['forward:', this.c.inputVal('STEPS', b, bs)]; };
BlockArgMapper.prototype.motion_turnright = function(b, bs) { return ['turnRight:', this.c.inputVal('DEGREES', b, bs)]; };
BlockArgMapper.prototype.motion_turnleft = function(b, bs) { return ['turnLeft:', this.c.inputVal('DEGREES', b, bs)]; };
BlockArgMapper.prototype.motion_pointindirection = function(b, bs) { return ['heading:', this.c.inputVal('DIRECTION', b, bs)]; };
BlockArgMapper.prototype.motion_pointtowards = function(b, bs) { return ['pointTowards:', this.c.inputVal('TOWARDS', b, bs)]; };
BlockArgMapper.prototype.motion_gotoxy = function(b, bs) { return ['gotoX:y:', this.c.inputVal('X', b, bs), this.c.inputVal('Y', b, bs)]; };
BlockArgMapper.prototype.motion_goto = function(b, bs) { return ['gotoSpriteOrMouse:', this.c.inputVal('TO', b, bs)]; };
BlockArgMapper.prototype.motion_glidesecstoxy = function(b, bs) { return ['glideSecs:toX:y:elapsed:from:', this.c.inputVal('SECS', b, bs), this.c.inputVal('X', b, bs), this.c.inputVal('Y', b, bs)]; };
BlockArgMapper.prototype.motion_changexby = function(b, bs) { return ['changeXposBy:', this.c.inputVal('DX', b, bs)]; };
BlockArgMapper.prototype.motion_setx = function(b, bs) { return ['xpos:', this.c.inputVal('X', b, bs)]; };
BlockArgMapper.prototype.motion_changeyby = function(b, bs) { return ['changeYposBy:', this.c.inputVal('DY', b, bs)]; };
BlockArgMapper.prototype.motion_sety = function(b, bs) { return ['ypos:', this.c.inputVal('Y', b, bs)]; };
BlockArgMapper.prototype.motion_ifonedgebounce = function(b, bs) { return ['bounceOffEdge']; };
BlockArgMapper.prototype.motion_setrotationstyle = function(b, bs) { return ['setRotationStyle', this.c.fieldVal('STYLE', b)]; };
BlockArgMapper.prototype.motion_xposition = function(b, bs) { return ['xpos']; };
BlockArgMapper.prototype.motion_yposition = function(b, bs) { return ['ypos']; };
BlockArgMapper.prototype.motion_direction = function(b, bs) { return ['heading']; };
// Looks
BlockArgMapper.prototype.looks_sayforsecs = function(b, bs) { return ['say:duration:elapsed:from:', this.c.inputVal('MESSAGE', b, bs), this.c.inputVal('SECS', b, bs)]; };
BlockArgMapper.prototype.looks_say = function(b, bs) { return ['say:', this.c.inputVal('MESSAGE', b, bs)]; };
BlockArgMapper.prototype.looks_thinkforsecs = function(b, bs) { return ['think:duration:elapsed:from:', this.c.inputVal('MESSAGE', b, bs), this.c.inputVal('SECS', b, bs)]; };
BlockArgMapper.prototype.looks_think = function(b, bs) { return ['think:', this.c.inputVal('MESSAGE', b, bs)]; };
BlockArgMapper.prototype.looks_show = function(b, bs) { return ['show']; };
BlockArgMapper.prototype.looks_hide = function(b, bs) { return ['hide']; };
BlockArgMapper.prototype.looks_switchcostumeto = function(b, bs) { return ['lookLike:', this.c.inputVal('COSTUME', b, bs)]; };
BlockArgMapper.prototype.looks_nextcostume = function(b, bs) { return ['nextCostume']; };
BlockArgMapper.prototype.looks_switchbackdropto = function(b, bs) { return ['startScene', this.c.inputVal('BACKDROP', b, bs)]; };
BlockArgMapper.prototype.looks_nextbackdrop = function(b, bs) { return ['nextScene']; };
BlockArgMapper.prototype.looks_changeeffectby = function(b, bs) { 
    var f = this.c.fieldVal('EFFECT', b);
    if (typeof f === 'string') f = f.toLowerCase();
    return ['changeGraphicEffect:by:', f, this.c.inputVal('CHANGE', b, bs)];
};
BlockArgMapper.prototype.looks_seteffectto = function(b, bs) { 
    var f = this.c.fieldVal('EFFECT', b);
    if (typeof f === 'string') f = f.toLowerCase();
    return ['setGraphicEffect:to:', f, this.c.inputVal('VALUE', b, bs)];
};
BlockArgMapper.prototype.looks_cleargraphiceffects = function(b, bs) { return ['filterReset']; };
BlockArgMapper.prototype.looks_changesizeby = function(b, bs) { return ['changeSizeBy:', this.c.inputVal('CHANGE', b, bs)]; };
BlockArgMapper.prototype.looks_setsizeto = function(b, bs) { return ['setSizeTo:', this.c.inputVal('SIZE', b, bs)]; };
BlockArgMapper.prototype.looks_gotofrontback = function(b, bs) { return this.c.fieldVal('FRONT_BACK', b) === 'front' ? ['comeToFront'] : ['goBackByLayers:', 1.79e+308]; };
BlockArgMapper.prototype.looks_goforwardbackwardlayers = function(b, bs) {
    var layers = this.c.inputVal('NUM', b, bs);
    if (this.c.fieldVal('FORWARD_BACKWARD', b) === 'forward') {
        if (typeof layers === 'number') layers *= -1;
        else layers = ['*', -1, layers];
    }
    return ['goBackByLayers:', layers];
};
BlockArgMapper.prototype.looks_costumenumbername = function(b, bs) {
    var numName = this.c.fieldVal('NUMBER_NAME', b);
    if (numName === 'number') return ['costumeIndex'];
    if (this.c.compat && !this.c.targetIsStage) {
        return ['getLine:ofList:', ['costumeIndex'], this.c.varName('SpriteCostumes')];
    }
    return ['costumeName'];
};
BlockArgMapper.prototype.looks_backdropnumbername = function(b, bs) { return this.c.fieldVal('NUMBER_NAME', b) === 'number' ? ['backgroundIndex'] : ['sceneName']; };
BlockArgMapper.prototype.looks_size = function(b, bs) { return ['scale']; };
// Sound
BlockArgMapper.prototype.sound_play = function(b, bs) { return ['playSound:', this.c.inputVal('SOUND_MENU', b, bs)]; };
BlockArgMapper.prototype.sound_playuntildone = function(b, bs) { return ['doPlaySoundAndWait', this.c.inputVal('SOUND_MENU', b, bs)]; };
BlockArgMapper.prototype.sound_stopallsounds = function(b, bs) { return ['stopAllSounds']; };
BlockArgMapper.prototype.sound_changevolumeby = function(b, bs) { return ['changeVolumeBy:', this.c.inputVal('VOLUME', b, bs)]; };
BlockArgMapper.prototype.sound_setvolumeto = function(b, bs) { return ['setVolumeTo:', this.c.inputVal('VOLUME', b, bs)]; };
BlockArgMapper.prototype.sound_volume = function(b, bs) { return ['volume']; };
// Events
BlockArgMapper.prototype.event_whenflagclicked = function(b, bs) { return ['whenGreenFlag']; };
BlockArgMapper.prototype.event_whenkeypressed = function(b, bs) { return ['whenKeyPressed', this.c.fieldVal('KEY_OPTION', b)]; };
BlockArgMapper.prototype.event_whenthisspriteclicked = function(b, bs) { return ['whenClicked']; };
BlockArgMapper.prototype.event_whenstageclicked = function(b, bs) { return ['whenClicked']; };
BlockArgMapper.prototype.event_whenbackdropswitchesto = function(b, bs) { return ['whenSceneStarts', this.c.fieldVal('BACKDROP', b)]; };
BlockArgMapper.prototype.event_whengreaterthan = function(b, bs) { 
    var f = this.c.fieldVal('WHENGREATERTHANMENU', b);
    if(typeof f === 'string') f = f.toLowerCase();
    return ['whenSensorGreaterThan', f, this.c.inputVal('VALUE', b, bs)];
};
BlockArgMapper.prototype.event_whenbroadcastreceived = function(b, bs) { return ['whenIReceive', this.c.fieldVal('BROADCAST_OPTION', b)]; };
BlockArgMapper.prototype.event_broadcast = function(b, bs) { return ['broadcast:', this.c.inputVal('BROADCAST_INPUT', b, bs)]; };
BlockArgMapper.prototype.event_broadcastandwait = function(b, bs) { return ['doBroadcastAndWait', this.c.inputVal('BROADCAST_INPUT', b, bs)]; };
// Control
BlockArgMapper.prototype.control_wait = function(b, bs) { return ['wait:elapsed:from:', this.c.inputVal('DURATION', b, bs)]; };
BlockArgMapper.prototype.control_repeat = function(b, bs) { return ['doRepeat', this.c.inputVal('TIMES', b, bs), this.c.substackVal('SUBSTACK', b, bs)]; };
BlockArgMapper.prototype.control_forever = function(b, bs) { return ['doForever', this.c.substackVal('SUBSTACK', b, bs)]; };
BlockArgMapper.prototype.control_if = function(b, bs) { return ['doIf', this.c.inputVal('CONDITION', b, bs), this.c.substackVal('SUBSTACK', b, bs)]; };
BlockArgMapper.prototype.control_if_else = function(b, bs) { return ['doIfElse', this.c.inputVal('CONDITION', b, bs), this.c.substackVal('SUBSTACK', b, bs), this.c.substackVal('SUBSTACK2', b, bs)]; };
BlockArgMapper.prototype.control_wait_until = function(b, bs) { return ['doWaitUntil', this.c.inputVal('CONDITION', b, bs)]; };
BlockArgMapper.prototype.control_repeat_until = function(b, bs) { return ['doUntil', this.c.inputVal('CONDITION', b, bs), this.c.substackVal('SUBSTACK', b, bs)]; };
BlockArgMapper.prototype.control_stop = function(b, bs) { return ['stopScripts', this.c.fieldVal('STOP_OPTION', b)]; };
BlockArgMapper.prototype.control_start_as_clone = function(b, bs) { return ['whenCloned']; };
BlockArgMapper.prototype.control_create_clone_of = function(b, bs) { return ['createCloneOf', this.c.inputVal('CLONE_OPTION', b, bs)]; };
BlockArgMapper.prototype.control_delete_this_clone = function(b, bs) { return ['deleteClone']; };
// Sensing
BlockArgMapper.prototype.sensing_touchingobject = function(b, bs) { return ['touching:', this.c.inputVal('TOUCHINGOBJECTMENU', b, bs)]; };
BlockArgMapper.prototype.sensing_touchingcolor = function(b, bs) { return ['touchingColor:', this.c.inputVal('COLOR', b, bs)]; };
BlockArgMapper.prototype.sensing_coloristouchingcolor = function(b, bs) { return ['color:sees:', this.c.inputVal('COLOR', b, bs), this.c.inputVal('COLOR2', b, bs)]; };
BlockArgMapper.prototype.sensing_distanceto = function(b, bs) { return ['distanceTo:', this.c.inputVal('DISTANCETOMENU', b, bs)]; };
BlockArgMapper.prototype.sensing_askandwait = function(b, bs) { return ['doAsk', this.c.inputVal('QUESTION', b, bs)]; };
BlockArgMapper.prototype.sensing_answer = function(b, bs) { return ['answer']; };
BlockArgMapper.prototype.sensing_keypressed = function(b, bs) { return ['keyPressed:', this.c.inputVal('KEY_OPTION', b, bs)]; };
BlockArgMapper.prototype.sensing_mousedown = function(b, bs) { return ['mousePressed']; };
BlockArgMapper.prototype.sensing_mousex = function(b, bs) { return ['mouseX']; };
BlockArgMapper.prototype.sensing_mousey = function(b, bs) { return ['mouseY']; };
BlockArgMapper.prototype.sensing_loudness = function(b, bs) { return ['soundLevel']; };
BlockArgMapper.prototype.sensing_timer = function(b, bs) { return ['timer']; };
BlockArgMapper.prototype.sensing_resettimer = function(b, bs) { return ['timerReset']; };
BlockArgMapper.prototype.sensing_of = function(b, bs) {
    var attr = this.c.fieldVal('PROPERTY', b);
    var obj = this.c.inputVal('OBJECT', b, bs);
    if (obj === '_stage_') { if (!STAGE_ATTRS[attr]) attr = this.c.varName(attr); } 
    else if (!SPRITE_ATTRS[attr]) { attr = this.c.varName(attr); }
    return ['getAttribute:of:', attr, obj];
};
BlockArgMapper.prototype.sensing_current = function(b, bs) {
    var f = this.c.fieldVal('CURRENTMENU', b);
    if (typeof f === 'string') f = f.toLowerCase();
    return ['timeAndDate', f];
};
BlockArgMapper.prototype.sensing_dayssince2000 = function(b, bs) { return ['timestamp']; };
BlockArgMapper.prototype.sensing_username = function(b, bs) { return ['getUserName']; };
// Operators
BlockArgMapper.prototype.operator_add = function(b, bs) { return ['+', this.c.inputVal('NUM1', b, bs), this.c.inputVal('NUM2', b, bs)]; };
BlockArgMapper.prototype.operator_subtract = function(b, bs) { return ['-', this.c.inputVal('NUM1', b, bs), this.c.inputVal('NUM2', b, bs)]; };
BlockArgMapper.prototype.operator_multiply = function(b, bs) { return ['*', this.c.inputVal('NUM1', b, bs), this.c.inputVal('NUM2', b, bs)]; };
BlockArgMapper.prototype.operator_divide = function(b, bs) { return ['/', this.c.inputVal('NUM1', b, bs), this.c.inputVal('NUM2', b, bs)]; };
BlockArgMapper.prototype.operator_random = function(b, bs) { return ['randomFrom:to:', this.c.inputVal('FROM', b, bs), this.c.inputVal('TO', b, bs)]; };
BlockArgMapper.prototype.operator_gt = function(b, bs) { return ['>', this.c.inputVal('OPERAND1', b, bs), this.c.inputVal('OPERAND2', b, bs)]; };
BlockArgMapper.prototype.operator_lt = function(b, bs) { return ['<', this.c.inputVal('OPERAND1', b, bs), this.c.inputVal('OPERAND2', b, bs)]; };
BlockArgMapper.prototype.operator_equals = function(b, bs) { return ['=', this.c.inputVal('OPERAND1', b, bs), this.c.inputVal('OPERAND2', b, bs)]; };
BlockArgMapper.prototype.operator_and = function(b, bs) { return ['&', this.c.inputVal('OPERAND1', b, bs), this.c.inputVal('OPERAND2', b, bs)]; };
BlockArgMapper.prototype.operator_or = function(b, bs) { return ['|', this.c.inputVal('OPERAND1', b, bs), this.c.inputVal('OPERAND2', b, bs)]; };
BlockArgMapper.prototype.operator_not = function(b, bs) { return ['not', this.c.inputVal('OPERAND', b, bs)]; };
BlockArgMapper.prototype.operator_join = function(b, bs) {
    if(this.c.unlimJoin) {
        this.c.joinStr = true;
        var stackReporter = ['call', 'join %s %s', this.c.inputVal('STRING1', b, bs), this.c.inputVal('STRING2', b, bs)];
        if(this.c.compatStackReporters.length > 0) this.c.compatStackReporters[this.c.compatStackReporters.length-1].push(stackReporter);
        return ['getLine:ofList:', (this.c.compatStackReporters.length > 0 ? this.c.compatStackReporters[this.c.compatStackReporters.length-1].length : 1), this.c.compatVarName('results')];
    }
    return ['concatenate:with:', this.c.inputVal('STRING1', b, bs), this.c.inputVal('STRING2', b, bs)];
};
BlockArgMapper.prototype.operator_letter_of = function(b, bs) { return ['letter:of:', this.c.inputVal('LETTER', b, bs), this.c.inputVal('STRING', b, bs)]; };
BlockArgMapper.prototype.operator_length = function(b, bs) { return ['stringLength:', this.c.inputVal('STRING', b, bs)]; };
BlockArgMapper.prototype.operator_mod = function(b, bs) { return ['%', this.c.inputVal('NUM1', b, bs), this.c.inputVal('NUM2', b, bs)]; };
BlockArgMapper.prototype.operator_round = function(b, bs) { return ['rounded', this.c.inputVal('NUM', b, bs)]; };
BlockArgMapper.prototype.operator_mathop = function(b, bs) { return ['computeFunction:of:', this.c.fieldVal('OPERATOR', b), this.c.inputVal('NUM', b, bs)]; };
// Data
BlockArgMapper.prototype.data_variable = function(b, bs) { return ['readVariable', this.c.fieldVal('VARIABLE', b)]; };
BlockArgMapper.prototype.data_setvariableto = function(b, bs) { return ['setVar:to:', this.c.fieldVal('VARIABLE', b), this.c.inputVal('VALUE', b, bs)]; };
BlockArgMapper.prototype.data_changevariableby = function(b, bs) { return ['changeVar:by:', this.c.fieldVal('VARIABLE', b), this.c.inputVal('VALUE', b, bs)]; };
BlockArgMapper.prototype.data_showvariable = function(b, bs) { return ['showVariable:', this.c.fieldVal('VARIABLE', b)]; };
BlockArgMapper.prototype.data_hidevariable = function(b, bs) { return ['hideVariable:', this.c.fieldVal('VARIABLE', b)]; };
BlockArgMapper.prototype.data_listcontents = function(b, bs) { return ['contentsOfList:', this.c.fieldVal('LIST', b)]; };
BlockArgMapper.prototype.data_addtolist = function(b, bs) { 
    if(this.c.limList) { this.c.addList = true; return ['call', 'add %s to %m.list', this.c.inputVal('ITEM', b, bs), this.c.fieldVal('LIST', b)]; }
    return ['append:toList:', this.c.inputVal('ITEM', b, bs), this.c.fieldVal('LIST', b)]; 
};
BlockArgMapper.prototype.data_deleteoflist = function(b, bs) { return ['deleteLine:ofList:', this.c.inputVal('INDEX', b, bs), this.c.fieldVal('LIST', b)]; };
BlockArgMapper.prototype.data_deletealloflist = function(b, bs) { return ['deleteLine:ofList:', 'all', this.c.fieldVal('LIST', b)]; };
BlockArgMapper.prototype.data_insertatlist = function(b, bs) { 
    if(this.c.limList) { this.c.insertList = true; return ['call', 'insert %s at %n of %m.list', this.c.inputVal('ITEM', b, bs), this.c.inputVal('INDEX', b, bs), this.c.fieldVal('LIST', b)]; }
    return ['insert:at:ofList:', this.c.inputVal('ITEM', b, bs), this.c.inputVal('INDEX', b, bs), this.c.fieldVal('LIST', b)]; 
};
BlockArgMapper.prototype.data_replaceitemoflist = function(b, bs) { return ['setLine:ofList:to:', this.c.inputVal('INDEX', b, bs), this.c.fieldVal('LIST', b), this.c.inputVal('ITEM', b, bs)]; };
BlockArgMapper.prototype.data_itemoflist = function(b, bs) { return ['getLine:ofList:', this.c.inputVal('INDEX', b, bs), this.c.fieldVal('LIST', b)]; };
BlockArgMapper.prototype.data_lengthoflist = function(b, bs) { return ['lineCountOfList:', this.c.fieldVal('LIST', b)]; };
BlockArgMapper.prototype.data_listcontainsitem = function(b, bs) { return ['list:contains:', this.c.fieldVal('LIST', b), this.c.inputVal('ITEM', b, bs)]; };
BlockArgMapper.prototype.data_showlist = function(b, bs) { return ['showList:', this.c.fieldVal('LIST', b)]; };
BlockArgMapper.prototype.data_hidelist = function(b, bs) { return ['hideList:', this.c.fieldVal('LIST', b)]; };
// Procedures
BlockArgMapper.prototype.procedures_definition = function(b, bs) {
    var customBlock = bs[b.inputs.custom_block[1]];
    var procData = customBlock.mutation;
    var args = JSON.parse(procData.argumentnames);
    var defaults = JSON.parse(procData.argumentdefaults);
    while(defaults.length < args.length) defaults.push('');
    var warp = procData.warp === 'true' || procData.warp === true;
    return ['procDef', this.c.varName(procData.proccode), args, defaults, warp];
};
BlockArgMapper.prototype.procedures_call = function(b, bs) {
    var output = ['call', this.c.varName(b.mutation.proccode)];
    var ids = JSON.parse(b.mutation.argumentids);
    for(var i = 0; i < ids.length; i++) output.push(this.c.inputVal(ids[i], b, bs));
    return output;
};
BlockArgMapper.prototype.argument_reporter_string_number = function(b, bs) { return ['getParam', this.c.fieldVal('VALUE', b), 'r']; };
BlockArgMapper.prototype.argument_reporter_boolean = function(b, bs) { return ['getParam', this.c.fieldVal('VALUE', b), 'b']; };
// Pen
BlockArgMapper.prototype.pen_clear = function(b, bs) { return ['clearPenTrails']; };
BlockArgMapper.prototype.pen_stamp = function(b, bs) { return ['stampCostume']; };
BlockArgMapper.prototype.pen_penDown = function(b, bs) { 
    if(this.c.compat) { this.c.penUpDown = true; return ['call', 'pen down']; }
    return ['putPenDown'];
};
BlockArgMapper.prototype.pen_penUp = function(b, bs) { 
    if(this.c.compat) { this.c.penUpDown = true; return ['call', 'pen up']; }
    return ['putPenUp'];
};
BlockArgMapper.prototype.pen_setPenColorToColor = function(b, bs) {
    var val = this.c.inputVal('COLOR', b, bs);
    return ['penColor:', val];
};
BlockArgMapper.prototype.pen_changePenSizeBy = function(b, bs) { return ['changePenSizeBy:', this.c.inputVal('SIZE', b, bs)]; };
BlockArgMapper.prototype.pen_setPenSizeTo = function(b, bs) { return ['penSize:', this.c.inputVal('SIZE', b, bs)]; };

var ProjectConverter = function() {
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
};

ProjectConverter.prototype.varName = function(name) {
    if (typeof name === 'string') return (this.compat ? '\u00A0' : '') + name;
    if (this.compat) return ['concatenate:with:', '\u00A0', name];
    return name;
};

ProjectConverter.prototype.compatVarName = function(name) { return (this.targetIsStage ? 'Stage: ' : '') + name; };

ProjectConverter.prototype.specialNum = function(num) {
    if (num === '-Infinity') return -Infinity;
    if (num === 'Infinity') return Infinity;
    if (num === 'NaN') return NaN;
    return num;
};

ProjectConverter.prototype.hexToDec = function(hex) {
    if(typeof hex === 'string' && hex.indexOf('#') === 0) return parseInt(hex.substring(1), 16);
    return hex;
};

ProjectConverter.prototype.inputVal = function(valName, block, blocks) {
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
        if ([4, 5, 6, 7, 8].indexOf(type) !== -1) {
            var n = parseFloat(val);
            if (!isNaN(n)) val = n;
        } else if (type === 9) { val = this.hexToDec(val); }
        return this.specialNum(val);
    } else {
        try { return this.convertBlock(blocks[out], blocks); } catch(e) { return false; }
    }
};

ProjectConverter.prototype.fieldVal = function(fieldName, block) {
    if (!block.fields[fieldName]) return null;
    var out = block.fields[fieldName][0];
    if (fieldName === 'VARIABLE' || fieldName === 'LIST') out = this.varName(out);
    return out;
};

ProjectConverter.prototype.substackVal = function(stackName, block, blocks) {
    if (!block.inputs[stackName]) return null;
    var stack = block.inputs[stackName];
    if (stack.length < 2 || stack[1] === null) return [];
    return this.convertSubstack(stack[1], blocks);
};

ProjectConverter.prototype.convertBlock = function(block, blocks) {
    var opcode = block.opcode;
    if (block.shadow && !block.topLevel) {
        var keys = Object.keys(block.fields);
        if (keys.length > 0) return this.fieldVal(keys[0], block);
    }
    try {
        var res = this.argMapper.mapArgs(opcode, block, blocks);
        if (res) return res;
        return [opcode];
    } catch(e) { return null; }
};

ProjectConverter.prototype.convertSubstack = function(startBlockId, blocks) {
    this.compatStackReporters.push([]);
    var script = [];
    var currId = startBlockId;
    while (currId) {
        this.compatStackReporters[this.compatStackReporters.length-1] = [];
        var block = blocks[currId];
        if(!block) break;
        var output = this.convertBlock(block, blocks);
        var sReporters = this.compatStackReporters[this.compatStackReporters.length-1];
        if (sReporters.length > 0) {
            script.push(['deleteLine:ofList:', 'all', this.compatVarName('results')]);
            for(var r=0; r<sReporters.length; r++) script.push(sReporters[r]);
            if (output && output[0] === 'doUntil') {
                 if(!Array.isArray(output[2])) output[2] = [];
                 output[2].push(['deleteLine:ofList:', 'all', this.compatVarName('results')]);
                 for(var r2=0; r2<sReporters.length; r2++) output[2].push(sReporters[r2]);
            }
        }
        if(output) script.push(output);
        currId = block.next;
    }
    this.compatStackReporters.pop();
    return script;
};

ProjectConverter.prototype._readZipEntry = function(entry) {
    if (!entry) return Promise.resolve(null);
    if (typeof entry.async === 'function') {
        return entry.async('uint8array').catch(function() {
            return entry.async('arraybuffer').then(function(ab) { return new Uint8Array(ab); });
        }).catch(function() {
            return entry.async('string').then(function(s) { return textEncode(s); });
        });
    }
    if (typeof entry.asArrayBuffer === 'function') {
        return Promise.resolve(entry.asArrayBuffer()).then(function(ab) { return new Uint8Array(ab); });
    }
    if (typeof entry.asText === 'function') {
        return Promise.resolve(entry.asText()).then(function(s) { return textEncode(s); });
    }
    if (entry._data) {
        if (entry._data instanceof Uint8Array) return Promise.resolve(entry._data);
        if (entry._data instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(entry._data));
        if (typeof entry._data === 'string') return Promise.resolve(textEncode(entry._data));
    }
    if (entry instanceof Uint8Array) return Promise.resolve(entry);
    if (entry instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(entry));
    if (typeof Blob !== 'undefined' && entry instanceof Blob) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function() { resolve(new Uint8Array(reader.result)); };
            reader.onerror = reject;
            reader.readAsArrayBuffer(entry);
        });
    }
    if (entry.data) {
        if (entry.data instanceof Uint8Array) return Promise.resolve(entry.data);
        if (entry.data instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(entry.data));
    }
    return Promise.resolve(null);
};

ProjectConverter.prototype.addCostume = function(c, zipOut) {
    var self = this;
    if (!this.costumeAssets[c.assetId]) {
        var ext = c.dataFormat;
        var url = ASSET_HOST + '/' + c.md5ext + '/get/';

        var dataPromise;

        if (sourceZip) {
            var entry = null;
            if (typeof sourceZip.file === 'function') {
                entry = sourceZip.file(c.md5ext) || sourceZip.file('assets/' + c.md5ext);
            }
            if (!entry && sourceZip.files) {
                for (var name in sourceZip.files) {
                    if (!name) continue;
                    if (name === c.md5ext || name.indexOf('/' + c.md5ext) !== -1 || name.indexOf(c.md5ext) === name.length - c.md5ext.length) { entry = sourceZip.file(name); break; }
                }
            }
            if (entry) {
                dataPromise = self._readZipEntry(entry).then(function(arr) {
                    if (!arr) throw new Error('Zip entry read returned null');
                    if (ext === 'svg') {
                        var str = textDecode(arr);
                        str = str.replace(/fill="undefined"/g, '');
                        return textEncode(str);
                    }
                    return arr;
                }).catch(function(e) {
                    console.warn('Failed to read costume ' + c.name + ' from SB3 zip, using placeholder.', e);
                    return textEncode('<svg width="800" height="800" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M4 1C2.355 1 1 2.355 1 4v1h1V4c0-1.11.89-2 2-2h1V1zm2 0v1h4V1zm5 0v1h1c1.11 0 2 .89 2 2v1h1V4c0-1.645-1.355-3-3-3zM6 5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1M1 6v4h1V6zm13 0v4h1V6zM9.5 8l-2 2L6 9l-2 2v.5c0 .5.5.5.5.5h7s.473-.035.5-.5v-1zM1 11v1c0 1.645 1.355 3 3 3h1v-1H4c-1.11 0-2-.89-2-2v-1zm13 0v1c0 1.11-.89 2-2 2h-1v1h1c1.645 0 3-1.355 3-3v-1zm-8 3v1h4v-1zm0 0" fill="#2e3434" fill-opacity=".349"/></svg>');
                });
            } else {
                console.warn('Costume ' + c.name + ' not found in SB3 zip, using placeholder.');
                dataPromise = Promise.resolve(textEncode('<svg width="800" height="800" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M4 1C2.355 1 1 2.355 1 4v1h1V4c0-1.11.89-2 2-2h1V1zm2 0v1h4V1zm5 0v1h1c1.11 0 2 .89 2 2v1h1V4c0-1.645-1.355-3-3-3zM6 5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1M1 6v4h1V6zm13 0v4h1V6zM9.5 8l-2 2L6 9l-2 2v.5c0 .5.5.5.5.5h7s.473-.035.5-.5v-1zM1 11v1c0 1.645 1.355 3 3 3h1v-1H4c-1.11 0-2-.89-2-2v-1zm13 0v1c0 1.11-.89 2-2 2h-1v1h1c1.645 0 3-1.355 3-3v-1zm-8 3v1h4v-1zm0 0" fill="#2e3434" fill-opacity=".349"/></svg>'));
            }
        } else {
            dataPromise = fetchCompat(url, 'arraybuffer').then(function(data) {
                var finalDataLocal = new Uint8Array(data);
                if (ext === 'svg') {
                    var str = textDecode(finalDataLocal);
                    str = str.replace(/fill="undefined"/g, '');
                    finalDataLocal = textEncode(str);
                }
                return finalDataLocal;
            }).catch(function() {
                console.warn('Failed to download costume ' + c.name + ', using placeholder.');
                return textEncode('<svg width="800" height="800" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M4 1C2.355 1 1 2.355 1 4v1h1V4c0-1.11.89-2 2-2h1V1zm2 0v1h4V1zm5 0v1h1c1.11 0 2 .89 2 2v1h1V4c0-1.645-1.355-3-3-3zM6 5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1M1 6v4h1V6zm13 0v4h1V6zM9.5 8l-2 2L6 9l-2 2v.5c0 .5.5.5.5.5h7s.473-.035.5-.5v-1zM1 11v1c0 1.645 1.355 3 3 3h1v-1H4c-1.11 0-2-.89-2-2v-1zm13 0v1c0 1.11-.89 2-2 2h-1v1h1c1.645 0 3-1.355 3-3v-1zm-8 3v1h4v-1zm0 0" fill="#2e3434" fill-opacity=".349"/></svg>');
            });
        }

        return dataPromise.then(function(finalData) {
            var index = Object.keys(self.costumeAssets).length;
            if (ext === 'svg') {
                var svgText = textDecode(finalData);
                zipOut.file(index + '.svg', svgText);
                return self._rasterizeSvgToPng(svgText, c.bitmapResolution || 1).then(function(pngBuffer) {
                    zipOut.file(index + '.png', pngBuffer);
                    self.costumeAssets[c.assetId] = [index, c.name, index + '.png'];
                }).catch(function(e) {
                    console.warn('SVG rasterize failed for ' + c.name + ', falling back to SVG:', e);
                    zipOut.file(index + '.svg', svgText);
                    self.costumeAssets[c.assetId] = [index, c.name, index + '.svg'];
                });
            } else {
                zipOut.file(index + '.' + ext, finalData);
                self.costumeAssets[c.assetId] = [index, c.name, index + '.' + ext];
                return Promise.resolve();
            }
        }).then(function() {
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
};

ProjectConverter.prototype._rasterizeSvgToPng = function(svgText, scale) {
    var self = this;
    var fontMap = {
        'Sans Serif': 'Noto Sans',
        'Serif': 'Source Serif Pro',
        'Marker': 'Knewave',
        'Handwriting': 'Handlee',
        'Curly': 'Griffy',
        'Pixel': 'Grand9K Pixel'
    };

    for (var scratchFont in fontMap) {
        if (!fontMap.hasOwnProperty(scratchFont)) continue;
        var targetFont = fontMap[scratchFont];
        var escaped = scratchFont.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        svgText = svgText.replace(new RegExp('font-family="' + escaped + '"', 'g'), 'font-family="' + targetFont + '"');
        svgText = svgText.replace(new RegExp("font-family='" + escaped + "'", 'g'), "font-family='" + targetFont + "'");
        svgText = svgText.replace(new RegExp('font-family:\\s*' + escaped, 'g'), 'font-family: ' + targetFont);
    }

    return this._embedFontsInSvg(svgText).then(function(processedSvgText) {
        svgText = processedSvgText;
    }).catch(function(e) {
        console.warn('Embedding fonts into SVG failed', e);
    }).then(function() {
        function parseSvgSize(svg) {
            var wMatch = svg.match(/\bwidth\s*=\s*"([0-9.]+)(px)?"/i);
            var hMatch = svg.match(/\bheight\s*=\s*"([0-9.]+)(px)?"/i);
            var vbMatch = svg.match(/viewBox\s*=\s*"([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)"/i);
            if (wMatch && hMatch) return {width: parseFloat(wMatch[1]), height: parseFloat(hMatch[1]), viewBox: vbMatch ? {x: parseFloat(vbMatch[1]), y: parseFloat(vbMatch[2]), width: parseFloat(vbMatch[3]), height: parseFloat(vbMatch[4])} : null};
            if (vbMatch) return {width: parseFloat(vbMatch[3]), height: parseFloat(vbMatch[4]), viewBox: {x: parseFloat(vbMatch[1]), y: parseFloat(vbMatch[2]), width: parseFloat(vbMatch[3]), height: parseFloat(vbMatch[4])}};
            return {width: 480, height: 360, viewBox: null};
        }

        var STAGE_W = 480 + 30;
        var STAGE_H = 360 + 30;

        var size = parseSvgSize(svgText);
        var outW = Math.max(1, Math.round(size.width * scale));
        var outH = Math.max(1, Math.round(size.height * scale));

        if (size.width > STAGE_W || size.height > STAGE_H || outW > STAGE_W || outH > STAGE_H) {
            throw new Error('SVG is past stage size');
        }
        if (size.viewBox) {
            var vb = size.viewBox;
            if (vb.x < 0 || vb.y < 0 || vb.x + vb.width > STAGE_W || vb.y + vb.height > STAGE_H) {
                throw new Error('SVG view goes past stage borders');
            }
        }

        return new Promise(function(resolve, reject) {
            try {
                fabric.loadSVGFromString(svgText, function(objects, options) {
                    var obj = fabric.util.groupSVGElements(objects, options);
                    var canvas = new fabric.StaticCanvas(null, { width: outW, height: outH });
                    
                    var scaleX = outW / options.width;
                    var scaleY = outH / options.height;
                    
                    obj.set({
                        originX: 'left',
                        originY: 'top',
                        left: 0,
                        top: 0,
                        scaleX: scaleX,
                        scaleY: scaleY
                    });
                    
                    canvas.add(obj);
                    canvas.renderAll();
                    
                    var dataUrl = canvas.toDataURL({ format: 'png' });
                    
                    var byteString = atob(dataUrl.split(',')[1]);
                    var ab = new ArrayBuffer(byteString.length);
                    var ia = new Uint8Array(ab);
                    for (var i = 0; i < byteString.length; i++) {
                        ia[i] = byteString.charCodeAt(i);
                    }
                    resolve(ia);
                });
            } catch(e) {
                reject(e);
            }
        });
    });
};

ProjectConverter.prototype._fetchFontAsBase64 = function(name, url) {
    if (this._fontCache[name]) return Promise.resolve(this._fontCache[name]);
    var self = this;
    return fetchCompat(url, 'arraybuffer').then(function(ab) {
        var extMatch = url.match(/\.([a-zA-Z0-9]+)($|[?#])/);
        var ext = extMatch ? extMatch[1].toLowerCase() : 'ttf';
        var mime = ext === 'otf' ? 'font/otf' : (ext === 'ttf' ? 'font/ttf' : 'application/octet-stream');
        var binary = '';
        var bytes = new Uint8Array(ab);
        var chunkSize = 0x8000;
        for (var i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        var b64 = btoa(binary);
        var fmt = ext === 'otf' ? 'opentype' : (ext === 'ttf' ? 'truetype' : 'woff');
        var out = { base64: b64, mime: mime, format: fmt };
        self._fontCache[name] = out;
        return out;
    }).catch(function(e) {
        console.warn('Font load failed for', name, url, e);
        self._fontCache[name] = null;
        return null;
    });
};

ProjectConverter.prototype._embedFontsInSvg = function(svgText) {
    var self = this;
    var used = [];
    var re = /font-family\s*[:=]\s*['\"]?([^'";,)<>]+)['\"]?/gi;
    var m;
    while ((m = re.exec(svgText)) !== null) {
        var name = m[1].trim();
        if (self._fontFiles[name] && used.indexOf(name) === -1) used.push(name);
    }
    if (used.length === 0) return Promise.resolve(svgText);

    var rules = [];
    var chain = Promise.resolve();

    used.forEach(function(name) {
        var url = self._fontFiles[name];
        if (url) {
            chain = chain.then(function() {
                return self._fetchFontAsBase64(name, url);
            }).then(function(f) {
                if (f) {
                    rules.push("@font-face { font-family: '" + name + "'; src: url('data:" + f.mime + ";base64," + f.base64 + "') format('" + f.format + "'); font-weight: normal; font-style: normal; }");
                }
            });
        }
    });

    return chain.then(function() {
        if (rules.length === 0) return svgText;
        var style = '<style type="text/css"><![CDATA[\n' + rules.join('\n') + '\n]]></style>';
        var svgTagStart = svgText.search(/<svg[\s>]/i);
        if (svgTagStart === -1) return style + svgText;
        var tagEnd = svgText.indexOf('>', svgTagStart);
        if (tagEnd === -1) return style + svgText;
        return svgText.slice(0, tagEnd + 1) + style + svgText.slice(tagEnd + 1);
    });
};

ProjectConverter.prototype.addSound = function(s, zipOut) {
    var self = this;
    if (!this.soundAssets[s.assetId]) {
        var ext = s.dataFormat;
        var url = ASSET_HOST + '/' + s.md5ext + '/get/';
        var data;
        var rate = s.rate;
        var sampleCount = s.sampleCount;
        var dataPromise;

        if (sourceZip) {
            var entry = null;
            if (typeof sourceZip.file === 'function') entry = sourceZip.file(s.md5ext) || sourceZip.file('assets/' + s.md5ext);
            if (!entry && sourceZip.files) {
                for (var name in sourceZip.files) {
                    if (!name) continue;
                    if (name === s.md5ext || name.indexOf('/' + s.md5ext) !== -1 || name.indexOf(s.md5ext) === name.length - s.md5ext.length) { entry = sourceZip.file(name); break; }
                }
            }
            if (entry) {
                dataPromise = self._readZipEntry(entry).then(function(arr) {
                    if (!arr) throw new Error('Zip entry read returned null');
                    var ab = arr instanceof Uint8Array ? arr.buffer : arr;
                    data = ab;
                    return data;
                });
            } else {
                console.warn('Sound ' + s.name + ' not found in SB3 zip, using empty placeholder.');
                data = new Uint8Array(0);
                rate = rate || 22050;
                sampleCount = sampleCount || 0;
                dataPromise = Promise.resolve(data);
            }
        } else {
            dataPromise = fetchCompat(url, 'arraybuffer').then(function(d) {
                data = d;
                return d;
            }).catch(function(e) {
                console.warn(e);
                data = new Uint8Array(0);
                rate = rate || 22050;
                sampleCount = sampleCount || 0;
                return data;
            });
        }

        return dataPromise.then(function(d) {
            if (window.AudioContext || window.webkitAudioContext) {
                 var AudioCtor = window.AudioContext || window.webkitAudioContext;
                 var audioCtx = new AudioCtor();
                 return audioCtx.decodeAudioData(d.slice(0)).then(function(audioBuffer) {
                     rate = audioBuffer.sampleRate;
                     sampleCount = audioBuffer.length;
                     if (ext === 'mp3') {
                         data = self.bufferToWav(audioBuffer);
                         ext = 'wav';
                     }
                 }, function() { 
                     // Ignore
                 });
            }
        }).catch(function() {
             // Ignore
        }).then(function() {
             if (rate > 48000) rate = 48000;
             var index = Object.keys(self.soundAssets).length;
             var outName = index + '.' + ext;
             zipOut.file(outName, data);
             self.soundAssets[s.assetId] = [index, s.name, sampleCount, rate, outName];
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
};

ProjectConverter.prototype.bufferToWav = function(buffer) {
    var numOfChan = buffer.numberOfChannels,
        length = buffer.length * numOfChan * 2 + 44,
        bufferArr = new ArrayBuffer(length),
        view = new DataView(bufferArr),
        channels = [], i, sample,
        offset = 0,
        pos = 0;

    var setUint16 = function(d) { view.setUint16(pos, d, true); pos += 2; };
    var setUint32 = function(d) { view.setUint32(pos, d, true); pos += 4; };

    setUint32(0x46464952);
    setUint32(length - 8);
    setUint32(0x45564157);
    setUint32(0x20746d66);
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164);
    setUint32(length - pos - 4);

    for (i = 0; i < numOfChan; i++) channels.push(buffer.getChannelData(i));

    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF);
            view.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }

    return bufferArr;
};

ProjectConverter.prototype.convertTarget = function(target, zipOut, progressCallback) {
    this.sounds = [];
    this.costumes = [];
    this.targetIsStage = target.isStage;
    this.targetName = target.name;

    var self = this;
    var chain = Promise.resolve();

    if (target.sounds) {
        target.sounds.forEach(function(s) {
            chain = chain.then(function() {
                return self.addSound(s, zipOut);
            }).then(function() {
                if (progressCallback) progressCallback();
            });
        });
    }

    if (target.costumes) {
        target.costumes.forEach(function(c) {
            chain = chain.then(function() {
                return self.addCostume(c, zipOut);
            }).then(function() {
                if (progressCallback) progressCallback();
            });
        });
    }

    return chain.then(function() {
        var variables = [];
        for (var k in target.variables) {
            var v = target.variables[k];
            variables.push({
                name: self.varName(v[0]),
                value: self.specialNum(v[1]),
                isPersistent: v.length >= 3 && v[2]
            });
        }

        var lists = [];
        for (var k2 in target.lists) {
            var l = target.lists[k2];
            lists.push({
                listName: self.varName(l[0]),
                contents: l[1].map(function(x) { return self.specialNum(x); }),
                isPersistent: false,
                x: 0, y: 0, width: 100, height: 200, visible: false 
            });
        }
        if (self.compat && !target.isStage) {
            var spriteCostumeNames = (target.costumes || []).map(function(c) { return c.name || ''; });
            var spriteListName = self.varName('SpriteCostumes');
            var alreadyHas = false;
            for(var lc=0; lc<lists.length; lc++) { if(lists[lc].listName === spriteListName) alreadyHas = true; }
            if (!alreadyHas) {
                lists.push({
                    listName: spriteListName,
                    contents: spriteCostumeNames.map(function(x) { return self.specialNum(x); }),
                    isPersistent: false,
                    x: 0, y: 0, width: 100, height: 200, visible: false
                });
            }
        }

        var scripts = [];
        var blocks = target.blocks;
        for (var k3 in blocks) {
            var b = blocks[k3];
            if (b.topLevel) {
                var x = Math.round(b.x / 1.5) || 0;
                var y = Math.round(b.y / 1.8) || 0;
                self.compatStackReporters = [];
                var stack = self.convertSubstack(k3, blocks);
                if (stack && stack.length > 0) scripts.push([x, y, stack]);
            }
        }

        if (self.compat) {
            if(self.penUpDown) {
                var pen = self.compatVarName('pen');
                variables.push({name: pen, value: 'up', isPersistent: false});
                scripts.push([0, 0, [['procDef', 'pen down', [], [], true], ['putPenDown'], ['setVar:to:', pen, 'down']]]);
                scripts.push([0, 0, [['procDef', 'pen up', [], [], true], ['putPenUp'], ['setVar:to:', pen, 'up']]]);
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
};
