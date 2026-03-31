var maxWidth = 0;
var jszip = null;
var id = null;
var sourceZip = null;

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

async function startDownload(projectId) {
    if (document.getElementById("log")) {
        $("#progress").removeClass("error success");
        $("#progress").css("opacity", 1);
        $("#scratchloader").css("opacity", 1);
        document.getElementById("loadholder").classList.remove("pulse");
    }

    logMessage("Starting download for " + projectId);
    setProgress(5);

    try {
        let projectData = null;

        const isDirectSource = projectId && (typeof projectId === 'string' || projectId instanceof String) && (projectId.startsWith('http') || projectId.startsWith('data:'));

        if (isDirectSource) {
            logMessage('Downloading project...');
            setProgress(10);

            window.DownloadedTitle = projectId.split('/').pop().split('.').slice(0, -1).join('.') || 'project';

            const resp = await fetch(projectId);
            if (!resp.ok) throw new Error('Failed to download project from URL.');
            var blob = await resp.blob();

            let parsed = false;
            try {
                const arrayBufferToBinaryString = (ab) => {
                    const bytes = new Uint8Array(ab);
                    const CHUNK = 0x8000;
                    let str = '';
                    for (let i = 0; i < bytes.length; i += CHUNK) {
                        str += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
                    }
                    return str;
                };

                const getProjectTextFromZip = async (zipInstance) => {
                    if (zipInstance && typeof zipInstance.file === 'function') {
                        let entry = zipInstance.file('project.json');
                        if (!entry) {
                            if (zipInstance.files) {
                                for (const name in zipInstance.files) {
                                    if (name.toLowerCase().endsWith('project.json')) { entry = zipInstance.file(name); break; }
                                }
                            }
                        }
                        if (entry) {
                            if (typeof entry.async === 'function') return await entry.async('string');
                            if (typeof entry.asText === 'function') return entry.asText();
                            if (entry._data) {
                                if (entry._data instanceof Uint8Array) return new TextDecoder().decode(entry._data);
                                if (typeof entry._data === 'string') return entry._data;
                            }
                        }
                    }

                    if (zipInstance && zipInstance.files) {
                        for (const name in zipInstance.files) {
                            if (name.toLowerCase().endsWith('project.json')) {
                                const f = zipInstance.files[name];
                                if (!f) continue;
                                if (typeof f.async === 'function') return await f.async('string');
                                if (typeof f.asText === 'function') return f.asText();
                                if (f._data) {
                                    if (f._data instanceof Uint8Array) return new TextDecoder().decode(f._data);
                                    if (typeof f._data === 'string') return f._data;
                                }
                            }
                        }
                    }
                    return null;
                };

                let zip = null;
                try {
                    if (JSZip && typeof JSZip.loadAsync === 'function') {
                        zip = await JSZip.loadAsync(blob);
                    } else {
                        const z = new JSZip();
                        const ab = await blob.arrayBuffer();
                        if (typeof z.loadAsync === 'function') {
                            zip = await z.loadAsync(ab);
                        } else if (typeof z.load === 'function') {
                            const bin = arrayBufferToBinaryString(ab);
                            z.load(bin);
                            zip = z;
                        } else if (typeof JSZip.load === 'function') {
                            const bin = arrayBufferToBinaryString(ab);
                            zip = JSZip.load(bin);
                        } else {
                            throw new Error('Unsupported JSZip API');
                        }
                    }
                } catch (e) {
                    throw e;
                }

                sourceZip = zip;

                const projText = await getProjectTextFromZip(zip);
                if (projText) {
                    projectData = JSON.parse(projText);
                    parsed = true;
                }
            } catch (err) {
                console.error(err);
                perror(err);
            }

            if (!parsed) {
                const text = await blob.text();
                try {
                    projectData = JSON.parse(text);
                    parsed = true;
                } catch (e) {
                    throw new Error('Downloaded file is not a valid project JSON or SB archive.');
                }
            }

            if (isDirectSource) {
                const isSB3 = projectData && projectData.targets && Array.isArray(projectData.targets);
                if (!isSB3) {
                    const blobToBase64 = (b) => new Promise((res, rej) => {
                        const reader = new FileReader();
                        reader.onerror = () => rej(new Error('Failed to read blob as base64'));
                        reader.onload = () => {
                            const dataUrl = reader.result.split(',')[1];
                            res(dataUrl);
                        };
                        reader.readAsDataURL(b);
                    });
                    const base64 = await blobToBase64(blob);
                    if (window.gotZipBase64) {
                        window.gotZipBase64(base64);
                        psuccess();
                        return;
                    } else {
                        throw new Error('window.gotZipBase64 not found.');
                    }
                }
            }

        } else {
            logMessage('Fetching project token...');
            const metaResponse = await fetch(`https://trampoline.turbowarp.org/api/projects/${projectId}`);
            if (!metaResponse.ok) {
                if (metaResponse.status === 404) throw new Error('Project not found.');
                throw new Error('Failed to fetch project token.');
            }
            const metaData = await metaResponse.json();
            const token = metaData.project_token;
            window.DownloadedTitle = metaData.title;

            logMessage('Downloading project JSON...');
            const projectResponse = await fetch(`https://projects.scratch.mit.edu/${projectId}?token=${token}`);
            if (!projectResponse.ok) throw new Error('Failed to download project.');

            const raw = await projectResponse.text();

            let projectData;
            try {
                projectData = JSON.parse(raw);
            } catch {
                projectData = raw;
            }
        }

        function isJSON(str) {
            try {
                JSON.parse(str);
                return true;
            } catch (e) {
                return false;
            }
        }

        const isSB1 = !isJSON(projectData);
        var isSB3 = projectData && !isSB1;
        if (isSB3) isSB3 = projectData.targets && Array.isArray(projectData.targets);

        jszip = new JSZip();
        jszip.comment = "Converted sb3 to sb2 by pooiod7's converter (scratchflash.pages.dev/convert)";

        if (isSB3) {
            logMessage('Starting conversion...');
            await processSB3(projectData);
        } else if (isSB1) {
            logMessage('Downloading project...');
            await processLegacy(projectData);
        } else {
            logMessage('Downloading project...');
            await processNormal(projectData);
        }

    } catch (err) {
        console.error(err);
        perror(err);
    }
}

// Based on https://github.com/RexScratch/sb3tosb2
async function processSB3(projectData) {
    const converter = new ProjectConverter();

    // CONVERTION SETTINGS
    converter.compat = true;
    converter.unlimJoin = false;
    converter.limList = false;
    converter.penFill = false;

    let totalAssets = 0;
    let completedAssets = 0;
    projectData.targets.forEach(t => {
        totalAssets += t.costumes.length + t.sounds.length;
    });

    converter.monitors = projectData.monitors || [];
    converter.monitors = projectData.monitors || []; 

    logMessage(`Converting ${totalAssets} assets...`);

    const targets = projectData.targets;
    let stage = null;
    let sprites = [];

    for (const target of targets) {
        logMessage(`Processing: ${target.name}`);

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
    }

    sprites.sort((a, b) => a.layerOrder - b.layerOrder);
    sprites.forEach(s => delete s.layerOrder);

    if (!stage) throw new Error("No Stage found in JSON.");
    stage.children = sprites;

    stage.info = stage.info || {};
    stage.info.flashVersion = "MAC 32,0,0,0";
    stage.info.swfVersion = "v461";
    stage.info.convertedwith = "Pooiod7's SB3 to SB2 converter in JS";
    stage.info.spriteCount = sprites.length;
    stage.info.scriptCount = sprites.reduce((acc, s) => acc + s.scripts.length, 0) + stage.scripts.length;

    if (projectData.monitors) {
        projectData.monitors.forEach(m => {
            if (m.opcode === 'data_variable') {
                const isStage = m.spriteName === null;
                const targetName = m.spriteName || "Stage";
                const vName = converter.varName(m.params.VARIABLE);

                let mode = 1;
                if (m.mode === 'large') mode = 2;
                if (m.mode === 'slider') mode = 3;

                stage.children.push({
                    target: targetName,
                    cmd: "getVar:",
                    param: vName,
                    color: 15629590,
                    label: isStage ? vName : `${targetName}: ${vName}`,
                    mode: mode,
                    sliderMin: m.sliderMin || 0,
                    sliderMax: m.sliderMax || 100,
                    isDiscrete: m.isDiscrete || false,
                    x: m.x || 0,
                    y: m.y || 0,
                    visible: !!m.visible
                });
            }
        });
    }

    // if (converter.timerCompat) {
    //     const gfResetTimer = [0, 0, [['whenGreenFlag'], ['doIf', ['>', ['-', ['*', 86400, ['-', ['timestamp'], ['readVariable', 'reset time']]], ['timer']], '0.1'], [['setVar:to:', 'reset time', ['-', ['timestamp'], ['/', ['timer'], 86400]]]]]]];
    //     stage.scripts.push(gfResetTimer);
    //     sprites.forEach(s => s.scripts.push(gfResetTimer));
    // }

    jszip.file("project.json", JSON.stringify(stage));

    finalizeZip();
}

function finalizeZip() {
    logMessage("Preparing sb2...");
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
    logMessage("Opening project...");
    setProgress(100);
    if (window.gotZipBase64) {
        window.gotZipBase64(content);
        psuccess();
    } else {
        logMessage("Error: window.gotZipBase64 not found.");
    }
}

async function processNormal(projectData) {
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

    logMessage(`Downloading ${total} assets...`);

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

function processLegacy(data) {
    finish(data);
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
    looks_costumenumbername(b, bs) {
        const numName = this.c.fieldVal('NUMBER_NAME', b);
        if (numName === 'number') return ['costumeIndex'];
        if (this.c.compat && !this.c.targetIsStage) {
            return ['getLine:ofList:', ['costumeIndex'], this.c.varName('SpriteCostumes')];
        }
        return ['costumeName'];
    }
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
        // if(this.c.compat) { this.c.timerCompat = true; return ['*', 86400, ['-', ['timestamp'], ['readVariable', 'reset time']]]; }
        return ['timer']; 
    }
    sensing_resettimer(b, bs) {
        // if(this.c.compat) { this.c.resetTimer = true; this.c.timerCompat = true; return ['call', 'reset timer']; }
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
        if(this.c.compat) { this.c.penColor = true; return ['call', 'set pen color %s', val]; }
        return ['penColor:', val];
    }
    pen_menu_colorParam(b, bs) { return this.c.fieldVal('colorParam', b); }
    pen_setPenColorParamTo(b, bs) {
        if(this.c.compat) { this.c.penColor = true; return ['call', 'set pen %s to %n', this.c.inputVal('COLOR_PARAM', b, bs), this.c.inputVal('VALUE', b, bs)]; }
        return null;
    }
    pen_changePenColorParamBy(b, bs) {
        if(this.c.compat) { this.c.penColor = true; return['call', 'change pen %s by %n', this.c.inputVal('COLOR_PARAM', b, bs), this.c.inputVal('VALUE', b, bs)]; }
        return null;
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
        this._fontCache = {}; // name -> { base64, format }
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

    async _readZipEntry(entry) {
        if (!entry) return null;
        if (typeof entry.async === 'function') {
            try {
                let out = await entry.async('uint8array');
                if (out instanceof Uint8Array) return out;
                if (out instanceof ArrayBuffer) return new Uint8Array(out);
                if (typeof out === 'string') return new TextEncoder().encode(out);
            } catch (e) {
                try {
                    let out2 = await entry.async('arraybuffer');
                    if (out2 instanceof ArrayBuffer) return new Uint8Array(out2);
                } catch (e2) {}
                try {
                    let s = await entry.async('string');
                    if (typeof s === 'string') return new TextEncoder().encode(s);
                } catch (e3) {}
            }
        }
        if (typeof entry.asArrayBuffer === 'function') {
            const ab = await entry.asArrayBuffer();
            return new Uint8Array(ab);
        }
        if (typeof entry.asText === 'function') {
            const s = await entry.asText();
            return new TextEncoder().encode(s);
        }
        if (entry._data) {
            if (entry._data instanceof Uint8Array) return entry._data;
            if (entry._data instanceof ArrayBuffer) return new Uint8Array(entry._data);
            if (typeof entry._data === 'string') return new TextEncoder().encode(entry._data);
        }
        if (entry instanceof Uint8Array) return entry;
        if (entry instanceof ArrayBuffer) return new Uint8Array(entry);
        if (typeof Blob !== 'undefined' && entry instanceof Blob) {
            const ab = await entry.arrayBuffer();
            return new Uint8Array(ab);
        }
        if (entry.data) {
            if (entry.data instanceof Uint8Array) return entry.data;
            if (entry.data instanceof ArrayBuffer) return new Uint8Array(entry.data);
        }
        return null;
    }

    async addCostume(c, zipOut) {
        if (!this.costumeAssets[c.assetId]) {
            let ext = c.dataFormat;
            let url = `${ASSET_HOST}/${c.md5ext}/get/`;

            let finalData;
            if (sourceZip) {
                let entry = null;
                if (typeof sourceZip.file === 'function') {
                    entry = sourceZip.file(c.md5ext) || sourceZip.file('assets/' + c.md5ext);
                }
                if (!entry && sourceZip.files) {
                    for (const name in sourceZip.files) {
                        if (!name) continue;
                        if (name === c.md5ext || name.endsWith('/' + c.md5ext) || name.endsWith(c.md5ext)) { entry = sourceZip.file(name); break; }
                    }
                }
                if (entry) {
                    try {
                        const arr = await this._readZipEntry(entry);
                        if (!arr) throw new Error('Zip entry read returned null');
                        finalData = arr;
                        if (ext === 'svg') {
                            let str = new TextDecoder().decode(finalData);
                            str = str.replace(/fill="undefined"/g, '');
                            finalData = new TextEncoder().encode(str);
                        }
                    } catch (e) {
                        console.warn(`Failed to read costume ${c.name} from SB3 zip, using placeholder.`, e);
                        finalData = new TextEncoder().encode(`<svg width="800" height="800" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M4 1C2.355 1 1 2.355 1 4v1h1V4c0-1.11.89-2 2-2h1V1zm2 0v1h4V1zm5 0v1h1c1.11 0 2 .89 2 2v1h1V4c0-1.645-1.355-3-3-3zM6 5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1M1 6v4h1V6zm13 0v4h1V6zM9.5 8l-2 2L6 9l-2 2v.5c0 .5.5.5.5.5h7s.473-.035.5-.5v-1zM1 11v1c0 1.645 1.355 3 3 3h1v-1H4c-1.11 0-2-.89-2-2v-1zm13 0v1c0 1.11-.89 2-2 2h-1v1h1c1.645 0 3-1.355 3-3v-1zm-8 3v1h4v-1zm0 0" fill="#2e3434" fill-opacity=".349"/></svg>`);
                    }
                } else {
                    console.warn(`Costume ${c.name} not found in SB3 zip, using placeholder.`);
                    finalData = new TextEncoder().encode(`<svg width="800" height="800" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M4 1C2.355 1 1 2.355 1 4v1h1V4c0-1.11.89-2 2-2h1V1zm2 0v1h4V1zm5 0v1h1c1.11 0 2 .89 2 2v1h1V4c0-1.645-1.355-3-3-3zM6 5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1M1 6v4h1V6zm13 0v4h1V6zM9.5 8l-2 2L6 9l-2 2v.5c0 .5.5.5.5.5h7s.473-.035.5-.5v-1zM1 11v1c0 1.645 1.355 3 3 3h1v-1H4c-1.11 0-2-.89-2-2v-1zm13 0v1c0 1.11-.89 2-2 2h-1v1h1c1.645 0 3-1.355 3-3v-1zm-8 3v1h4v-1zm0 0" fill="#2e3434" fill-opacity=".349"/></svg>`);
                }
            } else {
                let finalDataLocal;
                try {
                    const resp = await fetch(url);
                    if(!resp.ok) throw new Error("Fetch failed");
                    const data = await resp.arrayBuffer();
                    finalDataLocal = new Uint8Array(data);
                    if (ext === 'svg') {
                        let str = new TextDecoder().decode(finalDataLocal);
                        str = str.replace(/fill="undefined"/g, '');
                        finalDataLocal = new TextEncoder().encode(str);
                    }
                } catch(e) {
                    console.warn(`Failed to download costume ${c.name}, using placeholder.`);
                    finalDataLocal = new TextEncoder().encode(`<svg width="800" height="800" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M4 1C2.355 1 1 2.355 1 4v1h1V4c0-1.11.89-2 2-2h1V1zm2 0v1h4V1zm5 0v1h1c1.11 0 2 .89 2 2v1h1V4c0-1.645-1.355-3-3-3zM6 5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1M1 6v4h1V6zm13 0v4h1V6zM9.5 8l-2 2L6 9l-2 2v.5c0 .5.5.5.5.5h7s.473-.035.5-.5v-1zM1 11v1c0 1.645 1.355 3 3 3h1v-1H4c-1.11 0-2-.89-2-2v-1zm13 0v1c0 1.11-.89 2-2 2h-1v1h1c1.645 0 3-1.355 3-3v-1zm-8 3v1h4v-1zm0 0" fill="#2e3434" fill-opacity=".349"/></svg>`);
                }
                finalData = finalDataLocal;
            }

            let index = Object.keys(this.costumeAssets).length;
            if (ext === 'svg') {
                const svgText = new TextDecoder().decode(finalData);
                zipOut.file(`${index}.svg`, svgText);
                try {
                    const pngBuffer = await this._rasterizeSvgToPng(svgText, c.bitmapResolution || 1);
                    zipOut.file(`${index}.svg`, pngBuffer);
                    this.costumeAssets[c.assetId] = [index, c.name, `${index}.svg`];
                } catch (e) {
                    console.warn(`SVG rasterize failed for ${c.name}, falling back to SVG:`, e);
                    zipOut.file(`${index}.svg`, svgText);
                    this.costumeAssets[c.assetId] = [index, c.name, `${index}.svg`];
                }
            } else {
                zipOut.file(`${index}.${ext}`, finalData);
                this.costumeAssets[c.assetId] = [index, c.name, `${index}.${ext}`];
            }
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

    async _rasterizeSvgToPng(svgText, scale) {
        const fontMap = {
            'Sans Serif': 'Noto Sans',
            'Serif': 'Source Serif Pro',
            'Marker': 'Knewave',
            'Handwriting': 'Handlee',
            'Curly': 'Griffy',
            'Pixel': 'Grand9K Pixel'
        };

        for (const [scratchFont, targetFont] of Object.entries(fontMap)) {
            const escaped = scratchFont.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
            svgText = svgText.replace(new RegExp(`font-family="${escaped}"`, 'g'), `font-family="${targetFont}"`);
            svgText = svgText.replace(new RegExp(`font-family='${escaped}'`, 'g'), `font-family='${targetFont}'`);
            svgText = svgText.replace(new RegExp(`font-family:\\s*${escaped}`, 'g'), `font-family: ${targetFont}`);
        }

        try {
            svgText = await this._embedFontsInSvg(svgText);
        } catch (e) {
            console.warn('Embedding fonts into SVG failed', e);
        }

        function parseSvgSize(svg) {
            const wMatch = svg.match(/\bwidth\s*=\s*"([0-9.]+)(px)?"/i);
            const hMatch = svg.match(/\bheight\s*=\s*"([0-9.]+)(px)?"/i);
            const vbMatch = svg.match(/viewBox\s*=\s*"([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)"/i);
            
            let width = 480;
            let height = 360;

            if (wMatch && hMatch) {
                width = parseFloat(wMatch[1]);
                height = parseFloat(hMatch[1]);
            } else if (vbMatch) {
                width = parseFloat(vbMatch[3]);
                height = parseFloat(vbMatch[4]);
            }

            return { width, height };
        }

        const size = parseSvgSize(svgText);
        const outW = Math.max(1, Math.round(size.width * scale));
        const outH = Math.max(1, Math.round(size.height * scale));

        if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        }

        const getPngDataUrl = async (originalSvg) => {
            const svgBlob = new Blob([originalSvg], {type: 'image/svg+xml;charset=utf-8'});
            const url = URL.createObjectURL(svgBlob);
            const img = new Image();
            img.crossOrigin = 'Anonymous';

            await new Promise((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = (e) => {
                    console.error(e);
                    reject(new Error('SVG load failed'));
                };
                img.src = url;
            });

            const canvas = document.createElement('canvas');
            canvas.width = outW;
            canvas.height = outH;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            try {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            } catch (e) {
                URL.revokeObjectURL(url);
                throw e;
            }
            URL.revokeObjectURL(url);

            return canvas.toDataURL('image/png');
        };

        const pngDataUrl = await getPngDataUrl(svgText);

        const finalSvgWrapper = `
            <svg 
                version="1.1" 
                xmlns="http://www.w3.org/2000/svg" 
                xmlns:xlink="http://www.w3.org/1999/xlink" 
                width="${size.width}" 
                height="${size.height}" 
                viewBox="0 0 ${size.width} ${size.height}">
                <image 
                    width="${size.width}" 
                    height="${size.height}" 
                    xlink:href="${pngDataUrl}" 
                />
            </svg>`.trim();

        return finalSvgWrapper;
    }

    async _fetchFontAsBase64(name, url) {
        if (this._fontCache[name]) return this._fontCache[name];
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('Font fetch failed');
            const ab = await resp.arrayBuffer();
            const extMatch = url.match(/\.([a-zA-Z0-9]+)($|[?#])/);
            const ext = extMatch ? extMatch[1].toLowerCase() : 'ttf';
            const mime = ext === 'otf' ? 'font/otf' : (ext === 'ttf' ? 'font/ttf' : 'application/octet-stream');
            let binary = '';
            const bytes = new Uint8Array(ab);
            const chunkSize = 0x8000;
            for (let i = 0; i < bytes.length; i += chunkSize) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
            }
            const b64 = btoa(binary);
            const fmt = ext === 'otf' ? 'opentype' : (ext === 'ttf' ? 'truetype' : 'woff');
            const out = { base64: b64, mime, format: fmt };
            this._fontCache[name] = out;
            return out;
        } catch (e) {
            console.warn('Font load failed for', name, url, e);
            this._fontCache[name] = null;
            return null;
        }
    }

    async _embedFontsInSvg(svgText) {
        const used = new Set();
        const re = /font-family\s*[:=]\s*['\"]?([^'";,)<>]+)['\"]?/gi;
        let m;
        while ((m = re.exec(svgText)) !== null) {
            const name = m[1].trim();
            if (this._fontFiles[name]) used.add(name);
        }
        if (used.size === 0) return svgText;

        const rules = [];
        for (const name of used) {
            const url = this._fontFiles[name];
            if (!url) continue;
            const f = await this._fetchFontAsBase64(name, url);
            if (!f) continue;
            rules.push(`@font-face { font-family: '${name}'; src: url('data:${f.mime};base64,${f.base64}') format('${f.format}'); font-weight: normal; font-style: normal; }`);
        }
        if (rules.length === 0) return svgText;

        const style = `<style type="text/css"><![CDATA[\n${rules.join('\n')}\n]]></style>`;
        const svgTagStart = svgText.search(/<svg[\s>]/i);
        if (svgTagStart === -1) return style + svgText;
        const tagEnd = svgText.indexOf('>', svgTagStart);
        if (tagEnd === -1) return style + svgText;
        return svgText.slice(0, tagEnd + 1) + style + svgText.slice(tagEnd + 1);
    }

    async addSound(s, zipOut) {
        if (!this.soundAssets[s.assetId]) {
            let ext = s.dataFormat;
            let url = `${ASSET_HOST}/${s.md5ext}/get/`;
            let data;
            let rate = s.rate;
            let sampleCount = s.sampleCount;

            if (sourceZip) {
                let entry = null;
                if (typeof sourceZip.file === 'function') entry = sourceZip.file(s.md5ext) || sourceZip.file('assets/' + s.md5ext);
                if (!entry && sourceZip.files) {
                    for (const name in sourceZip.files) {
                        if (!name) continue;
                        if (name === s.md5ext || name.endsWith('/' + s.md5ext) || name.endsWith(s.md5ext)) { entry = sourceZip.file(name); break; }
                    }
                }
                if (entry) {
                    try {
                        const arr = await this._readZipEntry(entry);
                        if (!arr) throw new Error('Zip entry read returned null');
                        const ab = arr instanceof Uint8Array ? arr.buffer : arr;
                        data = ab;

                        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                        let audioBuffer = await audioCtx.decodeAudioData(ab.slice(0));
                        rate = audioBuffer.sampleRate;
                        sampleCount = audioBuffer.length;

                        if (rate > 48000) {
                            const offlineCtx = new OfflineAudioContext(audioBuffer.numberOfChannels, audioBuffer.duration * 48000, 48000);
                            const source = offlineCtx.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(offlineCtx.destination);
                            source.start();
                            audioBuffer = await offlineCtx.startRendering();
                            rate = 48000;
                            sampleCount = audioBuffer.length;
                        }

                        if (ext === 'mp3') {
                            data = this.bufferToWav(audioBuffer);
                            ext = 'wav';
                        }
                    } catch (e) {
                        console.warn('Failed to decode sound from SB3 zip', e);
                        data = new Uint8Array(0);
                        rate = rate || 22050;
                        sampleCount = sampleCount || 0;
                    }
                } else {
                    console.warn(`Sound ${s.name} not found in SB3 zip, using empty placeholder.`);
                    data = new Uint8Array(0);
                    rate = rate || 22050;
                    sampleCount = sampleCount || 0;
                }
            } else {
                try {
                    const resp = await fetch(url);
                    if (!resp.ok) throw new Error();
                    data = await resp.arrayBuffer();

                    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    let audioBuffer = await audioCtx.decodeAudioData(data.slice(0));

                    rate = audioBuffer.sampleRate;
                    sampleCount = audioBuffer.length;

                    if (rate > 48000) {
                        const offlineCtx = new OfflineAudioContext(audioBuffer.numberOfChannels, audioBuffer.duration * 48000, 48000);
                        const source = offlineCtx.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(offlineCtx.destination);
                        source.start();
                        audioBuffer = await offlineCtx.startRendering();
                        rate = 48000;
                        sampleCount = audioBuffer.length;
                    }

                    if (ext === 'mp3') {
                        data = this.bufferToWav(audioBuffer);
                        ext = 'wav';
                    }
                } catch (e) {
                    console.warn(e);
                    data = new Uint8Array(0);
                    rate = rate || 22050;
                    sampleCount = sampleCount || 0;
                }
            }

            if (rate > 48000) rate = 48000;

            let index = Object.keys(this.soundAssets).length;
            let outName = `${index}.${ext}`;

            zipOut.file(outName, data);

            this.soundAssets[s.assetId] = [index, s.name, sampleCount, rate, outName];
        }
        let assetData = this.soundAssets[s.assetId];
        this.sounds.push({
            soundName: assetData[1],
            soundID: assetData[0],
            md5: assetData[4],
            sampleCount: assetData[2],
            rate: assetData[3],
            format: ''
        });
    }

    bufferToWav(buffer) {
        let numOfChan = buffer.numberOfChannels,
            length = buffer.length * numOfChan * 2 + 44,
            bufferArr = new ArrayBuffer(length),
            view = new DataView(bufferArr),
            channels = [], i, sample,
            offset = 0,
            pos = 0;

        const setUint16 = (d) => { view.setUint16(pos, d, true); pos += 2; };
        const setUint32 = (d) => { view.setUint32(pos, d, true); pos += 4; };

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

        let lists =[];
        for (let k in target.lists) {
            let l = target.lists[k];
            
            let monitor = this.monitors.find(m => m.id === k);
            
            lists.push({
                listName: this.varName(l[0]),
                contents: l[1].map(x => this.specialNum(x)),
                isPersistent: false,
                x: monitor ? monitor.x : 0, 
                y: monitor ? monitor.y : 0, 
                width: monitor ? monitor.width : 100, 
                height: monitor ? monitor.height : 200, 
                visible: monitor ? monitor.visible : false 
            });
        }

        if (this.compat && !target.isStage) {
            const spriteCostumeNames = (target.costumes || []).map(c => c.name || '');
            const spriteListName = this.varName('SpriteCostumes');
            const alreadyHas = lists.some(l => l.listName === spriteListName);
            if (!alreadyHas) {
                lists.push({
                    listName: spriteListName,
                    contents: spriteCostumeNames.map(x => this.specialNum(x)),
                    isPersistent: false,
                    x: 0, y: 0, width: 100, height: 200, visible: false
                });
            }
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
                let pen = 'tmp:203:pen';
                variables.push({name: pen, value: 'up', isPersistent: false});
                scripts.push([0, 0, [['procDef', 'pen down', [], [], true],['putPenDown'],['setVar:to:', pen, 'down']]]);
                scripts.push([0, 0, [['procDef', 'pen up', [],[], true], ['putPenUp'],['setVar:to:', pen, 'up']]]);
            }

            if (this.penColor) {
                lists.push({
                    listName: 'tmp:colorlist',
                    contents: ['0xFF000000', 0, 0, 0, 255, 0, 100, 100, 0, 0, 0, 0, 0, 0, 0, 0, '0123456789ABCDEF'],
                    isPersistent: false
                });

                const getHexChar = (val, isLow) => ['letter:of:', ['+', isLow ? ['%', val, 16] : ['computeFunction:of:', 'floor', ['/', val, 16]], 1], ['getLine:ofList:', 17, 'tmp:colorlist']];
                const getHexByte = (val) => ['concatenate:with:', getHexChar(val, false), getHexChar(val, true)];

                let finalHex = ['concatenate:with:', '0x', ['concatenate:with:', ['concatenate:with:', getHexByte(['getLine:ofList:', 5, 'tmp:colorlist']), getHexByte(['getLine:ofList:', 2, 'tmp:colorlist'])], ['concatenate:with:', getHexByte(['getLine:ofList:', 3, 'tmp:colorlist']), getHexByte(['getLine:ofList:', 4, 'tmp:colorlist'])]]];

                scripts.push([0, 0, [['procDef', 'set pen color %s', ['color'], [''], false],['doIfElse', ['=', ['letter:of:', 1,['getParam', 'color', 'r']], '#'], [
                        ['setLine:ofList:to:', 9, 'tmp:colorlist', ['concatenate:with:', '0x', 
                            ['concatenate:with:', ['letter:of:', 2,['getParam', 'color', 'r']],['concatenate:with:', ['letter:of:', 3,['getParam', 'color', 'r']], 
                            ['concatenate:with:', ['letter:of:', 4,['getParam', 'color', 'r']], ['concatenate:with:', ['letter:of:', 5,['getParam', 'color', 'r']], 
                            ['concatenate:with:',['letter:of:', 6,['getParam', 'color', 'r']], ['letter:of:', 7,['getParam', 'color', 'r']]]]]]]]]
                    ], [['setLine:ofList:to:', 9, 'tmp:colorlist', ['getParam', 'color', 'r']]]],
                    
                    ['doIf', ['<',['getLine:ofList:', 9, 'tmp:colorlist'], 0], [['setLine:ofList:to:', 9, 'tmp:colorlist', ['+',['getLine:ofList:', 9, 'tmp:colorlist'], 4294967296]]]],
                    ['setLine:ofList:to:', 4, 'tmp:colorlist', ['%',['getLine:ofList:', 9, 'tmp:colorlist'], 256]],
                    ['setLine:ofList:to:', 3, 'tmp:colorlist', ['%', ['computeFunction:of:', 'floor', ['/', ['getLine:ofList:', 9, 'tmp:colorlist'], 256]], 256]],
                    ['setLine:ofList:to:', 2, 'tmp:colorlist', ['%', ['computeFunction:of:', 'floor', ['/', ['getLine:ofList:', 9, 'tmp:colorlist'], 65536]], 256]],
                    ['setLine:ofList:to:', 5, 'tmp:colorlist', ['computeFunction:of:', 'floor', ['/', ['getLine:ofList:', 9, 'tmp:colorlist'], 16777216]]],
                    ['doIf', ['=', ['getLine:ofList:', 5, 'tmp:colorlist'], 0], [['setLine:ofList:to:', 5, 'tmp:colorlist', 255]]],
                    
                    ['setLine:ofList:to:', 10, 'tmp:colorlist', ['getLine:ofList:', 2, 'tmp:colorlist']],
                    ['doIf', ['<', ['getLine:ofList:', 3, 'tmp:colorlist'], ['getLine:ofList:', 10, 'tmp:colorlist']], [['setLine:ofList:to:', 10, 'tmp:colorlist', ['getLine:ofList:', 3, 'tmp:colorlist']]]],
                    ['doIf', ['<', ['getLine:ofList:', 4, 'tmp:colorlist'], ['getLine:ofList:', 10, 'tmp:colorlist']], [['setLine:ofList:to:', 10, 'tmp:colorlist', ['getLine:ofList:', 4, 'tmp:colorlist']]]],
                    ['setLine:ofList:to:', 11, 'tmp:colorlist', ['getLine:ofList:', 2, 'tmp:colorlist']],
                    ['doIf', ['>', ['getLine:ofList:', 3, 'tmp:colorlist'], ['getLine:ofList:', 11, 'tmp:colorlist']], [['setLine:ofList:to:', 11, 'tmp:colorlist', ['getLine:ofList:', 3, 'tmp:colorlist']]]],
                    ['doIf', ['>', ['getLine:ofList:', 4, 'tmp:colorlist'], ['getLine:ofList:', 11, 'tmp:colorlist']], [['setLine:ofList:to:', 11, 'tmp:colorlist', ['getLine:ofList:', 4, 'tmp:colorlist']]]],
                    ['setLine:ofList:to:', 12, 'tmp:colorlist', ['-', ['getLine:ofList:', 11, 'tmp:colorlist'], ['getLine:ofList:', 10, 'tmp:colorlist']]],
                    ['setLine:ofList:to:', 8, 'tmp:colorlist', ['/', ['getLine:ofList:', 11, 'tmp:colorlist'], 2.55]],
                    
                    ['doIfElse', ['=', ['getLine:ofList:', 11, 'tmp:colorlist'], 0], [['setLine:ofList:to:', 7, 'tmp:colorlist', 0]], [['setLine:ofList:to:', 7, 'tmp:colorlist', ['*',['/', ['getLine:ofList:', 12, 'tmp:colorlist'], ['getLine:ofList:', 11, 'tmp:colorlist']], 100]]]],
                    ['doIfElse', ['=', ['getLine:ofList:', 12, 'tmp:colorlist'], 0], [['setLine:ofList:to:', 6, 'tmp:colorlist', 0]],
                        ['doIfElse', ['=', ['getLine:ofList:', 11, 'tmp:colorlist'], ['getLine:ofList:', 2, 'tmp:colorlist']], [['setLine:ofList:to:', 6, 'tmp:colorlist', ['*', 16.6666, ['%', ['+', ['/', ['-', ['getLine:ofList:', 3, 'tmp:colorlist'], ['getLine:ofList:', 4, 'tmp:colorlist']], ['getLine:ofList:', 12, 'tmp:colorlist']], 6], 6]]]],
                        ['doIfElse', ['=', ['getLine:ofList:', 11, 'tmp:colorlist'], ['getLine:ofList:', 3, 'tmp:colorlist']], [['setLine:ofList:to:', 6, 'tmp:colorlist', ['*', 16.6666, ['+', ['/', ['-', ['getLine:ofList:', 4, 'tmp:colorlist'], ['getLine:ofList:', 2, 'tmp:colorlist']], ['getLine:ofList:', 12, 'tmp:colorlist']], 2]]]],
                        [['setLine:ofList:to:', 6, 'tmp:colorlist', ['*', 16.6666, ['+', ['/', ['-', ['getLine:ofList:', 2, 'tmp:colorlist'], ['getLine:ofList:', 3, 'tmp:colorlist']], ['getLine:ofList:', 12, 'tmp:colorlist']], 4]]]]]]],
                    ['setLine:ofList:to:', 1, 'tmp:colorlist', finalHex],
                    ['penColor:', ['getLine:ofList:', 1, 'tmp:colorlist']]
                ]]);
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
