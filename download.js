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
    var lh = document.getElementById("loadholder");
    if (lh) lh.className = lh.className.replace(/\bpulse\b/g, '');
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
            if (xhr.status !== 200) { perror(new Error('Failed to download project from URL.')); return; }
            handleProjectBlob(xhr.response, isDirectSource);
        };
        xhr.onerror = function () { perror(new Error('Network error during download.')); };
        xhr.send();
    } else {
        logMessage('Fetching project token...');
        $.getJSON("https://trampoline.turbowarp.org/api/projects/" + projectId, function (metaData) {
            var token = metaData.project_token;
            window.DownloadedTitle = metaData.title;
            logMessage('Downloading project JSON...');
            $.getJSON("https://projects.scratch.mit.edu/" + projectId + "?token=" + token, function (projectData) {
                handleProjectData(projectData);
            }).fail(function () { perror(new Error('Failed to download project JSON.')); });
        }).fail(function (xhr) {
            if (xhr.status === 404) perror(new Error('Project not found.'));
            else perror(new Error('Failed to fetch project token.'));
        });
    }
}

function handleProjectBlob(blob, isDirectSource) {
    var getProjectTextFromZip = function (zipInstance) {
        var deferred = $.Deferred();
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
            entry.async('string').then(function (s) { deferred.resolve(s); }, function () { deferred.resolve(null); });
        } else {
            deferred.resolve(null);
        }
        return deferred.promise();
    };
    var reader = new FileReader();
    reader.onload = function () {
        var ab = reader.result;
        var zip = new JSZip();
        zip.loadAsync(ab).then(function (loadedZip) {
            sourceZip = loadedZip;
            getProjectTextFromZip(loadedZip).then(function (projText) {
                if (projText) { handleProjectData(JSON.parse(projText), isDirectSource, blob); }
                else { parseAsRawText(blob, isDirectSource); }
            });
        }, function () { parseAsRawText(blob, isDirectSource); });
    };
    reader.readAsArrayBuffer(blob);
}

function parseAsRawText(blob, isDirectSource) {
    var reader = new FileReader();
    reader.onload = function () {
        try { handleProjectData(JSON.parse(reader.result), isDirectSource, blob); }
        catch (e) { perror(new Error('Downloaded file is not a valid project JSON or SB archive.')); }
    };
    reader.readAsText(blob);
}

function handleProjectData(projectData, isDirectSource, blob) {
    var isSB3 = projectData && projectData.targets && Array.isArray(projectData.targets);
    if (isDirectSource && !isSB3) {
        var reader = new FileReader();
        reader.onload = function () {
            var base64 = reader.result.split(',')[1];
            if (window.gotZipBase64) { window.gotZipBase64(base64); psuccess(); }
            else { perror(new Error('window.gotZipBase64 not found.')); }
        };
        reader.readAsDataURL(blob);
        return;
    }
    jszip = new JSZip();
    jszip.comment = "Converted sb3 to sb2";
    if (isSB3) { logMessage('Detected Scratch 3.0 project...'); processSB3(projectData); }
    else { logMessage('Detected Legacy (SB2) project.'); processLegacy(projectData); }
}

function processSB3(projectData) {
    var converter = new ProjectConverter();
    converter.compat = true;
    var totalAssets = 0;
    var completedAssets = 0;
    for (var i = 0; i < projectData.targets.length; i++) {
        totalAssets += projectData.targets[i].costumes.length + projectData.targets[i].sounds.length;
    }
    var targets = projectData.targets;
    var stage = null;
    var sprites = [];
    var processTargetsSequentially = function (index) {
        if (index >= targets.length) {
            sprites.sort(function (a, b) { return a.layerOrder - b.layerOrder; });
            for (var j = 0; j < sprites.length; j++) delete sprites[j].layerOrder;
            if (!stage) { perror(new Error("No Stage found.")); return; }
            stage.children = sprites;
            stage.info = { flashVersion: "MAC 32,0,0,0", swfVersion: "v461", spriteCount: sprites.length };
            jszip.file("project.json", JSON.stringify(stage));
            finalizeZip();
            return;
        }
        var target = targets[index];
        converter.convertTarget(target, jszip, function () {
            completedAssets++;
            setProgress(10 + (80 * (completedAssets / totalAssets)));
        }).then(function (convertedTarget) {
            if (target.isStage) stage = convertedTarget;
            else { convertedTarget.layerOrder = target.layerOrder; sprites.push(convertedTarget); }
            processTargetsSequentially(index + 1);
        });
    };
    processTargetsSequentially(0);
}

function finalizeZip() {
    logMessage("Compressing...");
    setProgress(95);
    jszip.generateAsync({ type: "base64" }).then(function (content) { finish(content); });
}

function finish(content) {
    setProgress(100);
    if (window.gotZipBase64) { window.gotZipBase64(content); psuccess(); }
    else { logMessage("Error: callback not found."); }
}

function processLegacy(projectData) {
    var costumeId = 0, soundId = 0, textId = 100000, assets = [];
    var parseNode = function (node) {
        if (node.costumes) {
            for (var i = 0; i < node.costumes.length; i++) {
                node.costumes[i].baseLayerID = costumeId++;
                node.costumes[i].textLayerID = textId++;
                assets.push({ type: 'costume', data: node.costumes[i] });
            }
        }
        if (node.sounds) {
            for (var j = 0; j < node.sounds.length; j++) {
                node.sounds[j].soundID = soundId++;
                assets.push({ type: 'sound', data: node.sounds[j] });
            }
        }
        if (node.children) { for (var k = 0; k < node.children.length; k++) parseNode(node.children[k]); }
    };
    parseNode(projectData);
    var completed = 0;
    var processNext = function (idx) {
        if (idx >= assets.length) { jszip.file("project.json", JSON.stringify(projectData)); finalizeZip(); return; }
        var asset = assets[idx], md5 = asset.type === 'costume' ? asset.data.baseLayerMD5 : asset.data.md5;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', "https://assets.scratch.mit.edu/internalapi/asset/" + md5 + "/get/", true);
        xhr.responseType = 'blob';
        xhr.onload = function () {
            var reader = new FileReader();
            reader.onload = function () {
                var b64 = reader.result.split(',')[1];
                var ext = md5.match(/\.[a-zA-Z0-9]+/)[0];
                var fn = (asset.type === 'costume' ? asset.data.baseLayerID : asset.data.soundID) + ext;
                jszip.file(fn, b64, { base64: true });
                completed++;
                setProgress(10 + (80 * (completed / assets.length)));
                processNext(idx + 1);
            };
            reader.readAsDataURL(xhr.response);
        };
        xhr.onerror = function () { processNext(idx + 1); };
        xhr.send();
    };
    processNext(0);
}

function BlockArgMapper(c) { this.c = c; }
BlockArgMapper.prototype = {
    mapArgs: function (op, b, bs) { if (this[op]) return this[op](b, bs); return null; },
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
    looks_changeeffectby: function (b, bs) { var f = this.c.fieldVal('EFFECT', b); return ['changeGraphicEffect:by:', f ? f.toLowerCase() : '', this.c.inputVal('CHANGE', b, bs)]; },
    looks_seteffectto: function (b, bs) { var f = this.c.fieldVal('EFFECT', b); return ['setGraphicEffect:to:', f ? f.toLowerCase() : '', this.c.inputVal('VALUE', b, bs)]; },
    looks_cleargraphiceffects: function (b, bs) { return ['filterReset']; },
    looks_changesizeby: function (b, bs) { return ['changeSizeBy:', this.c.inputVal('CHANGE', b, bs)]; },
    looks_setsizeto: function (b, bs) { return ['setSizeTo:', this.c.inputVal('SIZE', b, bs)]; },
    looks_gotofrontback: function (b, bs) { return this.c.fieldVal('FRONT_BACK', b) === 'front' ? ['comeToFront'] : ['goBackByLayers:', 1.79e+308]; },
    looks_goforwardbackwardlayers: function (b, bs) { var layers = this.c.inputVal('NUM', b, bs); if (this.c.fieldVal('FORWARD_BACKWARD', b) === 'forward') { if (typeof layers === 'number') layers *= -1; else layers = ['*', -1, layers]; } return ['goBackByLayers:', layers]; },
    looks_costumenumbername: function (b, bs) { if (this.c.fieldVal('NUMBER_NAME', b) === 'number') return ['costumeIndex']; return ['costumeName']; },
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
    event_whengreaterthan: function (b, bs) { var f = this.c.fieldVal('WHENGREATERTHANMENU', b); return ['whenSensorGreaterThan', f ? f.toLowerCase() : '', this.c.inputVal('VALUE', b, bs)]; },
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
        var a = this.c.fieldVal('PROPERTY', b), o = this.c.inputVal('OBJECT', b, bs);
        var s = { 'backdrop #': 1, 'backdrop name': 1, 'volume': 1 }, sp = { 'x position': 1, 'y position': 1, 'direction': 1, 'costume #': 1, 'costume name': 1, 'size': 1, 'volume': 1 };
        if (o === '_stage_') { if (!s[a]) a = this.c.varName(a); } else if (!sp[a]) a = this.c.varName(a);
        return ['getAttribute:of:', a, o];
    },
    sensing_current: function (b, bs) { var f = this.c.fieldVal('CURRENTMENU', b); return ['timeAndDate', f ? f.toLowerCase() : '']; },
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
    operator_join: function (b, bs) { return ['concatenate:with:', this.c.inputVal('STRING1', b, bs), this.c.inputVal('STRING2', b, bs)]; },
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
    procedures_definition: function (b, bs) {
        var c = bs[b.inputs.custom_block[1]], m = c.mutation, args = JSON.parse(m.argumentnames), defs = JSON.parse(m.argumentdefaults);
        while (defs.length < args.length) defs.push('');
        return ['procDef', this.c.varName(m.proccode), args, defs, m.warp === 'true' || m.warp === true];
    },
    procedures_call: function (b, bs) {
        var m = b.mutation, o = ['call', this.c.varName(m.proccode)], ids = JSON.parse(m.argumentids);
        for (var i = 0; i < ids.length; i++) o.push(this.c.inputVal(ids[i], b, bs));
        return o;
    },
    argument_reporter_string_number: function (b, bs) { return ['getParam', this.c.fieldVal('VALUE', b), 'r']; },
    argument_reporter_boolean: function (b, bs) { return ['getParam', this.c.fieldVal('VALUE', b), 'b']; },
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
    this.soundAssets = {}; this.costumeAssets = {}; this.sounds = []; this.costumes = [];
    this._fontFiles = {
        'Noto Sans': 'https://raw.githubusercontent.com/towerofnix/scratch-render-fonts/master/src/NotoSans-Medium.ttf',
        'Source Serif Pro': 'https://raw.githubusercontent.com/towerofnix/scratch-render-fonts/master/src/SourceSerifPro-Regular.otf',
        'Handlee': 'https://raw.githubusercontent.com/towerofnix/scratch-render-fonts/master/src/handlee-regular.ttf',
        'Knewave': 'https://raw.githubusercontent.com/towerofnix/scratch-render-fonts/master/src/Knewave.ttf',
        'Griffy': 'https://raw.githubusercontent.com/towerofnix/scratch-render-fonts/master/src/Griffy-Regular.ttf',
        'Grand9K Pixel': 'https://raw.githubusercontent.com/towerofnix/scratch-render-fonts/master/src/Grand9K-Pixel.ttf'
    };
    this._fontCache = {};
}
ProjectConverter.prototype = {
    varName: function (n) { if (typeof n !== 'string') return n; return (this.compat ? '\u00A0' : '') + n; },
    specialNum: function (n) { if (n === '-Infinity') return -Infinity; if (n === 'Infinity') return Infinity; if (n === 'NaN') return NaN; return n; },
    hexToDec: function (h) { if (typeof h === 'string' && h.indexOf('#') === 0) return parseInt(h.substring(1), 16); return h; },
    inputVal: function (n, b, bs) {
        var i = b.inputs[n]; if (!i || i[1] === null) return false;
        if (i[0] === 1) { if (typeof i[1] === 'string') return this.convertBlock(bs[i[1]], bs); return i[1][1]; }
        var v = i[1];
        if (Array.isArray(v)) {
            var t = v[0], val = v[1];
            if (t === 12) return ['readVariable', this.varName(val)];
            if (t === 13) return ['contentsOfList:', this.varName(val)];
            if (t >= 4 && t <= 8) { var num = parseFloat(val); if (!isNaN(num)) val = num; }
            else if (t === 9) val = this.hexToDec(val);
            return this.specialNum(val);
        }
        return this.convertBlock(bs[v], bs);
    },
    fieldVal: function (n, b) { var f = b.fields[n]; if (!f) return null; var v = f[0]; if (n === 'VARIABLE' || n === 'LIST') v = this.varName(v); return v; },
    substackVal: function (n, b, bs) { var i = b.inputs[n]; if (!i || i[1] === null) return []; return this.convertSubstack(i[1], bs); },
    convertBlock: function (b, bs) {
        if (!b) return null;
        if (b.shadow && !b.topLevel) { for (var k in b.fields) return this.fieldVal(k, b); }
        var res = this.argMapper.mapArgs(b.opcode, b, bs);
        return res || [b.opcode];
    },
    convertSubstack: function (id, bs) {
        var s = [], c = id;
        while (c) { var b = bs[c]; if (!b) break; var o = this.convertBlock(b, bs); if (o) s.push(o); c = b.next; }
        return s;
    },
    _readZipEntry: function (e) {
        var d = $.Deferred(); if (!e) { d.resolve(null); return d.promise(); }
        e.async('uint8array').then(function (u) { d.resolve(u); }, function () { d.resolve(null); });
        return d.promise();
    },
    addCostume: function (c, z) {
        var self = this, d = $.Deferred();
        if (!this.costumeAssets[c.assetId]) {
            var ext = c.dataFormat, url = "https://assets.scratch.mit.edu/internalapi/asset/" + c.md5ext + "/get/";
            var next = function (u) {
                var idx = 0; for (var k in self.costumeAssets) idx++;
                if (ext === 'svg') {
                    var s = ''; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
                    z.file(idx + ".svg", s);
                    self._rasterize(s, c.bitmapResolution || 1).then(function (p) {
                        self.costumeAssets[c.assetId] = [idx, c.name, idx + ".png"]; z.file(idx + ".png", p); d.resolve();
                    }, function () {
                        self.costumeAssets[c.assetId] = [idx, c.name, idx + ".svg"]; d.resolve();
                    });
                } else {
                    z.file(idx + "." + ext, u); self.costumeAssets[c.assetId] = [idx, c.name, idx + "." + ext]; d.resolve();
                }
            };
            var e = null;
            if (sourceZip) {
                e = sourceZip.file(c.md5ext) || sourceZip.file('assets/' + c.md5ext);
                if (!e) { for (var n in sourceZip.files) { if (n.indexOf(c.md5ext) !== -1) { e = sourceZip.file(n); break; } } }
            }
            if (e) { this._readZipEntry(e).then(next); }
            else {
                var x = new XMLHttpRequest(); x.open('GET', url, true); x.responseType = 'arraybuffer';
                x.onload = function () { next(new Uint8Array(x.response)); };
                x.onerror = function () { next(new Uint8Array(0)); }; x.send();
            }
        } else { d.resolve(); }
        return d.promise().then(function () {
            var a = self.costumeAssets[c.assetId];
            self.costumes.push({ costumeName: c.name, baseLayerID: a[0], baseLayerMD5: a[2], rotationCenterX: c.rotationCenterX, rotationCenterY: c.rotationCenterY, bitmapResolution: c.bitmapResolution || 1 });
        });
    },
    _rasterize: function (s, sc) {
        var d = $.Deferred(), m = { 'Sans Serif': 'Noto Sans', 'Serif': 'Source Serif Pro', 'Marker': 'Knewave', 'Handwriting': 'Handlee', 'Curly': 'Griffy', 'Pixel': 'Grand9K Pixel' };
        for (var f in m) { s = s.split('font-family="' + f + '"').join('font-family="' + m[f] + '"'); }
        var url = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(s)));
        var img = new Image();
        img.onload = function () {
            var c = document.createElement('canvas'); c.width = Math.max(1, 480 * sc); c.height = Math.max(1, 360 * sc);
            var ctx = c.getContext('2d');
            try {
                ctx.drawImage(img, 0, 0, c.width, c.height);
                var data = c.toDataURL('image/png').split(',')[1], bin = atob(data), arr = new Uint8Array(bin.length);
                for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                d.resolve(arr);
            } catch (e) { d.reject(); }
        };
        img.onerror = function () { d.reject(); }; img.src = url;
        return d.promise();
    },
    addSound: function (s, z) {
        var self = this, d = $.Deferred(), url = "https://assets.scratch.mit.edu/internalapi/asset/" + s.md5ext + "/get/";
        var finish = function (ab) {
            var idx = 0; for (var k in self.soundAssets) idx++;
            z.file(idx + "." + s.dataFormat, ab);
            self.soundAssets[s.assetId] = [idx, s.name, s.sampleCount, s.rate, idx + "." + s.dataFormat];
            self.sounds.push({ soundName: s.name, soundID: idx, md5: idx + "." + s.dataFormat, sampleCount: s.sampleCount, rate: s.rate, format: '' });
            d.resolve();
        };
        var e = sourceZip ? (sourceZip.file(s.md5ext) || sourceZip.file('assets/' + s.md5ext)) : null;
        if (e) { e.async('arraybuffer').then(finish); }
        else {
            var x = new XMLHttpRequest(); x.open('GET', url, true); x.responseType = 'arraybuffer';
            x.onload = function () { finish(x.response); }; x.onerror = function () { d.resolve(); }; x.send();
        }
        return d.promise();
    },
    convertTarget: function (t, z, pr) {
        var self = this, d = $.Deferred(), sIdx = 0, cIdx = 0;
        var loadS = function () {
            if (sIdx >= t.sounds.length) { loadC(); return; }
            self.addSound(t.sounds[sIdx++], z).then(function () { if (pr) pr(); loadS(); });
        };
        var loadC = function () {
            if (cIdx >= t.costumes.length) { d.resolve(); return; }
            self.addCostume(t.costumes[cIdx++], z).then(function () { if (pr) pr(); loadC(); });
        };
        loadS();
        return d.promise().then(function () {
            var vars = [], lists = [], scripts = [];
            for (var k in t.variables) { var v = t.variables[k]; vars.push({ name: self.varName(v[0]), value: self.specialNum(v[1]), isPersistent: v[2] }); }
            for (var lk in t.lists) { var l = t.lists[lk]; lists.push({ listName: self.varName(l[0]), contents: l[1].map(function (x) { return self.specialNum(x); }), isPersistent: false, x: 0, y: 0, width: 100, height: 200, visible: false }); }
            for (var bk in t.blocks) {
                var b = t.blocks[bk];
                if (b.topLevel) { var stack = self.convertSubstack(bk, t.blocks); if (stack.length) scripts.push([Math.round(b.x / 1.5) || 0, Math.round(b.y / 1.8) || 0, stack]); }
            }
            var obj = { objName: t.isStage ? 'Stage' : t.name, scripts: scripts, variables: vars, lists: lists, sounds: self.sounds, costumes: self.costumes, currentCostumeIndex: t.currentCostume };
            if (t.isStage) { obj.tempoBPM = t.tempo; obj.videoAlpha = (100 - t.videoTransparency) / 100; obj.children = []; }
            else { obj.scratchX = t.x; obj.scratchY = t.y; obj.scale = t.size / 100; obj.direction = t.direction; var m = { 'all around': 'normal', 'left-right': 'leftRight', "don't rotate": 'none' }; obj.rotationStyle = m[t.rotationStyle] || 'normal'; obj.visible = t.visible; }
            return obj;
        });
    }
};
