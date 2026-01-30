var maxWidth = 0;
var jszip = null;
var id = null;

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
    setTimeout(() => {
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

async function startDownload(projectId) {
    $("#log").text("");
    $("#progress").removeClass("error success");
    $("#progress").css("opacity", 1);
    // $("#downloader").css("height", 15);
    $("#scratchloader").css("opacity", 1);

    logMessage("Initializing download for ID: " + projectId);
    setProgress(5);

    try {
        logMessage("Fetching project token...");
        const metaResponse = await fetch(`https://trampoline.turbowarp.org/api/projects/${projectId}`);
        if (!metaResponse.ok) {
            if (metaResponse.status === 404) throw new Error("Project not found.");
            throw new Error("Failed to fetch project token.");
        }
        const metaData = await metaResponse.json();
        const token = metaData.project_token;
        window.DownloadedTitle = metaData.title;

        logMessage("Downloading project JSON...");
        const projectResponse = await fetch(`https://projects.scratch.mit.edu/${projectId}?token=${token}`);
        if (!projectResponse.ok) throw new Error("Failed to download project JSON.");
        
        const projectData = await projectResponse.json();
        
        const isSB3 = projectData.targets && Array.isArray(projectData.targets);

        jszip = new JSZip();
        jszip.comment = "Converted/Downloaded with JS Scratch Converter";

        if (isSB3) {
            logMessage("Detected Scratch 3.0 project. Starting conversion...");
            await processSB3(projectData);
        } else {
            logMessage("Detected Legacy (SB2) project.");
            await processLegacy(projectData);
        }

    } catch (err) {
        perror(err);
    }
}

async function processSB3(projectData) {
    const converter = new ProjectConverter();

    // CONVERTION SETTINGS
    converter.compat = false;
    converter.unlimJoin = false;
    converter.limList = false;
    converter.penFill = false;

    let totalAssets = 0;
    let completedAssets = 0;
    projectData.targets.forEach(t => {
        totalAssets += t.costumes.length + t.sounds.length;
    });

    logMessage(`Found ${totalAssets} assets to convert.`);

    const targets = projectData.targets;
    let stage = null;
    let sprites = [];

    for (const target of targets) {
        const convertedTarget = await converter.convertTarget(target, jszip, () => {
            completedAssets++;
            const progress = 10 + (80 * (completedAssets / totalAssets));
            setProgress(progress);
        });

        if (target.isStage) {
            stage = convertedTarget;
        } else {
            convertedTarget.layerOrder = target.layerOrder;
            sprites.push(convertedTarget);
        }
        logMessage(`Processed: ${target.name}`);
    }

    sprites.sort((a, b) => a.layerOrder - b.layerOrder);
    sprites.forEach(s => delete s.layerOrder);

    if (!stage) throw new Error("No Stage found in JSON.");
    stage.children = sprites;

    stage.info = stage.info || {};
    stage.info.flashVersion = "MAC 32,0,0,0";
    stage.info.swfVersion = "v461";
    stage.info.spriteCount = sprites.length;
    stage.info.scriptCount = sprites.reduce((acc, s) => acc + s.scripts.length, 0) + stage.scripts.length;

    if (converter.timerCompat) {
        const gfResetTimer = [0, 0, [['whenGreenFlag'], ['doIf', ['>', ['-', ['*', 86400, ['-', ['timestamp'], ['readVariable', 'reset time']]], ['timer']], '0.1'], [['setVar:to:', 'reset time', ['-', ['timestamp'], ['/', ['timer'], 86400]]]]]]];
        stage.scripts.push(gfResetTimer);
        sprites.forEach(s => s.scripts.push(gfResetTimer));
    }

    jszip.file("project.json", JSON.stringify(stage));

    finalizeZip();
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

async function processLegacy(projectData) {
    let costumeId = 0;
    let soundId = 0;
    let textLayerIDCounter = 100000;
    
    const assetsToDownload = [];
    
    function parseNode(node) {
        if (node.costumes) {
            node.costumes.forEach(c => {
                c.baseLayerID = costumeId++;
                c.textLayerID = textLayerIDCounter++;
                assetsToDownload.push({ type: 'costume', data: c });
            });
        }
        if (node.sounds) {
            node.sounds.forEach(s => {
                s.soundID = soundId++;
                assetsToDownload.push({ type: 'sound', data: s });
            });
        }
        if (node.children) {
            node.children.forEach(child => parseNode(child));
        }
    }

    parseNode(projectData);

    let completed = 0;
    const total = assetsToDownload.length;

    logMessage(`Found ${total} legacy assets.`);

    const downloadAsset = async (md5, filename) => {
        if (!md5) return;
        const resp = await fetch(`https://assets.scratch.mit.edu/internalapi/asset/${md5}/get/`);
        if (!resp.ok) return;
        const blob = await resp.blob();

        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => {
                const b64 = reader.result.split(',')[1];
                jszip.file(filename, b64, {base64: true});
                resolve();
            };
            reader.readAsDataURL(blob);
        });
    };

    for (const asset of assetsToDownload) {
        if (asset.type === 'costume') {
            const c = asset.data;
            const ext = c.baseLayerMD5.match(/\.[a-zA-Z0-9]+/)[0];
            await downloadAsset(c.baseLayerMD5, c.baseLayerID + ext);
            if (c.textLayerMD5) {
                const textExt = c.textLayerMD5.match(/\.[a-zA-Z0-9]+/)[0];
                await downloadAsset(c.textLayerMD5, c.textLayerID + textExt);
            }
        } else {
            const s = asset.data;
            const ext = s.md5.match(/\.[a-zA-Z0-9]+/)[0];
            await downloadAsset(s.md5, s.soundID + ext);
        }
        
        completed++;
        setProgress(10 + (80 * (completed / total)));
    }

    jszip.file("project.json", JSON.stringify(projectData));
    finalizeZip();
}

const STAGE_ATTRS = new Set(['backdrop #', 'backdrop name', 'volume']);
const SPRITE_ATTRS = new Set(['x position', 'y position', 'direction', 'costume #', 'costume name', 'size', 'volume']);
const ROTATION_STYLES = { 'all around': 'normal', 'left-right': 'leftRight', "don't rotate": 'none' };
const ASSET_HOST = "https://assets.scratch.mit.edu/internalapi/asset";

class BlockArgMapper {
    constructor(converter) { this.c = converter; }
    mapArgs(opcode, block, blocks) {
        if (this[opcode]) return this[opcode](block, blocks);
        return null;
    }
    // Motion
    motion_movesteps(b, bs) { return ['forward:', this.c.inputVal('STEPS', b, bs)]; }
    motion_turnright(b, bs) { return ['turnRight:', this.c.inputVal('DEGREES', b, bs)]; }
    motion_turnleft(b, bs) { return ['turnLeft:', this.c.inputVal('DEGREES', b, bs)]; }
    motion_pointindirection(b, bs) { return ['heading:', this.c.inputVal('DIRECTION', b, bs)]; }
    motion_pointtowards(b, bs) { return ['pointTowards:', this.c.inputVal('TOWARDS', b, bs)]; }
    motion_gotoxy(b, bs) { return ['gotoX:y:', this.c.inputVal('X', b, bs), this.c.inputVal('Y', b, bs)]; }
    motion_goto(b, bs) { return ['gotoSpriteOrMouse:', this.c.inputVal('TO', b, bs)]; }
    motion_glidesecstoxy(b, bs) { return ['glideSecs:toX:y:elapsed:from:', this.c.inputVal('SECS', b, bs), this.c.inputVal('X', b, bs), this.c.inputVal('Y', b, bs)]; }
    motion_changexby(b, bs) { return ['changeXposBy:', this.c.inputVal('DX', b, bs)]; }
    motion_setx(b, bs) { return ['xpos:', this.c.inputVal('X', b, bs)]; }
    motion_changeyby(b, bs) { return ['changeYposBy:', this.c.inputVal('DY', b, bs)]; }
    motion_sety(b, bs) { return ['ypos:', this.c.inputVal('Y', b, bs)]; }
    motion_ifonedgebounce(b, bs) { return ['bounceOffEdge']; }
    motion_setrotationstyle(b, bs) { return ['setRotationStyle', this.c.fieldVal('STYLE', b)]; }
    motion_xposition(b, bs) { return ['xpos']; }
    motion_yposition(b, bs) { return ['ypos']; }
    motion_direction(b, bs) { return ['heading']; }
    // Looks
    looks_sayforsecs(b, bs) { return ['say:duration:elapsed:from:', this.c.inputVal('MESSAGE', b, bs), this.c.inputVal('SECS', b, bs)]; }
    looks_say(b, bs) { return ['say:', this.c.inputVal('MESSAGE', b, bs)]; }
    looks_thinkforsecs(b, bs) { return ['think:duration:elapsed:from:', this.c.inputVal('MESSAGE', b, bs), this.c.inputVal('SECS', b, bs)]; }
    looks_think(b, bs) { return ['think:', this.c.inputVal('MESSAGE', b, bs)]; }
    looks_show(b, bs) { return ['show']; }
    looks_hide(b, bs) { return ['hide']; }
    looks_switchcostumeto(b, bs) { return ['lookLike:', this.c.inputVal('COSTUME', b, bs)]; }
    looks_nextcostume(b, bs) { return ['nextCostume']; }
    looks_switchbackdropto(b, bs) { return ['startScene', this.c.inputVal('BACKDROP', b, bs)]; }
    looks_nextbackdrop(b, bs) { return ['nextScene']; }
    looks_changeeffectby(b, bs) { 
        let f = this.c.fieldVal('EFFECT', b);
        if (typeof f === 'string') f = f.toLowerCase();
        return ['changeGraphicEffect:by:', f, this.c.inputVal('CHANGE', b, bs)];
    }
    looks_seteffectto(b, bs) { 
        let f = this.c.fieldVal('EFFECT', b);
        if (typeof f === 'string') f = f.toLowerCase();
        return ['setGraphicEffect:to:', f, this.c.inputVal('VALUE', b, bs)];
    }
    looks_cleargraphiceffects(b, bs) { return ['filterReset']; }
    looks_changesizeby(b, bs) { return ['changeSizeBy:', this.c.inputVal('CHANGE', b, bs)]; }
    looks_setsizeto(b, bs) { return ['setSizeTo:', this.c.inputVal('SIZE', b, bs)]; }
    looks_gotofrontback(b, bs) { return this.c.fieldVal('FRONT_BACK', b) === 'front' ? ['comeToFront'] : ['goBackByLayers:', 1.79e+308]; }
    looks_goforwardbackwardlayers(b, bs) {
        let layers = this.c.inputVal('NUM', b, bs);
        if (this.c.fieldVal('FORWARD_BACKWARD', b) === 'forward') {
            if (typeof layers === 'number') layers *= -1;
            else layers = ['*', -1, layers];
        }
        return ['goBackByLayers:', layers];
    }
    looks_costumenumbername(b, bs) { return this.c.fieldVal('NUMBER_NAME', b) === 'number' ? ['costumeIndex'] : ['costumeName']; }
    looks_backdropnumbername(b, bs) { return this.c.fieldVal('NUMBER_NAME', b) === 'number' ? ['backgroundIndex'] : ['sceneName']; }
    looks_size(b, bs) { return ['scale']; }
    // Sound
    sound_play(b, bs) { return ['playSound:', this.c.inputVal('SOUND_MENU', b, bs)]; }
    sound_playuntildone(b, bs) { return ['doPlaySoundAndWait', this.c.inputVal('SOUND_MENU', b, bs)]; }
    sound_stopallsounds(b, bs) { return ['stopAllSounds']; }
    sound_changevolumeby(b, bs) { return ['changeVolumeBy:', this.c.inputVal('VOLUME', b, bs)]; }
    sound_setvolumeto(b, bs) { return ['setVolumeTo:', this.c.inputVal('VOLUME', b, bs)]; }
    sound_volume(b, bs) { return ['volume']; }
    // Events
    event_whenflagclicked(b, bs) { return ['whenGreenFlag']; }
    event_whenkeypressed(b, bs) { return ['whenKeyPressed', this.c.fieldVal('KEY_OPTION', b)]; }
    event_whenthisspriteclicked(b, bs) { return ['whenClicked']; }
    event_whenstageclicked(b, bs) { return ['whenClicked']; }
    event_whenbackdropswitchesto(b, bs) { return ['whenSceneStarts', this.c.fieldVal('BACKDROP', b)]; }
    event_whengreaterthan(b, bs) { 
        let f = this.c.fieldVal('WHENGREATERTHANMENU', b);
        if(typeof f === 'string') f = f.toLowerCase();
        return ['whenSensorGreaterThan', f, this.c.inputVal('VALUE', b, bs)];
    }
    event_whenbroadcastreceived(b, bs) { return ['whenIReceive', this.c.fieldVal('BROADCAST_OPTION', b)]; }
    event_broadcast(b, bs) { return ['broadcast:', this.c.inputVal('BROADCAST_INPUT', b, bs)]; }
    event_broadcastandwait(b, bs) { return ['doBroadcastAndWait', this.c.inputVal('BROADCAST_INPUT', b, bs)]; }
    // Control
    control_wait(b, bs) { return ['wait:elapsed:from:', this.c.inputVal('DURATION', b, bs)]; }
    control_repeat(b, bs) { return ['doRepeat', this.c.inputVal('TIMES', b, bs), this.c.substackVal('SUBSTACK', b, bs)]; }
    control_forever(b, bs) { return ['doForever', this.c.substackVal('SUBSTACK', b, bs)]; }
    control_if(b, bs) { return ['doIf', this.c.inputVal('CONDITION', b, bs), this.c.substackVal('SUBSTACK', b, bs)]; }
    control_if_else(b, bs) { return ['doIfElse', this.c.inputVal('CONDITION', b, bs), this.c.substackVal('SUBSTACK', b, bs), this.c.substackVal('SUBSTACK2', b, bs)]; }
    control_wait_until(b, bs) { return ['doWaitUntil', this.c.inputVal('CONDITION', b, bs)]; }
    control_repeat_until(b, bs) { return ['doUntil', this.c.inputVal('CONDITION', b, bs), this.c.substackVal('SUBSTACK', b, bs)]; }
    control_stop(b, bs) { return ['stopScripts', this.c.fieldVal('STOP_OPTION', b)]; }
    control_start_as_clone(b, bs) { return ['whenCloned']; }
    control_create_clone_of(b, bs) { return ['createCloneOf', this.c.inputVal('CLONE_OPTION', b, bs)]; }
    control_delete_this_clone(b, bs) { return ['deleteClone']; }
    // Sensing
    sensing_touchingobject(b, bs) { return ['touching:', this.c.inputVal('TOUCHINGOBJECTMENU', b, bs)]; }
    sensing_touchingcolor(b, bs) { return ['touchingColor:', this.c.inputVal('COLOR', b, bs)]; }
    sensing_coloristouchingcolor(b, bs) { return ['color:sees:', this.c.inputVal('COLOR', b, bs), this.c.inputVal('COLOR2', b, bs)]; }
    sensing_distanceto(b, bs) { return ['distanceTo:', this.c.inputVal('DISTANCETOMENU', b, bs)]; }
    sensing_askandwait(b, bs) { return ['doAsk', this.c.inputVal('QUESTION', b, bs)]; }
    sensing_answer(b, bs) { return ['answer']; }
    sensing_keypressed(b, bs) { return ['keyPressed:', this.c.inputVal('KEY_OPTION', b, bs)]; }
    sensing_mousedown(b, bs) { return ['mousePressed']; }
    sensing_mousex(b, bs) { return ['mouseX']; }
    sensing_mousey(b, bs) { return ['mouseY']; }
    sensing_loudness(b, bs) { return ['soundLevel']; }
    sensing_timer(b, bs) { 
        if(this.c.compat) { this.c.timerCompat = true; return ['*', 86400, ['-', ['timestamp'], ['readVariable', 'reset time']]]; }
        return ['timer']; 
    }
    sensing_resettimer(b, bs) {
        if(this.c.compat) { this.c.resetTimer = true; this.c.timerCompat = true; return ['call', 'reset timer']; }
        return ['timerReset'];
    }
    sensing_of(b, bs) {
        let attr = this.c.fieldVal('PROPERTY', b);
        let obj = this.c.inputVal('OBJECT', b, bs);
        if (obj === '_stage_') { if (!STAGE_ATTRS.has(attr)) attr = this.c.varName(attr); } 
        else if (!SPRITE_ATTRS.has(attr)) { attr = this.c.varName(attr); }
        return ['getAttribute:of:', attr, obj];
    }
    sensing_current(b, bs) {
        let f = this.c.fieldVal('CURRENTMENU', b);
        if (typeof f === 'string') f = f.toLowerCase();
        return ['timeAndDate', f];
    }
    sensing_dayssince2000(b, bs) { return ['timestamp']; }
    sensing_username(b, bs) { return ['getUserName']; }
    // Operators
    operator_add(b, bs) { return ['+', this.c.inputVal('NUM1', b, bs), this.c.inputVal('NUM2', b, bs)]; }
    operator_subtract(b, bs) { return ['-', this.c.inputVal('NUM1', b, bs), this.c.inputVal('NUM2', b, bs)]; }
    operator_multiply(b, bs) { return ['*', this.c.inputVal('NUM1', b, bs), this.c.inputVal('NUM2', b, bs)]; }
    operator_divide(b, bs) { return ['/', this.c.inputVal('NUM1', b, bs), this.c.inputVal('NUM2', b, bs)]; }
    operator_random(b, bs) { return ['randomFrom:to:', this.c.inputVal('FROM', b, bs), this.c.inputVal('TO', b, bs)]; }
    operator_gt(b, bs) { return ['>', this.c.inputVal('OPERAND1', b, bs), this.c.inputVal('OPERAND2', b, bs)]; }
    operator_lt(b, bs) { return ['<', this.c.inputVal('OPERAND1', b, bs), this.c.inputVal('OPERAND2', b, bs)]; }
    operator_equals(b, bs) { return ['=', this.c.inputVal('OPERAND1', b, bs), this.c.inputVal('OPERAND2', b, bs)]; }
    operator_and(b, bs) { return ['&', this.c.inputVal('OPERAND1', b, bs), this.c.inputVal('OPERAND2', b, bs)]; }
    operator_or(b, bs) { return ['|', this.c.inputVal('OPERAND1', b, bs), this.c.inputVal('OPERAND2', b, bs)]; }
    operator_not(b, bs) { return ['not', this.c.inputVal('OPERAND', b, bs)]; }
    operator_join(b, bs) {
        if(this.c.unlimJoin) {
            this.c.joinStr = true;
            let stackReporter = ['call', 'join %s %s', this.c.inputVal('STRING1', b, bs), this.c.inputVal('STRING2', b, bs)];
            if(this.c.compatStackReporters.length > 0) this.c.compatStackReporters[this.c.compatStackReporters.length-1].push(stackReporter);
            return ['getLine:ofList:', (this.c.compatStackReporters.length > 0 ? this.c.compatStackReporters[this.c.compatStackReporters.length-1].length : 1), this.c.compatVarName('results')];
        }
        return ['concatenate:with:', this.c.inputVal('STRING1', b, bs), this.c.inputVal('STRING2', b, bs)];
    }
    operator_letter_of(b, bs) { return ['letter:of:', this.c.inputVal('LETTER', b, bs), this.c.inputVal('STRING', b, bs)]; }
    operator_length(b, bs) { return ['stringLength:', this.c.inputVal('STRING', b, bs)]; }
    operator_mod(b, bs) { return ['%', this.c.inputVal('NUM1', b, bs), this.c.inputVal('NUM2', b, bs)]; }
    operator_round(b, bs) { return ['rounded', this.c.inputVal('NUM', b, bs)]; }
    operator_mathop(b, bs) { return ['computeFunction:of:', this.c.fieldVal('OPERATOR', b), this.c.inputVal('NUM', b, bs)]; }
    // Data
    data_variable(b, bs) { return ['readVariable', this.c.fieldVal('VARIABLE', b)]; }
    data_setvariableto(b, bs) { return ['setVar:to:', this.c.fieldVal('VARIABLE', b), this.c.inputVal('VALUE', b, bs)]; }
    data_changevariableby(b, bs) { return ['changeVar:by:', this.c.fieldVal('VARIABLE', b), this.c.inputVal('VALUE', b, bs)]; }
    data_showvariable(b, bs) { return ['showVariable:', this.c.fieldVal('VARIABLE', b)]; }
    data_hidevariable(b, bs) { return ['hideVariable:', this.c.fieldVal('VARIABLE', b)]; }
    data_listcontents(b, bs) { return ['contentsOfList:', this.c.fieldVal('LIST', b)]; }
    data_addtolist(b, bs) { 
        if(this.c.limList) { this.c.addList = true; return ['call', 'add %s to %m.list', this.c.inputVal('ITEM', b, bs), this.c.fieldVal('LIST', b)]; }
        return ['append:toList:', this.c.inputVal('ITEM', b, bs), this.c.fieldVal('LIST', b)]; 
    }
    data_deleteoflist(b, bs) { return ['deleteLine:ofList:', this.c.inputVal('INDEX', b, bs), this.c.fieldVal('LIST', b)]; }
    data_deletealloflist(b, bs) { return ['deleteLine:ofList:', 'all', this.c.fieldVal('LIST', b)]; }
    data_insertatlist(b, bs) { 
        if(this.c.limList) { this.c.insertList = true; return ['call', 'insert %s at %n of %m.list', this.c.inputVal('ITEM', b, bs), this.c.inputVal('INDEX', b, bs), this.c.fieldVal('LIST', b)]; }
        return ['insert:at:ofList:', this.c.inputVal('ITEM', b, bs), this.c.inputVal('INDEX', b, bs), this.c.fieldVal('LIST', b)]; 
    }
    data_replaceitemoflist(b, bs) { return ['setLine:ofList:to:', this.c.inputVal('INDEX', b, bs), this.c.fieldVal('LIST', b), this.c.inputVal('ITEM', b, bs)]; }
    data_itemoflist(b, bs) { return ['getLine:ofList:', this.c.inputVal('INDEX', b, bs), this.c.fieldVal('LIST', b)]; }
    data_lengthoflist(b, bs) { return ['lineCountOfList:', this.c.fieldVal('LIST', b)]; }
    data_listcontainsitem(b, bs) { return ['list:contains:', this.c.fieldVal('LIST', b), this.c.inputVal('ITEM', b, bs)]; }
    data_showlist(b, bs) { return ['showList:', this.c.fieldVal('LIST', b)]; }
    data_hidelist(b, bs) { return ['hideList:', this.c.fieldVal('LIST', b)]; }
    // Procedures
    procedures_definition(b, bs) {
        let customBlock = bs[b.inputs.custom_block[1]];
        let procData = customBlock.mutation;
        let args = JSON.parse(procData.argumentnames);
        let defaults = JSON.parse(procData.argumentdefaults);
        while(defaults.length < args.length) defaults.push('');
        let warp = procData.warp === 'true' || procData.warp === true;
        return ['procDef', this.c.varName(procData.proccode), args, defaults, warp];
    }
    procedures_call(b, bs) {
        let output = ['call', this.c.varName(b.mutation.proccode)];
        let ids = JSON.parse(b.mutation.argumentids);
        for(let i of ids) output.push(this.c.inputVal(i, b, bs));
        return output;
    }
    argument_reporter_string_number(b, bs) { return ['getParam', this.c.fieldVal('VALUE', b), 'r']; }
    argument_reporter_boolean(b, bs) { return ['getParam', this.c.fieldVal('VALUE', b), 'b']; }
    // Pen
    pen_clear(b, bs) { return ['clearPenTrails']; }
    pen_stamp(b, bs) { return ['stampCostume']; }
    pen_penDown(b, bs) { 
        if(this.c.compat) { this.c.penUpDown = true; return ['call', 'pen down']; }
        return ['putPenDown']; 
    }
    pen_penUp(b, bs) { 
        if(this.c.compat) { this.c.penUpDown = true; return ['call', 'pen up']; }
        return ['putPenUp']; 
    }
    pen_setPenColorToColor(b, bs) {
        let val = this.c.inputVal('COLOR', b, bs);
        if(this.c.compat) { this.c.penColor = true; return ['call', 'set pen color to %c', val]; }
        return ['penColor:', val];
    }
    pen_changePenSizeBy(b, bs) { return ['changePenSizeBy:', this.c.inputVal('SIZE', b, bs)]; }
    pen_setPenSizeTo(b, bs) { return ['penSize:', this.c.inputVal('SIZE', b, bs)]; }
}

class ProjectConverter {
    constructor() {
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
    }

    varName(name) {
        if (typeof name === 'string') return (this.compat ? '\u00A0' : '') + name;
        if (this.compat) return ['concatenate:with:', '\u00A0', name];
        return name;
    }

    compatVarName(name) { return (this.targetIsStage ? 'Stage: ' : '') + name; }

    specialNum(num) {
        if (num === '-Infinity') return -Infinity;
        if (num === 'Infinity') return Infinity;
        if (num === 'NaN') return NaN;
        return num;
    }

    hexToDec(hex) {
        if(typeof hex === 'string' && hex.startsWith('#')) return parseInt(hex.substring(1), 16);
        return hex;
    }

    inputVal(valName, block, blocks) {
        if (!block.inputs[valName]) return false;
        let input = block.inputs[valName];
        if (input[1] === null) return null;
        if (input[0] === 1) { 
            if (typeof input[1] === 'string') return this.convertBlock(blocks[input[1]], blocks);
            return input[1][1]; 
        }
        let out = input[1];
        if (Array.isArray(out)) {
            let type = out[0];
            let val = out[1];
            if (type === 12) return ['readVariable', this.varName(val)];
            if (type === 13) return ['contentsOfList:', this.varName(val)];
            if ([4, 5, 6, 7, 8].includes(type)) {
                let n = parseFloat(val);
                if (!isNaN(n)) val = n;
            } else if (type === 9) { val = this.hexToDec(val); }
            return this.specialNum(val);
        } else {
            try { return this.convertBlock(blocks[out], blocks); } catch(e) { return false; }
        }
    }

    fieldVal(fieldName, block) {
        if (!block.fields[fieldName]) return null;
        let out = block.fields[fieldName][0];
        if (['VARIABLE', 'LIST'].includes(fieldName)) out = this.varName(out);
        return out;
    }

    substackVal(stackName, block, blocks) {
        if (!block.inputs[stackName]) return null;
        let stack = block.inputs[stackName];
        if (stack.length < 2 || stack[1] === null) return [];
        return this.convertSubstack(stack[1], blocks);
    }

    convertBlock(block, blocks) {
        let opcode = block.opcode;
        if (block.shadow && !block.topLevel) {
            let keys = Object.keys(block.fields);
            if (keys.length > 0) return this.fieldVal(keys[0], block);
        }
        try {
            let res = this.argMapper.mapArgs(opcode, block, blocks);
            if (res) return res;
            return [opcode];
        } catch(e) { return null; }
    }

    convertSubstack(startBlockId, blocks) {
        this.compatStackReporters.push([]);
        let script = [];
        let currId = startBlockId;
        while (currId) {
            this.compatStackReporters[this.compatStackReporters.length-1] = [];
            let block = blocks[currId];
            if(!block) break;
            let output = this.convertBlock(block, blocks);
            let sReporters = this.compatStackReporters[this.compatStackReporters.length-1];
            if (sReporters.length > 0) {
                script.push(['deleteLine:ofList:', 'all', this.compatVarName('results')]);
                script.push(...sReporters);
                if (output && output[0] === 'doUntil') {
                     if(!Array.isArray(output[2])) output[2] = [];
                     output[2].push(['deleteLine:ofList:', 'all', this.compatVarName('results')]);
                     output[2].push(...sReporters);
                }
            }
            if(output) script.push(output);
            currId = block.next;
        }
        this.compatStackReporters.pop();
        return script;
    }

    async addCostume(c, zipOut) {
        if (!this.costumeAssets[c.assetId]) {
            let ext = c.dataFormat;
            let url = `${ASSET_HOST}/${c.md5ext}/get/`;
            
            let finalData;
            try {
                const resp = await fetch(url);
                if(!resp.ok) throw new Error("Fetch failed");
                const data = await resp.arrayBuffer();
                finalData = new Uint8Array(data);

                if (ext === 'svg') {
                    let str = new TextDecoder().decode(finalData);
                    str = str.replace(/fill="undefined"/g, '');
                    finalData = new TextEncoder().encode(str);
                }
            } catch(e) {
                console.warn(`Failed to download costume ${c.name}, using placeholder.`);
                finalData = new TextEncoder().encode("<svg></svg>");
            }

            let index = Object.keys(this.costumeAssets).length;
            zipOut.file(`${index}.${ext}`, finalData);
            this.costumeAssets[c.assetId] = [index, c.name, `${index}.${ext}`];
        }
        let assetData = this.costumeAssets[c.assetId];
        this.costumes.push({
            costumeName: c.name,
            baseLayerID: assetData[0],
            baseLayerMD5: assetData[2],
            rotationCenterX: c.rotationCenterX,
            rotationCenterY: c.rotationCenterY,
            bitmapResolution: c.bitmapResolution || 1
        });
    }

    async addSound(s, zipOut) {
        if (!this.soundAssets[s.assetId]) {
            let ext = s.dataFormat;
            let url = `${ASSET_HOST}/${s.md5ext}/get/`;
            
            let data;
            try {
                const resp = await fetch(url);
                if(!resp.ok) throw new Error("Fetch failed");
                data = await resp.arrayBuffer();
            } catch(e) {
                console.warn(`Failed to download sound ${s.name}`);
                data = new Uint8Array(0);
            }

            let index = Object.keys(this.soundAssets).length;
            let outName = `${index}.${ext === 'mp3' ? 'wav' : ext}`; 

            zipOut.file(outName, data);
            
            let rate = s.rate || 22050;
            let sampleCount = s.sampleCount || 0;
            this.soundAssets[s.assetId] = [index, s.name, sampleCount, rate, outName];
        }
        let assetData = this.soundAssets[s.assetId];
        this.sounds.push({
            soundName: s.name,
            soundID: assetData[0],
            md5: assetData[4],
            sampleCount: assetData[2],
            rate: assetData[3],
            format: ''
        });
    }

    async convertTarget(target, zipOut, progressCallback) {
        this.sounds = [];
        this.costumes = [];
        this.targetIsStage = target.isStage;
        this.targetName = target.name;

        for (let s of target.sounds) {
            await this.addSound(s, zipOut);
            if(progressCallback) progressCallback();
        }
        for (let c of target.costumes) {
            await this.addCostume(c, zipOut);
            if(progressCallback) progressCallback();
        }

        let variables = [];
        for (let k in target.variables) {
            let v = target.variables[k];
            variables.push({
                name: this.varName(v[0]),
                value: this.specialNum(v[1]),
                isPersistent: v.length >= 3 && v[2]
            });
        }

        let lists = [];
        for (let k in target.lists) {
            let l = target.lists[k];
            lists.push({
                listName: this.varName(l[0]),
                contents: l[1].map(x => this.specialNum(x)),
                isPersistent: false,
                x: 0, y: 0, width: 100, height: 200, visible: false 
            });
        }

        let scripts = [];
        let blocks = target.blocks;
        for (let k in blocks) {
            let b = blocks[k];
            if (b.topLevel) {
                let x = Math.round(b.x / 1.5) || 0;
                let y = Math.round(b.y / 1.8) || 0;
                this.compatStackReporters = [];
                let stack = this.convertSubstack(k, blocks);
                if (stack && stack.length > 0) scripts.push([x, y, stack]);
            }
        }

        if (this.compat) {
            if(this.penUpDown) {
                let pen = this.compatVarName('pen');
                variables.push({name: pen, value: 'up', isPersistent: false});
                scripts.push([0, 0, [['procDef', 'pen down', [], [], true], ['putPenDown'], ['setVar:to:', pen, 'down']]]);
                scripts.push([0, 0, [['procDef', 'pen up', [], [], true], ['putPenUp'], ['setVar:to:', pen, 'up']]]);
            }
        }

        let obj = {
            objName: target.isStage ? 'Stage' : target.name,
            scripts: scripts,
            variables: variables,
            lists: lists,
            sounds: this.sounds,
            costumes: this.costumes,
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
    }
}
