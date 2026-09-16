(() => {
    const LOG_LEVELS = {
        task: 1,
        info: 2,
        heavy: 3,
        debug: 4
    };

    const PROJECT_ID_REPLACEMENTS = {
        "212388708": "1298706676",
        "1298757456": "https://pooiod7.pages.dev/s2/GeometryDash.sb2"
    };

    class ProjectDownloader {
        static bufferToBase64(buffer) {
            const bytes = new Uint8Array(buffer);
            let binary = '';
            const chunkSize = 0x8000;
            for (let i = 0; i < bytes.length; i += chunkSize) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
            }
            return btoa(binary);
        }

        static arrayBufferToBinaryString(ab) {
            const bytes = new Uint8Array(ab);
            const CHUNK = 0x8000;
            let str = '';
            for (let i = 0; i < bytes.length; i += CHUNK) {
                str += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
            }
            return str;
        }

        static async readZipEntry(entry) {
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

        static async getProjectTextFromZip(zipInstance) {
            if (!zipInstance) return null;
            let entry = null;
            if (typeof zipInstance.file === 'function') {
                entry = zipInstance.file('project.json');
                if (!entry && zipInstance.files) {
                    for (const name in zipInstance.files) {
                        if (name.toLowerCase().endsWith('project.json')) {
                            entry = zipInstance.file(name);
                            break;
                        }
                    }
                }
            }
            if (!entry && zipInstance.files) {
                for (const name in zipInstance.files) {
                    if (name.toLowerCase().endsWith('project.json')) {
                        entry = zipInstance.file(name);
                        break;
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
            return null;
        }

        static async downloadAsset(md5, filename, jszip) {
            if (!md5) return;
            const resp = await fetch("https://assets.scratch.mit.edu/internalapi/asset/" + md5 + "/get/");
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
        }

        static async downloadProject(projectId, progressCallback = () => {}) {
            projectId = PROJECT_ID_REPLACEMENTS[projectId] || projectId;

            let projectData = null;
            let sourceZip = null;
            let type = 'unknown';

            const isDirectSource = projectId && (typeof projectId === 'string' || projectId instanceof String) && (projectId.startsWith('http') || projectId.startsWith('data:'));

            let buffer;

            if (isDirectSource) {
                window.SB3ToSB2.log('task', 'Downloading project...');
                progressCallback(10);
                window.DownloadedTitle = projectId.split('/').pop().split('.').slice(0, -1).join('.') || 'project';
                const resp = await fetch(projectId);
                if (!resp.ok) throw new Error('Failed to download project from URL.');
                buffer = await resp.arrayBuffer();
            } else {
                window.SB3ToSB2.log('task', 'Fetching project token...');
                const metaResponse = await fetch(`https://trampoline.turbowarp.org/api/projects/${projectId}`);
                if (!metaResponse.ok) {
                    if (metaResponse.status === 404) throw new Error('Project not found.');
                    throw new Error('Failed to fetch project token.');
                }
                const metaData = await metaResponse.json();
                const token = metaData.project_token;
                window.DownloadedTitle = metaData.title;

                window.SB3ToSB2.log('task', 'Downloading project JSON...');
                const projectResponse = await fetch(`https://projects.scratch.mit.edu/${projectId}?token=${token}`);
                if (!projectResponse.ok) throw new Error('Failed to download project.');
                buffer = await projectResponse.arrayBuffer();
            }

            const bytes = new Uint8Array(buffer);
            const isZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B;

            if (isZip) {
                let zip = null;
                try {
                    if (window.JSZip && typeof window.JSZip.loadAsync === 'function') {
                        zip = await window.JSZip.loadAsync(buffer);
                    } else if (window.JSZip) {
                        const z = new window.JSZip();
                        if (typeof z.loadAsync === 'function') {
                            zip = await z.loadAsync(buffer);
                        } else if (typeof z.load === 'function') {
                            z.load(this.arrayBufferToBinaryString(buffer));
                            zip = z;
                        } else if (typeof window.JSZip.load === 'function') {
                            zip = window.JSZip.load(this.arrayBufferToBinaryString(buffer));
                        }
                    }
                } catch (err) {
                    window.SB3ToSB2.log('debug', 'Zip load error', err);
                }

                if (zip) {
                    sourceZip = zip;
                    const projText = await this.getProjectTextFromZip(zip);
                    if (projText) {
                        try {
                            projectData = JSON.parse(projText);
                        } catch (e) {
                            window.SB3ToSB2.log('debug', 'Inner project.json parse error', e);
                        }
                    }
                }

                const isSB3 = projectData && projectData.targets && Array.isArray(projectData.targets);
                if (isSB3) {
                    type = 'sb3';

                    setTimeout(()=>{ var projsource = SB3ToSB2.projectSource; if (SB3ToSB2.projectSource = projsource) SB3ToSB2.projectSource = "" }, 1000);

                    return { projectData, sourceZip, type };
                } else {
                    const base64 = this.bufferToBase64(buffer);

                    setTimeout(()=>{ var projsource = SB3ToSB2.projectSource; if (SB3ToSB2.projectSource = projsource) SB3ToSB2.projectSource = "" }, 1000);

                    return { projectData, sourceZip, type: 'base64', base64 };
                }
            }

            let text = '';
            try {
                text = new TextDecoder('utf-8').decode(buffer);
            } catch (e) {
                text = '';
            }

            let parsedJson = null;
            try {
                parsedJson = JSON.parse(text);
            } catch (e) {
                window.SB3ToSB2.log('debug', 'JSON parse failure :C', e);
            }

            if (parsedJson) {
                projectData = parsedJson;
                const isSB3 = projectData.targets && Array.isArray(projectData.targets);
                if (isSB3) {
                    type = 'sb3';
                } else {
                    type = 'normal';
                }

                setTimeout(()=>{ var projsource = SB3ToSB2.projectSource; if (SB3ToSB2.projectSource = projsource) SB3ToSB2.projectSource = "" }, 1000);

                return { projectData, sourceZip: null, type };
            }

            const base64 = this.bufferToBase64(buffer);

            setTimeout(()=>{ var projsource = SB3ToSB2.projectSource; if (SB3ToSB2.projectSource = projsource) SB3ToSB2.projectSource = "" }, 1000);

            return { projectData: null, sourceZip: null, type: 'legacy', base64 };
        }
    }

    class ProjectConverter {
        constructor() {
            this.vars = new VariableManager(this);
            this.listsMgr = new ListManager(this);
            this.soundsMgr = new SoundManager(this);
            this.costumesMgr = new CostumeManager(this);
            this.argMapper = new BlockMapper(this);
            this.compatStackReporters = [];

            this.monitors = [];
            this.compat = false;
            this.unlimJoin = false;
            this.limList = false;
            this.timerCompat = false;
            this.resetTimer = false;
            this.joinStr = false;
            this.addList = false;
            this.insertList = false;
            this.targetIsStage = false;
        }

        varName(name) { return this.vars.varName(name); }
        compatVarName(name) { return this.vars.compatVarName(name); }
        specialNum(num) { return this.vars.specialNum(num); }
        hexToDec(hex) { return this.vars.hexToDec(hex); }

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

        async convertTarget(target, zipOut, progressCallback) {
            this.soundsMgr.resetTarget();
            this.costumesMgr.resetTarget();
            this.targetIsStage = target.isStage;
            this.targetName = target.name;

            for (let s of target.sounds) {
                await this.soundsMgr.addSound(s, zipOut);
                if (progressCallback) progressCallback();
            }
            for (let c of target.costumes) {
                await this.costumesMgr.addCostume(c, zipOut);
                if (progressCallback) progressCallback();
            }

            let variables = this.vars.convertVariables(target.variables);
            let lists = this.listsMgr.convertLists(target.lists, target);

            let regularScripts = [];
            let customBlockScripts = [];
            let blocks = target.blocks;

            for (let k in blocks) {
                let b = blocks[k];
                if (b.topLevel) {
                    let x = Math.round(b.x / 1.5) || 0;
                    let y = Math.round(b.y / 1.8) || 0;
                    this.compatStackReporters = [];
                    let stack = this.convertSubstack(k, blocks);
                    if (stack && stack.length > 0) {
                        if (b.opcode === 'procedures_definition' || (stack[0] && stack[0][0] === 'procDef')) {
                            customBlockScripts.push([x, y, stack]);
                        } else {
                            regularScripts.push([x, y, stack]);
                        }
                    }
                }
            }

            let maxX = 0;
            for (let s of regularScripts) {
                if (s[0] > maxX) maxX = s[0];
            }

            let customStartX = regularScripts.length > 0 ? maxX + 300 : 300;
            let customY = 20;

            for (let i = 0; i < customBlockScripts.length; i++) {
                customBlockScripts[i][0] = customStartX;
                customBlockScripts[i][1] = customY;
                customY += 200;
                if (customY > 1200) {
                    customY = 20;
                    customStartX += 300;
                }
            }

            let scripts = regularScripts.concat(customBlockScripts);

            let obj = {
                objName: target.isStage ? 'Stage' : target.name,
                scripts: scripts,
                variables: variables,
                lists: lists,
                sounds: this.soundsMgr.sounds,
                costumes: this.costumesMgr.costumes,
                currentCostumeIndex: target.currentCostume
            };

            if (target.isStage) {
                obj.tempoBPM = target.tempo;
                obj.videoAlpha = (100 - target.videoTransparency) / 100;
                obj.info = { videoOn: target.videoState === 'on' };
                obj.children = []; 
            } else {
                const rotationStyles = { 'all around': 'normal', 'left-right': 'leftRight', "don't rotate": 'none' };
                obj.scratchX = target.x;
                obj.scratchY = target.y;
                obj.scale = target.size / 100;
                obj.direction = target.direction;
                obj.rotationStyle = rotationStyles[target.rotationStyle] || 'normal';
                obj.isDraggable = target.draggable;
                obj.visible = target.visible;
                obj.spriteInfo = {};
            }
            return obj;
        }
    }

    class BlockMapper {
        constructor(converter) {
            this.c = converter;
            this.custom = new CustomBlockMapper(converter);
        }

        mapArgs(opcode, block, blocks) {
            if (this[opcode]) return this[opcode](block, blocks);
            if (this.custom[opcode]) return this.custom[opcode](block, blocks);
            return null;
        }

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

        sound_play(b, bs) { return ['playSound:', this.c.inputVal('SOUND_MENU', b, bs)]; }
        sound_playuntildone(b, bs) { return ['doPlaySoundAndWait', this.c.inputVal('SOUND_MENU', b, bs)]; }
        sound_stopallsounds(b, bs) { return ['stopAllSounds']; }
        sound_changevolumeby(b, bs) { return ['changeVolumeBy:', this.c.inputVal('VOLUME', b, bs)]; }
        sound_setvolumeto(b, bs) { return ['setVolumeTo:', this.c.inputVal('VOLUME', b, bs)]; }
        sound_volume(b, bs) { return ['volume']; }

        event_whenflagclicked(b, bs) { return ['whenGreenFlag']; }
        event_whenkeypressed(b, bs) { return ['whenKeyPressed', this.c.fieldVal('KEY_OPTION', b)]; }
        event_whenthisspriteclicked(b, bs) { return ['whenClicked']; }
        event_whenstageclicked(b, bs) { return ['whenClicked']; }
        event_whenbackdropswitchesto(b, bs) { return ['whenSceneStarts', this.c.fieldVal('BACKDROP', b)]; }
        event_whengreaterthan(b, bs) { 
            let f = this.c.fieldVal('WHENGREATERTHANMENU', b);
            if (typeof f === 'string') f = f.toLowerCase();
            return ['whenSensorGreaterThan', f, this.c.inputVal('VALUE', b, bs)];
        }
        event_whenbroadcastreceived(b, bs) { return ['whenIReceive', this.c.fieldVal('BROADCAST_OPTION', b)]; }
        event_broadcast(b, bs) { return ['broadcast:', this.c.inputVal('BROADCAST_INPUT', b, bs)]; }
        event_broadcastandwait(b, bs) { return ['doBroadcastAndWait', this.c.inputVal('BROADCAST_INPUT', b, bs)]; }

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
        sensing_timer(b, bs) { return ['timer']; }
        sensing_resettimer(b, bs) { return ['timerReset']; }
        sensing_of(b, bs) {
            let attr = this.c.fieldVal('PROPERTY', b);
            let obj = this.c.inputVal('OBJECT', b, bs);
            const stageAttrs = new Set(['backdrop #', 'backdrop name', 'volume']);
            const spriteAttrs = new Set(['x position', 'y position', 'direction', 'costume #', 'costume name', 'size', 'volume']);
            if (obj === '_stage_') { if (!stageAttrs.has(attr)) attr = this.c.varName(attr); } 
            else if (!spriteAttrs.has(attr)) { attr = this.c.varName(attr); }
            return ['getAttribute:of:', attr, obj];
        }
        sensing_current(b, bs) {
            let f = this.c.fieldVal('CURRENTMENU', b);
            if (typeof f === 'string') f = f.toLowerCase();
            return ['timeAndDate', f];
        }
        sensing_dayssince2000(b, bs) { return ['timestamp']; }
        sensing_username(b, bs) { return ['getUserName']; }

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

        pen_clear(b, bs) { return ['clearPenTrails']; }
        pen_stamp(b, bs) { return ['stampCostume']; }
        pen_penDown(b, bs) { return ['putPenDown']; }
        pen_penUp(b, bs) { return ['putPenUp']; }
        pen_setPenColorToColor(b, bs) {
            let val = this.c.inputVal('COLOR', b, bs);
            if (typeof val === 'string') {
                let dec = this.c.hexToDec(val);
                if (typeof dec === 'number' && !isNaN(dec)) return ['penColor:', dec];
            }
            return ['penColor:', val];
        }
        pen_menu_colorParam(b, bs) {
            let val = this.c.fieldVal('colorParam', b);
            if (typeof val === 'string') return val.toLowerCase();
            return val;
        }
        pen_setPenColorParamTo(b, bs) {
            let param = this.c.inputVal('COLOR_PARAM', b, bs);
            if (!param) param = this.c.fieldVal('COLOR_PARAM', b);
            if (!param) param = this.c.fieldVal('colorParam', b);
            let val = this.c.inputVal('VALUE', b, bs);
            if (typeof param === 'string') {
                let p = param.toLowerCase();
                if (p === 'color') return ['setPenHueTo:', (typeof val === 'number' ? val * 2 : ['*', val, 2])];
                if (p === 'brightness') return ['setPenShadeTo:', val];
            }
            return null;
        }
        pen_changePenColorParamBy(b, bs) {
            let param = this.c.inputVal('COLOR_PARAM', b, bs);
            if (!param) param = this.c.fieldVal('COLOR_PARAM', b);
            if (!param) param = this.c.fieldVal('colorParam', b);
            let val = this.c.inputVal('VALUE', b, bs);
            if (typeof param === 'string') {
                let p = param.toLowerCase();
                if (p === 'color') return ['changePenHueBy:', (typeof val === 'number' ? val * 2 : ['*', val, 2])];
                if (p === 'brightness') return ['changePenShadeBy:', val];
            }
            return null;
        }
        pen_changePenSizeBy(b, bs) { return ['changePenSizeBy:', this.c.inputVal('SIZE', b, bs)]; }
        pen_setPenSizeTo(b, bs) { return ['penSize:', this.c.inputVal('SIZE', b, bs)]; }
    }

    class CustomBlockMapper {
        constructor(converter) {
            this.c = converter;
        }

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
    }

    class VariableManager {
        constructor(converter) {
            this.c = converter;
        }

        varName(name) {
            if (typeof name === 'string') return (this.c.compat ? '\u00A0' : '') + name;
            if (this.c.compat) return ['concatenate:with:', '\u00A0', name];
            return name;
        }

        compatVarName(name) {
            return (this.c.targetIsStage ? 'Stage: ' : '') + name;
        }

        specialNum(num) {
            if (num === '-Infinity') return -Infinity;
            if (num === 'Infinity') return Infinity;
            if (num === 'NaN') return NaN;
            return num;
        }

        hexToDec(hex) {
            if (typeof hex === 'string') {
                let str = hex.trim();
                if (str.startsWith('#')) {
                    let h = str.substring(1);
                    if (h.length === 3) {
                        h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
                    }
                    const parsed = parseInt(h, 16);
                    if (!isNaN(parsed)) return parsed;
                } else if (str.startsWith('0x') || str.startsWith('0X')) {
                    const parsed = parseInt(str, 16);
                    if (!isNaN(parsed)) return parsed;
                }
            }
            return hex;
        }

        convertVariables(variablesMap) {
            let variables = [];
            for (let k in variablesMap) {
                let v = variablesMap[k];
                variables.push({
                    name: this.varName(v[0]),
                    value: this.specialNum(v[1]),
                    isPersistent: v.length >= 3 && v[2]
                });
            }
            return variables;
        }
    }

    class ListManager {
        constructor(converter) {
            this.c = converter;
        }

        convertLists(listsMap, target) {
            let lists = [];
            for (let k in listsMap) {
                let l = listsMap[k];
                let monitor = this.c.monitors.find(m => m.id === k);
                lists.push({
                    listName: this.c.varName(l[0]),
                    contents: l[1].map(x => this.c.specialNum(x)),
                    isPersistent: false,
                    x: monitor ? monitor.x : 0, 
                    y: monitor ? monitor.y : 0, 
                    width: monitor ? monitor.width : 100, 
                    height: monitor ? monitor.height : 200, 
                    visible: monitor ? monitor.visible : false 
                });
            }
            if (this.c.compat && !target.isStage) {
                const spriteCostumeNames = (target.costumes || []).map(c => c.name || '');
                const spriteListName = this.c.varName('SpriteCostumes');
                const alreadyHas = lists.some(l => l.listName === spriteListName);
                if (!alreadyHas) {
                    lists.push({
                        listName: spriteListName,
                        contents: spriteCostumeNames.map(x => this.c.specialNum(x)),
                        isPersistent: false,
                        x: 0, y: 0, width: 100, height: 200, visible: false
                    });
                }
            }
            return lists;
        }
    }

    class SoundManager {
        constructor(converter) {
            this.c = converter;
            this.soundAssets = {};
            this.sounds = [];
            this.sourceZip = null;
            this._audioCtx = null;
        }

        resetTarget() {
            this.sounds = [];
        }

        getAudioContext() {
            if (!this._audioCtx || this._audioCtx.state === 'closed') {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                this._audioCtx = new AudioContextClass();
            }
            return this._audioCtx;
        }

        decodeAudio(ctx, buffer) {
            return new Promise((resolve, reject) => {
                const promise = ctx.decodeAudioData(buffer, resolve, reject);
                if (promise && typeof promise.then === 'function') {
                    promise.then(resolve).catch(reject);
                }
            });
        }

        static getEmptyWav() {
            const buffer = new ArrayBuffer(44);
            const view = new DataView(buffer);
            view.setUint32(0, 0x46464952, true);
            view.setUint32(4, 36, true);
            view.setUint32(8, 0x45564157, true);
            view.setUint32(12, 0x20746d66, true);
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, 1, true);
            view.setUint32(24, 22050, true);
            view.setUint32(28, 44100, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            view.setUint32(36, 0x61746164, true);
            view.setUint32(40, 0, true);
            return buffer;
        }

        bufferToWav(buffer) {
            const sampleRate = 22050;
            const numChannels = buffer.numberOfChannels;
            const len = buffer.length;
            const length = len * 2 + 44;
            const bufferArr = new ArrayBuffer(length);
            const view = new DataView(bufferArr);
            let pos = 0;

            const setUint16 = (d) => { view.setUint16(pos, d, true); pos += 2; };
            const setUint32 = (d) => { view.setUint32(pos, d, true); pos += 4; };

            setUint32(0x46464952);
            setUint32(length - 8);
            setUint32(0x45564157);
            setUint32(0x20746d66);
            setUint32(16);
            setUint16(1);
            setUint16(1);
            setUint32(sampleRate);
            setUint32(sampleRate * 2);
            setUint16(2);
            setUint16(16);
            setUint32(0x61746164);
            setUint32(len * 2);

            if (numChannels === 1) {
                const channelData = buffer.getChannelData(0);
                for (let i = 0; i < len; i++) {
                    let sample = channelData[i];
                    if (Number.isNaN(sample)) sample = 0;
                    else if (sample < -1) sample = -1;
                    else if (sample > 1) sample = 1;
                    const s = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7FFF);
                    view.setInt16(pos, s, true);
                    pos += 2;
                }
            } else {
                const chan0 = buffer.getChannelData(0);
                const chan1 = buffer.getChannelData(1);
                for (let i = 0; i < len; i++) {
                    let s0 = chan0[i] || 0;
                    let s1 = chan1[i] || 0;
                    let sample = (s0 + s1) * 0.5;
                    if (Number.isNaN(sample)) sample = 0;
                    else if (sample < -1) sample = -1;
                    else if (sample > 1) sample = 1;
                    const s = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7FFF);
                    view.setInt16(pos, s, true);
                    pos += 2;
                }
            }
            return bufferArr;
        }

        async addSound(s, zipOut) {
            if (!this.soundAssets[s.assetId]) {
                let url = "https://assets.scratch.mit.edu/internalapi/asset/" + s.md5ext + "/get/";
                let ab = null;

                if (this.sourceZip) {
                    let entry = null;
                    if (typeof this.sourceZip.file === 'function') entry = this.sourceZip.file(s.md5ext) || this.sourceZip.file('assets/' + s.md5ext);
                    if (!entry && this.sourceZip.files) {
                        for (const name in this.sourceZip.files) {
                            if (!name) continue;
                            if (name === s.md5ext || name.endsWith('/' + s.md5ext) || name.endsWith(s.md5ext)) { entry = this.sourceZip.file(name); break; }
                        }
                    }
                    if (entry) {
                        try {
                            const arr = await ProjectDownloader.readZipEntry(entry);
                            if (arr) ab = arr instanceof Uint8Array ? arr.buffer : arr;
                        } catch (e) {
                            window.SB3ToSB2.log('debug', `Failed reading sound ${s.name}`, e);
                        }
                    }
                } else {
                    try {
                        const resp = await fetch(url);
                        if (resp.ok) ab = await resp.arrayBuffer();
                    } catch (e) {
                        window.SB3ToSB2.log('debug', `Failed fetching sound ${s.name}`, e);
                    }
                }

                let audioBuffer = null;
                if (ab && ab.byteLength > 0) {
                    try {
                        const audioCtx = this.getAudioContext();
                        audioBuffer = await this.decodeAudio(audioCtx, ab.slice(0));
                    } catch (e) {
                        window.SB3ToSB2.log('heavy', `Failed to decode sound ${s.name}, falling back to placeholder.`);
                        window.SB3ToSB2.log('debug', 'Audio decode error', e);
                    }
                }

                let wavData;
                const targetRate = 22050;
                let sampleCount = 0;

                if (audioBuffer) {
                    let renderedBuffer = null;
                    try {
                        const duration = (audioBuffer.duration && !Number.isNaN(audioBuffer.duration))
                            ? audioBuffer.duration
                            : (audioBuffer.length / audioBuffer.sampleRate);
                        const targetLength = Math.max(1, Math.round(duration * targetRate));
                        const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, targetLength, targetRate);
                        const source = offlineCtx.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(offlineCtx.destination);
                        source.start(0);
                        renderedBuffer = await offlineCtx.startRendering();
                    } catch (e) {
                        window.SB3ToSB2.log('debug', 'Audio render error, fallback to manual resample', e);
                    }

                    if (renderedBuffer) {
                        sampleCount = renderedBuffer.length;
                        wavData = this.bufferToWav(renderedBuffer);
                    } else {
                        sampleCount = audioBuffer.length;
                        wavData = this.bufferToWav(audioBuffer);
                    }
                } else {
                    wavData = SoundManager.getEmptyWav();
                    sampleCount = 0;
                }

                let index = Object.keys(this.soundAssets).length;
                let outName = `${index}.wav`;

                zipOut.file(outName, wavData);
                this.soundAssets[s.assetId] = [index, s.name, sampleCount, targetRate, outName];
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
    }

    class CostumeManager {
        constructor(converter) {
            this.c = converter;
            this.costumeAssets = {};
            this.costumes = [];
            this.sourceZip = null;
            this._fontCache = {};
        }

        resetTarget() {
            this.costumes = [];
        }

        async addCostume(c, zipOut) {
            const placeholderNormal = `<svg width="800" height="800" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M4 1C2.355 1 1 2.355 1 4v1h1V4c0-1.11.89-2 2-2h1V1zm2 0v1h4V1zm5 0v1h1c1.11 0 2 .89 2 2v1h1V4c0-1.645-1.355-3-3-3zM6 5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1M1 6v4h1V6zm13 0v4h1V6zM9.5 8l-2 2L6 9l-2 2v.5c0 .5.5.5.5.5h7s.473-.035.5-.5v-1zM1 11v1c0 1.645 1.355 3 3 3h1v-1H4c-1.11 0-2-.89-2-2v-1zm13 0v1c0 1.11-.89 2-2 2h-1v1h1c1.645 0 3-1.355 3-3v-1zm-8 3v1h4v-1zm0 0" fill="#2e3434" fill-opacity=".349"/></svg>`;
            const placeholderVanity = `<svg xmlns="http://www.w3.org/2000/svg" width="500.401" height="260.802" viewBox="0 0 500.401 260.802"><defs><linearGradient x1="233.943" y1="225.745" x2="246.128" y2="225.827" gradientUnits="userSpaceOnUse" id="a"><stop offset="0" stop-color="#c5fad2"/><stop offset="1" stop-color="#c5fad2" stop-opacity="0"/></linearGradient><linearGradient x1="233.839" y1="225.841" x2="240.126" y2="225.924" gradientUnits="userSpaceOnUse" id="b"><stop offset="0" stop-color="#c5fad2"/><stop offset="1" stop-color="#c5fad2" stop-opacity="0"/></linearGradient></defs><g stroke-miterlimit="10"><g fill="#fff" stroke="#fff" stroke-width="4" stroke-linecap="round"><path d="M283.351 235.525s-3.292 2.419-5.605 3.105c-2.312.686-6.1 1-6.1 1l3.505-4.653zm-12.8-134.329s10.742-19.371 35.55-37.295c19.661-14.205 42.24-23.114 48.375-23.75 2.609-.27-1.551 27.338-8.335 45.31-5.659 14.99-17.489 27.7-24.25 31.687-4.907 2.893-18.065 6.65-24.336 8.348 10.758-2.832 43.984-11.482 56.607-13.66 15.157-2.615 33.834-4.991 38.125-2.75 2.097 1.095 2.713 11.855-10.678 26.108-5.1 5.428-14.55 11.867-23.905 18.668-10.45 7.598-31.04 15.184-36.78 17.263-.538.195-5.328-2.243-10.067-4.777 5.856 3.22 12.301 6.784 13.014 7.261 2.296 1.538 9.592 4.639 22.368 16.151 12.777 11.512 22.391 21.01 18.459 20.86-25.807-.979-65.125-10.25-65.125-10.25s-33.332-34.917-38.4-52.233c-4.55-15.551 9.378-46.941 9.378-46.941z"/><path d="M283.351 235.525s-3.292 2.419-5.605 3.105c-2.312.686-6.1 1-6.1 1l3.505-4.653zm-96.217-93.869c-3.514 18.916-47.665 60.45-47.665 60.45s-31.777 14.552-52.6 18.65c-20.822 4.096-55.487 5.602-60.65 2.55-10.005-6.093 5.294-33.204 15.298-42.523 13.584-12.654 29.43-22.708 29.43-22.708s21.537-6.53 33.467-9.17c-12.091 2.533-33.835 8.945-33.835 8.945s-22.82-3.874-32.8-10.725c-8.522-5.85-36.651-21.97-35.759-33.865.71-9.468 27.119-10.622 44.9-11.75 17.782-1.127 56.425 5.325 56.425 5.325s1.436.32 3.593.836c-2.878-.747-4.873-1.236-4.873-1.236S79.303 99.97 62.973 84.058c-11.771-11.47-29.6-35.486-22.77-38.368 7.078-2.383 44.145 1.68 69.85 13.9 25.703 12.22 49.013 37.044 49.013 37.044s30.966 29.425 28.068 45.022zm-39.069-18.82s-2.142-.976-5.257-2.355a731 731 0 0 1 5.257 2.354z"/><path d="M283.351 235.525s-3.292 2.419-5.605 3.105c-2.312.686-6.1 1-6.1 1l3.505-4.653zM160.865 95.835l10.125-4.625 11.75-2.75 11.625-2 11.396-.875 15.75.125 13.606 1.75 13.875 3.5 10.625 4.375 9.959 5.522 6.373 4.45 5.752 4.55 3.185 3.087s8.253-13.736 21.201-23.209c10.957-8.015 24.542-14.597 25.17-13.793.693.887-4.907 13.645-14.035 23.748-10.985 12.16-23.882 24.87-23.882 24.87s1.092 3.534 1.172 6.107-.201 15.381-.201 15.381 17.012-5.37 34.234-9.554c15.503-3.766 31.665-6.257 32.172-5.165.586 1.262-13.564 7.769-27.842 14.623a5998 5998 0 0 1-31.626 15.051l-7.036-1.419-.597 13.516s9.03 2.586 17.633 6.444c9.85 4.417 21.952 14.118 22.106 15.394.163 1.355-13.46-3.474-22.798-4.627-8.088-1-15.163-2.434-15.163-2.434s7.772 18.284 5.234 31.654c-2.273 11.97-10.658 12.557-10.658 12.557s-6.424 3.008-8.46 2.826c-3.919-.35-8.472.242-8.472.242l-3.351 6.51s-7.897 13.395-22.898 16.936c-12.898 3.045-25.859-2.667-29.55-4.21-7.259-3.036-15.824-8.478-21.958-14.405-6.633-6.41-18.623-11.63-20.289-12.14-11.808-3.612-26.591-12.739-31.145-17.263-6.115-6.076-4.844-11.829-4-20 .6-5.813 4.8-12.913 4.8-12.913s-12.537 1.313-25.36 6.344c-15.502 6.084-37.72 10.475-40.168 9.099-5.107-2.87 17.504-15.28 34.073-23.006 17.204-8.023 27.955-6.764 37.855-10.55 4.38-2.346 8.845-4.98 10.025-9.7s-5.425-5.1-5.425-5.1-11.353-.006-13.375-.274c-4.286-.57-22.35-8.816-43.399-14.212-26.165-6.708-55.386-10.152-53.932-13.393.999-2.225 33.367-1.222 61.785 3.766 14.616 2.566 27.518 6.082 37.572 9.026 7.27 2.13 14.258 3.89 14.492 2.283.357-2.448-10.75-9.3-10.75-9.3s-16.261-13.41-33.308-24.41C97.504 87.126 77.25 76.164 78.123 74.448c1.107-2.175 23.979.963 42.366 10.17 17.237 8.63 32.716 24.338 32.716 24.338s6.403 4.671 11.075 3.55c5.38-1.29-2.075-12.05-2.075-12.05l-3.125-3.75z"/><path d="M283.351 235.525s-3.292 2.419-5.605 3.105c-2.312.686-6.1 1-6.1 1l3.505-4.653zm-2.473-.608c-3.17-.388-8.07.235-8.07.235l-3.122 6.715s-7.896 13.394-22.897 16.935c-12.898 3.045-25.859-2.667-29.55-4.21-7.259-3.036-15.824-8.478-21.958-14.405-6.633-6.41-18.623-11.63-20.289-12.14-4.338-1.327-11.886-5.059-16.233-7.29l-2.882-1.81s-4.269-5.428-4.8-9.9c-.368-3.103-1.761-11.572 5.9-18.126 11.949-10.221 23.6-10.5 23.6-10.5s21.908 18.712 31.72 17.906c7.75-.638 14.7-12.5 14.7-12.5l2.593-5.4s12.752-2.565 20.635-2.92c7.883-.356 13.6 1.4 13.6 1.4s6.631 1.603 9.905 2.947c3.096 1.27 9.233 4.908 9.233 4.908s6.57 4.062 9.386 6.927c3.005 3.056 8.014 11.573 8.014 11.573s2.428 11.484-1.48 19.622c-2.354 4.901-8.97 8.913-11.098 10.452-.909.657-5.81-.284-6.907-.419z"/></g><path d="M283.351 235.525s-3.292 2.419-5.605 3.105c-2.312.686-6.1 1-6.1 1l3.505-4.653" fill="#fff" stroke="#000" stroke-linecap="round"/><path d="M270.55 101.196s10.743-19.371 35.551-37.295c19.661-14.205 42.24-23.114 48.375-23.75 2.609-.27-1.551 27.338-8.335 45.31-5.659 14.99-17.489 27.7-24.25 31.687-6.542 3.856-27.75 9.25-27.75 9.25s44.864-11.947 60.021-14.562 33.834-4.991 38.125-2.75c2.097 1.095 2.713 11.855-10.678 26.108-5.1 5.428-14.55 11.867-23.905 18.668-10.45 7.598-31.04 15.184-36.78 17.263-1.097.398-19.845-10.138-19.845-10.138s21.457 11.728 22.792 12.622c2.296 1.538 9.592 4.639 22.368 16.151 12.777 11.512 22.391 21.01 18.459 20.86-25.807-.979-65.125-10.25-65.125-10.25s-33.332-34.917-38.4-52.233c-4.55-15.551 9.378-46.941 9.378-46.941zm-83.416 40.46c-3.514 18.916-47.665 60.45-47.665 60.45s-31.777 14.552-52.6 18.65c-20.822 4.096-55.487 5.602-60.65 2.55-10.005-6.093 5.294-33.204 15.298-42.523 13.584-12.654 29.43-22.708 29.43-22.708s22.503-6.822 34.246-9.34c11.255-2.411 35.061-4.835 35.061-4.835s-23.496 2.53-34.85 4.803c-11.85 2.372-34.825 9.147-34.825 9.147s-22.82-3.875-32.8-10.725c-8.522-5.85-36.651-21.97-35.759-33.865.71-9.468 27.119-10.622 44.9-11.75 17.782-1.127 56.425 5.325 56.425 5.325s12.527 2.794 19.189 5.177c7.999 2.862 25.531 10.823 25.531 10.823s-16.317-7.424-24.332-10.281c-7.24-2.581-21.668-6.119-21.668-6.119S79.303 99.97 62.973 84.058c-11.771-11.47-29.6-35.486-22.77-38.368 7.078-2.383 44.145 1.68 69.85 13.9 25.703 12.22 49.013 37.044 49.013 37.044s30.966 29.425 28.068 45.022z" fill="#74fbbb" stroke="#000" stroke-linecap="round"/><path d="m160.865 95.835 10.125-4.625 11.75-2.75 11.625-2 11.396-.875 15.75.125 13.606 1.75 13.875 3.5 10.625 4.375 9.959 5.522 6.373 4.45 5.752 4.55 3.185 3.087s8.253-13.736 21.201-23.209c10.957-8.015 24.542-14.597 25.17-13.793.693.887-4.907 13.645-14.035 23.748-10.985 12.16-23.882 24.87-23.882 24.87s1.092 3.534 1.172 6.107-.201 15.381-.201 15.381 17.012-5.37 34.234-9.554c15.503-3.766 31.665-6.257 32.172-5.165.586 1.262-13.564 7.769-27.842 14.623a5998 5998 0 0 1-31.626 15.051l-7.036-1.419-.597 13.516s9.03 2.586 17.633 6.444c9.85 4.417 21.952 14.118 22.106 15.394.163 1.355-13.46-3.474-22.798-4.627-8.088-1-15.163-2.434-15.163-2.434s7.772 18.284 5.234 31.654c-2.273 11.97-10.658 12.557-10.658 12.557s-6.424 3.008-8.46 2.826c-3.919-.35-8.472.242-8.472.242l-3.351 6.51s-7.897 13.395-22.898 16.936c-12.898 3.045-25.859-2.667-29.55-4.21-7.259-3.036-15.824-8.478-21.958-14.405-6.633-6.41-18.623-11.63-20.289-12.14-11.808-3.612-26.591-12.739-31.145-17.263-6.115-6.076-4.844-11.829-4-20 .6-5.813 4.8-12.913 4.8-12.913s-12.537 1.313-25.36 6.344c-15.502 6.084-37.72 10.475-40.168 9.099-5.107-2.87 17.504-15.28 34.073-23.006 17.204-8.023 27.955-6.764 37.855-10.55 4.38-2.346 8.845-4.98 10.025-9.7s-5.425-5.1-5.425-5.1-11.353-.006-13.375-.274c-4.286-.57-22.35-8.816-43.399-14.212-26.165-6.708-55.386-10.152-53.932-13.393.999-2.225 33.367-1.222 61.785 3.766 14.616 2.566 27.518 6.082 37.572 9.026 7.27 2.13 14.258 3.89 14.492 2.283.357-2.448-10.75-9.3-10.75-9.3s-16.261-13.41-33.308-24.41C97.504 87.126 77.25 76.164 78.123 74.448c1.107-2.175 23.979.963 42.366 10.17 17.237 8.63 32.716 24.338 32.716 24.338s6.403 4.671 11.075 3.55c5.38-1.29-2.075-12.05-2.075-12.05l-3.125-3.75z" fill="#c5fad2" stroke="#000" stroke-linecap="round" stroke-linejoin="round"/><path d="M288.78 171.701c-.376 1.98-5.574 14.966-5.574 14.966s-5.47-2.873-9.256-4.637c-2.997-1.397-9.646-3.055-9.646-3.055s2.723-9.466 3.188-11.914c1.855-9.767 13.06-19.731 17.627-18.864s5.515 13.738 3.66 23.505z" fill="#fff" stroke="#000"/><path d="M279.85 188.629c-2.107 3.677-5.972 5.739-7.489 4.952-1.517-.788-1.012-4.377.308-6.803 2.523-4.64 6.41-7.428 7.927-6.64 1.517.787 1.236 5.034-.745 8.49z"/><path d="M280.878 234.917c-3.17-.388-8.07.235-8.07.235l-3.122 6.715s-7.896 13.394-22.897 16.935c-12.898 3.045-25.859-2.667-29.55-4.21-7.259-3.036-15.824-8.478-21.958-14.405-6.633-6.41-18.623-11.63-20.289-12.14-4.338-1.327-11.886-5.059-16.233-7.29l-2.882-1.81s-4.269-5.428-4.8-9.9c-.368-3.103-1.761-11.572 5.9-18.126 11.949-10.221 23.6-10.5 23.6-10.5s21.908 18.712 31.72 17.906c7.75-.638 14.7-12.5 14.7-12.5l2.593-5.4s12.752-2.565 20.635-2.92c7.883-.356 13.6 1.4 13.6 1.4s6.631 1.603 9.905 2.947c3.096 1.27 9.233 4.908 9.233 4.908s6.57 4.062 9.386 6.927c3.005 3.056 8.014 11.573 8.014 11.573s2.428 11.484-1.48 19.622c-2.354 4.901-8.97 8.913-11.098 10.452-.909.657-5.81-.284-6.907-.419z" fill="#dbfbe3" stroke="#000"/><path d="M187.343 130.63s4.308-11.221 10.875-17.5c6.568-6.28 29.412-10.826 33.75-2.75 1.477 2.75-4.34 10.526-8.25 10.375-6.313-.173-13.766-.131-20.25 1.375-6.483 1.506-16.125 8.5-16.125 8.5m93.883-1.75c-2.34-1.298-9.652-1.574-10.84-2.058-1.956-.797-.044-12.197.659-13.312 3.512-3.45 14.482.69 19.074 8.531 4.593 7.84 3.906 19.937 3.906 19.937s-6.978-9.87-12.799-13.098" fill="#74fbbb" stroke="#000" stroke-linecap="round" stroke-linejoin="round"/><path d="M262.488 235.606s1.409 7.114.49 9.09c-1.514 3.248-3.253 5.19-11.056 5.055s-11.209-2.473-20.667-8.556-14.836-14.087-18.722-16.611-10.5-.6-10.834-3.056c-.314-2.315 1.737-5.638 5.556-9.61 3.819-3.974 7.046-8.839 13.833-5.556 6.788 3.282 3.864 22.542 17.708 27.333 9.527 3.297 34.266 1.445 34.266 1.445" fill="#a76159" stroke="#000" stroke-linecap="round" stroke-linejoin="round"/><path d="M232.573 241.799s2.477-1.982 3.458-2.07c.49-.044 1.856.988 2.347 2.153.492 1.166.042 3.514.042 3.514l.139-1.887s8.536 1.794 12.777.444c2.945-.937 1.584-6.889 1.584-6.889l-.32-1.333 3.486.055s3.59 3.34 1.848 9.875c-1.255 4.706-9.201 3.998-10.32 3.723-4.363-1.075-9.028-3.861-9.028-3.861z" fill="#fff" stroke="#000" stroke-linecap="round"/><path d="M205.473 213.946c1.111-1.354 3.926-4.245 3.926-4.245s1.5-1.528 2.354-2.239c.628-.523 2.3-1.639 2.3-1.639l4.652 5.152 7.7 7.09s1.044 2.1 1.564 3.482c.505 1.34 1.678 3.733 1.678 3.733s.645 1.61 1.797 3.049c1.232 1.54 3.345 3.272 4.519 4.077 2.307 1.581 7.532 2.457 7.532 2.457s7.178.588 10.32.705c2.777.103 8.679.015 8.679.015l.756 4.557s-.377.734-4.855 1.425c-4.478.69-7.613.553-11.983.055-4.369-.497-5.911-.735-10.856-3.545-4.851-2.756-7.446-3.745-11.716-7.432-.083-.072.055.078-.029.005-4.427-3.832-6.854-9.882-10.857-12.02s-10.358-.665-10.358-.665 1.858-2.775 2.877-4.017" fill-opacity=".086"/><path d="M253.446 235.591s-.987 1.253-3.3 1.939-4.8 0-4.8 0l1.6-2.304z" fill="#fff" stroke="#000" stroke-linecap="round"/><path d="M254.333 204.423c2.025 2.19 3.663 4.3 2.548 5.332-1.115 1.031-3.56-.508-5.585-2.697s-3.163-4-2.048-5.031c1.115-1.032 3.06.207 5.085 2.396zm41.729.202c1.183.453.862 2.207-.028 4.53-.89 2.321-2.308 4.27-3.49 3.816s-.568-2.595.322-4.917 2.014-3.883 3.196-3.43z" fill="#56ba8b" stroke="#000"/><path d="M227.774 163.839c1.14 3.741 2.719 13.357 1.462 17.119-.802 2.4-5.76 12.288-12.962 16.173-6.873 3.708-14.676-2.045-23.462-7.582-6.94-4.375-13.83-9.039-13.83-14.751 0-12.795 6.25-32.544 24.5-32.834 15.372-.244 21.042 11.206 24.292 21.875z" fill="#fff" stroke="#000"/><path d="M158.702 218.576c-.19-.227-4.386-2.394-4.453-2.496-1.304-1.971-2.857-4.243-3.197-7.108-.368-3.103-1.761-11.572 5.9-18.126 9.68-8.281 18.688-10.127 21.973-10.495.217-.024 3.334 3.795 3.462 3.89" fill="none" stroke="#dbfbe3" stroke-width="2.5" stroke-linecap="round"/><path d="m167.183 184.879 11.9-4.3" fill="none" stroke="#dbfbe3" stroke-width="2" stroke-linecap="round"/><path d="M229.946 180.264s.175.034.58-.049c.585-.12 2.404-.545 3.827-.88 6.659-1.271 9.7-1.563 9.7-1.563" fill="none" stroke="#c5fad2" stroke-width="2"/><path d="m234.205 227.484-.048-2.816 11.709-.58.048 2.815z" fill="url(#a)" transform="translate(9.95 -48.909)"/><path d="m234.053 227.58-.153-2.815 6.012-.581.152 2.816z" fill="url(#b)" transform="translate(9.95 -48.909)"/><path d="M219.476 192.129c-2.108 3.677-5.973 5.739-7.49 4.952-1.517-.788-1.012-4.377.308-6.803 2.523-4.64 6.41-7.428 7.927-6.64 1.517.787 1.236 5.034-.745 8.49z"/><path d="M214.122 205.856s2.976-1.387 5.945.064c2.969 1.45 3.39 2.554 4.625 5.248 1.336 2.915 2.096 7.23 2.096 7.23s-5.996-5.7-7.875-7.167c-2.36-1.844-4.791-5.375-4.791-5.375m-11.499 12.265s1.582 1.343 2.32 2.132c.824.883 2.397 2.915 2.397 2.915s-4.731-.144-5.38-1.069c-.707-1.01.663-3.979.663-3.979" fill="#fff" stroke="#000" stroke-linecap="round" stroke-linejoin="round"/><path d="M428.025 53.353s-6.107 7.388-10.77 11.109-15.627 10.404-19.843 6.868c-3.67-3.078 2.59-9.231 3.816-12.72 1.414-2.982 2.12-5.172 2.12-5.172l-.084-.058c-14.753 0-26.712-11.39-26.712-25.44h0c0-14.05 11.959-25.44 26.712-25.44h67.924c14.753 0 26.712 11.39 26.712 25.44h0c0 14.05-11.959 25.44-26.712 25.44z" fill="#fff" stroke-opacity=".333" stroke="#000" stroke-width="5" stroke-linecap="round"/><path d="M428.025 53.353s-6.107 7.388-10.77 11.109-15.627 10.404-19.843 6.868c-3.67-3.078 2.59-9.231 3.816-12.72 1.414-2.982 2.12-5.172 2.12-5.172l-.084-.058c-14.753 0-26.712-11.39-26.712-25.44S388.511 2.5 403.264 2.5h67.924c14.753 0 26.712 11.39 26.712 25.44s-11.959 25.44-26.712 25.44z" fill="#fff"/><text transform="translate(398.132 37.198)scale(.71235)" font-size="40" xml:space="preserve" font-family="Sans Serif"><tspan x="0" dy="0">Yikes!</tspan></text></g></svg>`;
            const placeholder = placeholderVanity;

            if (!this.costumeAssets[c.assetId]) {
                let ext = c.dataFormat;
                let url = "https://assets.scratch.mit.edu/internalapi/asset/" + c.md5ext + "/get/";
                let finalData;
                if (this.sourceZip) {
                    let entry = null;
                    if (typeof this.sourceZip.file === 'function') {
                        entry = this.sourceZip.file(c.md5ext) || this.sourceZip.file('assets/' + c.md5ext);
                    }
                    if (!entry && this.sourceZip.files) {
                        for (const name in this.sourceZip.files) {
                            if (!name) continue;
                            if (name === c.md5ext || name.endsWith('/' + c.md5ext) || name.endsWith(c.md5ext)) { entry = this.sourceZip.file(name); break; }
                        }
                    }
                    if (entry) {
                        try {
                            const arr = await ProjectDownloader.readZipEntry(entry);
                            if (!arr) throw new Error('Zip entry read returned null');
                            finalData = arr;
                            if (ext === 'svg') {
                                let str = new TextDecoder().decode(finalData);
                                str = str.replace(/fill="undefined"/g, '');
                                finalData = new TextEncoder().encode(str);
                            }
                        } catch (e) {
                            window.SB3ToSB2.log('heavy', `Failed to read costume ${c.name} from project, using placeholder.`);
                            window.SB3ToSB2.log('debug', 'Costume read error', e);
                            finalData = new TextEncoder().encode(placeholder);
                        }
                    } else {
                        window.SB3ToSB2.log('heavy', `Costume ${c.name} not found in project, using placeholder.`);
                        finalData = new TextEncoder().encode(placeholder);
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
                        window.SB3ToSB2.log('heavy', `Failed to download costume ${c.name}, using placeholder.`);
                        window.SB3ToSB2.log('debug', 'Costume download error', e);
                        finalDataLocal = new TextEncoder().encode(placeholder);
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
                        window.SB3ToSB2.log('heavy', `SVG rasterize failed for ${c.name}, leaving costume unchanged.`);
                        window.SB3ToSB2.log('debug', 'Rasterize error', e);
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
            } catch (e) {}

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
                    img.onerror = (e) => reject(new Error('SVG load failed'));
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
                window.SB3ToSB2.log('debug', `Font load failed for ${name}`, e);
                this._fontCache[name] = null;
                return null;
            }
        }

        async _embedFontsInSvg(svgText) {
            const fontFiles = {
                'Noto Sans': 'https://raw.githubusercontent.com/towerofnix/scratch-render-fonts/refs/heads/master/src/NotoSans-Medium.ttf',
                'Source Serif Pro': 'https://raw.githubusercontent.com/towerofnix/scratch-render-fonts/refs/heads/master/src/SourceSerifPro-Regular.otf',
                'Handlee': 'https://raw.githubusercontent.com/towerofnix/scratch-render-fonts/refs/heads/master/src/handlee-regular.ttf',
                'Knewave': 'https://raw.githubusercontent.com/towerofnix/scratch-render-fonts/refs/heads/master/src/Knewave.ttf',
                'Griffy': 'https://raw.githubusercontent.com/towerofnix/scratch-render-fonts/refs/heads/master/src/Griffy-Regular.ttf',
                'Grand9K Pixel': 'https://raw.githubusercontent.com/towerofnix/scratch-render-fonts/refs/heads/master/src/Grand9K-Pixel.ttf'
            };

            const used = new Set();
            const re = /font-family\s*[:=]\s*['\"]?([^'";,)<>]+)['\"]?/gi;
            let m;
            while ((m = re.exec(svgText)) !== null) {
                const name = m[1].trim();
                if (fontFiles[name]) used.add(name);
            }
            if (used.size === 0) return svgText;

            const rules = [];
            for (const name of used) {
                const url = fontFiles[name];
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
    }

    window.SB3ToSB2 = {
        _level: 1,
        _logHandler: null,
        projectSource: "",

        logginglevel(lvl) {
            const logLevels = { task: 1, info: 2, heavy: 3, debug: 4 };
            if (typeof lvl === 'string') {
                this._level = logLevels[lvl.toLowerCase()] || 1;
            } else if (typeof lvl === 'number') {
                this._level = lvl;
            }
        },

        setLogHandler(fn) {
            this._logHandler = fn;
        },

        log(levelName, msg, data) {
            const logLevels = { task: 1, info: 2, heavy: 3, debug: 4 };
            const req = logLevels[levelName] || 1;
            if (this._level >= req) {
                if (levelName === 'task') {
                    if (this._logHandler) {
                        this._logHandler(msg);
                    } else {
                        console.log(`[task] ${msg}`);
                    }
                } else {
                    if (req === 4) {
                        console.log(`[${levelName}] ${msg}`, data !== undefined ? data : '');
                    } else {
                        console.log(`[${levelName}] ${msg}`);
                    }
                }
            }
        },

        async downloadProject(projectId, progressCallback = () => {}) {
            if (`${projectId}`.length < 100) {
                SB3ToSB2.projectSource = projectId;
            } else {
                SB3ToSB2.projectSource = "";
            }

            return await ProjectDownloader.downloadProject(projectId, progressCallback);
        },

        async processSB3(projectData, jszip, sourceZip, progressCallback = () => {}) {
            this.log('task', 'Starting conversion...');
            const converter = new ProjectConverter();
            converter.compat = true;
            converter.unlimJoin = false;
            converter.limList = false;
            converter.penFill = false;
            converter.sourceZip = sourceZip;
            converter.costumesMgr.sourceZip = sourceZip;
            converter.soundsMgr.sourceZip = sourceZip;

            let totalAssets = 0;
            let completedAssets = 0;
            projectData.targets.forEach(t => { totalAssets += t.costumes.length + t.sounds.length; });

            converter.monitors = projectData.monitors || [];

            const targets = projectData.targets;
            let stage = null;
            let sprites = [];

            for (const target of targets) {
                this.log('heavy', `Processing: ${target.name}`);
                const convertedTarget = await converter.convertTarget(target, jszip, () => {
                    completedAssets++;
                    progressCallback(10 + (80 * (completedAssets / totalAssets)));
                });
                if (target.isStage) { stage = convertedTarget; } 
                else { convertedTarget.layerOrder = target.layerOrder; sprites.push(convertedTarget); }
            }

            sprites.sort((a, b) => a.layerOrder - b.layerOrder);
            sprites.forEach(s => delete s.layerOrder);

            if (!stage) throw new Error("No Stage found in JSON.");
            stage.children = sprites;
            stage.info = stage.info || {};
            stage.info.userAgent = `Pooiod7's SB3 to SB2 converter written in js (scratchflash.pages.dev/convert#${SB3ToSB2.projectSource})`;
            stage.info.flashVersion = "WIN 32,0,0,0";
            stage.info.swfVersion = "v461.1";
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
            this.log('debug', 'Final stage output', stage);
            jszip.file("project.json", JSON.stringify(stage));
        },

        async processNormal(projectData, jszip, progressCallback = () => {}) {
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
                if (node.children) { node.children.forEach(child => parseNode(child)); }
            }

            parseNode(projectData);
            let completed = 0;
            const total = assetsToDownload.length;
            this.log('task', `Downloading ${total} assets...`);

            for (const asset of assetsToDownload) {
                if (asset.type === 'costume') {
                    const c = asset.data;
                    const ext = c.baseLayerMD5.match(/\.[a-zA-Z0-9]+/)[0];
                    await ProjectDownloader.downloadAsset(c.baseLayerMD5, c.baseLayerID + ext, jszip);
                    if (c.textLayerMD5) {
                        const textExt = c.textLayerMD5.match(/\.[a-zA-Z0-9]+/)[0];
                        await ProjectDownloader.downloadAsset(c.textLayerMD5, c.textLayerID + textExt, jszip);
                    }
                } else {
                    const s = asset.data;
                    const ext = s.md5.match(/\.[a-zA-Z0-9]+/)[0];
                    await ProjectDownloader.downloadAsset(s.md5, s.soundID + ext, jszip);
                }
                completed++;
                progressCallback(10 + (80 * (completed / total)));
            }

            projectData.info = projectData.info || {};
            projectData.info.comment = `Initially converted sb3 to sb2 by pooiod7's converter (scratchflash.pages.dev/convert#${SB3ToSB2.projectSource})`;

            jszip.file("project.json", JSON.stringify(projectData));
        }
    };
})();
