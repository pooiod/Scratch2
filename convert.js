(() => {
    const COMPAT_PREFIX = 'compat:';

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
            this.needsContainsHelper = false;
            this.findInListHelpers = new Set();
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
                    script.push(['deleteLine:ofList:', 'all', this.compatVarName(COMPAT_PREFIX + 'results')]);
                    script.push(...sReporters);
                    if (output && output[0] === 'doUntil') {
                         if(!Array.isArray(output[2])) output[2] = [];
                         output[2].push(['deleteLine:ofList:', 'all', this.compatVarName(COMPAT_PREFIX + 'results')]);
                         output[2].push(...sReporters);
                    }
                    if (output && output[0] === 'doWaitUntil') {
                         output = ['doUntil', output[1], [['deleteLine:ofList:', 'all', this.compatVarName(COMPAT_PREFIX + 'results')], ...sReporters, ['wait:elapsed:from:', 0]]];
                    }
                }
                if(output) script.push(output);
                currId = block.next;
            }
            this.compatStackReporters.pop();
            return script;
        }

        createContainsHelperScript() {
            return [
                ['procDef', COMPAT_PREFIX + 'contains %s %s', ['text', 'sub'], ['', ''], true],
                ['deleteLine:ofList:', 'all', this.compatVarName(COMPAT_PREFIX + 'found')],
                ['append:toList:', 'false', this.compatVarName(COMPAT_PREFIX + 'found')],
                ['doIf', ['|', ['=', ['stringLength:', ['getParam', 'sub', 'r']], 0], ['=', ['getParam', 'text', 'r'], ['getParam', 'sub', 'r']]], [
                    ['setLine:ofList:to:', 1, this.compatVarName(COMPAT_PREFIX + 'found'), 'true']
                ]],
                ['doIf', ['&', ['=', ['getLine:ofList:', 1, this.compatVarName(COMPAT_PREFIX + 'found')], 'false'], ['not', ['>', ['stringLength:', ['getParam', 'sub', 'r']], ['stringLength:', ['getParam', 'text', 'r']]]]], [
                    ['deleteLine:ofList:', 'all', this.compatVarName(COMPAT_PREFIX + 'i')],
                    ['append:toList:', 1, this.compatVarName(COMPAT_PREFIX + 'i')],
                    ['doUntil', ['|', ['>', ['getLine:ofList:', 1, this.compatVarName(COMPAT_PREFIX + 'i')], ['+', ['-', ['stringLength:', ['getParam', 'text', 'r']], ['stringLength:', ['getParam', 'sub', 'r']]], 1]], ['=', ['getLine:ofList:', 1, this.compatVarName(COMPAT_PREFIX + 'found')], 'true']], [
                        ['deleteLine:ofList:', 'all', this.compatVarName(COMPAT_PREFIX + 'slice')],
                        ['append:toList:', '', this.compatVarName(COMPAT_PREFIX + 'slice')],
                        ['deleteLine:ofList:', 'all', this.compatVarName(COMPAT_PREFIX + 'j')],
                        ['append:toList:', 0, this.compatVarName(COMPAT_PREFIX + 'j')],
                        ['doRepeat', ['stringLength:', ['getParam', 'sub', 'r']], [
                            ['setLine:ofList:to:', 1, this.compatVarName(COMPAT_PREFIX + 'slice'), ['concatenate:with:', ['getLine:ofList:', 1, this.compatVarName(COMPAT_PREFIX + 'slice')], ['letter:of:', ['+', ['getLine:ofList:', 1, this.compatVarName(COMPAT_PREFIX + 'i')], ['getLine:ofList:', 1, this.compatVarName(COMPAT_PREFIX + 'j')]], ['getParam', 'text', 'r']]]],
                            ['setLine:ofList:to:', 1, this.compatVarName(COMPAT_PREFIX + 'j'), ['+', ['getLine:ofList:', 1, this.compatVarName(COMPAT_PREFIX + 'j')], 1]]
                        ]],
                        ['doIf', ['=', ['getLine:ofList:', 1, this.compatVarName(COMPAT_PREFIX + 'slice')], ['getParam', 'sub', 'r']], [
                            ['setLine:ofList:to:', 1, this.compatVarName(COMPAT_PREFIX + 'found'), 'true']
                        ]],
                        ['setLine:ofList:to:', 1, this.compatVarName(COMPAT_PREFIX + 'i'), ['+', ['getLine:ofList:', 1, this.compatVarName(COMPAT_PREFIX + 'i')], 1]]
                    ]]
                ]],
                ['append:toList:', ['getLine:ofList:', 1, this.compatVarName(COMPAT_PREFIX + 'found')], this.compatVarName(COMPAT_PREFIX + 'results')]
            ];
        }

        createFindInListHelperScript(listName) {
            return [
                ['procDef', COMPAT_PREFIX + 'find %s in ' + listName, ['item'], [''], true],
                ['deleteLine:ofList:', 'all', this.compatVarName(COMPAT_PREFIX + 'i')],
                ['append:toList:', 1, this.compatVarName(COMPAT_PREFIX + 'i')],
                ['doIfElse', ['not', ['list:contains:', listName, ['getParam', 'item', 'r']]], [
                    ['append:toList:', 0, this.compatVarName(COMPAT_PREFIX + 'results')]
                ], [
                    ['doUntil', ['=', ['getLine:ofList:', ['getLine:ofList:', 1, this.compatVarName(COMPAT_PREFIX + 'i')], listName], ['getParam', 'item', 'r']], [
                        ['setLine:ofList:to:', 1, this.compatVarName(COMPAT_PREFIX + 'i'), ['+', ['getLine:ofList:', 1, this.compatVarName(COMPAT_PREFIX + 'i')], 1]]
                    ]],
                    ['append:toList:', ['getLine:ofList:', 1, this.compatVarName(COMPAT_PREFIX + 'i')], this.compatVarName(COMPAT_PREFIX + 'results')]
                ]]
            ];
        }

        async convertTarget(target, zipOut, progressCallback) {
            this.soundsMgr.resetTarget();
            this.costumesMgr.resetTarget();
            this.targetIsStage = target.isStage;
            this.targetName = target.name;
            this.needsContainsHelper = false;
            this.findInListHelpers = new Set();

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

            if (this.needsContainsHelper) {
                let containsScript = this.createContainsHelperScript();
                customBlockScripts.push([0, 0, containsScript]);
            }

            if (this.findInListHelpers && this.findInListHelpers.size > 0) {
                for (let listName of this.findInListHelpers) {
                    let findScript = this.createFindInListHelperScript(listName);
                    customBlockScripts.push([0, 0, findScript]);
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
        motion_glideto(b, bs) {
            let to = this.c.inputVal('TO', b, bs);
            let secs = this.c.inputVal('SECS', b, bs);
            if (to === '_mouse_') return ['glideSecs:toX:y:elapsed:from:', secs, ['mouseX'], ['mouseY']];
            if (to === '_random_') return ['glideSecs:toX:y:elapsed:from:', secs, ['randomFrom:to:', -240, 240], ['randomFrom:to:', -180, 180]];
            return ['glideSecs:toX:y:elapsed:from:', secs, ['getAttribute:of:', 'x position', to], ['getAttribute:of:', 'y position', to]];
        }
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
                return ['getLine:ofList:', (this.c.compatStackReporters.length > 0 ? this.c.compatStackReporters[this.c.compatStackReporters.length-1].length : 1), this.c.compatVarName(COMPAT_PREFIX + 'results')];
            }
            return ['concatenate:with:', this.c.inputVal('STRING1', b, bs), this.c.inputVal('STRING2', b, bs)];
        }
        operator_letter_of(b, bs) { return ['letter:of:', this.c.inputVal('LETTER', b, bs), this.c.inputVal('STRING', b, bs)]; }
        operator_length(b, bs) { return ['stringLength:', this.c.inputVal('STRING', b, bs)]; }
        operator_contains(b, bs) {
            this.c.needsContainsHelper = true;
            let str1 = this.c.inputVal('STRING1', b, bs);
            let str2 = this.c.inputVal('STRING2', b, bs);
            let stackReporter = ['call', COMPAT_PREFIX + 'contains %s %s', str1, str2];
            let idx = 1;
            if (this.c.compatStackReporters.length > 0) {
                this.c.compatStackReporters[this.c.compatStackReporters.length - 1].push(stackReporter);
                idx = this.c.compatStackReporters[this.c.compatStackReporters.length - 1].length;
            }
            return ['=', ['getLine:ofList:', idx, this.c.compatVarName(COMPAT_PREFIX + 'results')], 'true'];
        }
        operator_contains_string(b, bs) { return this.operator_contains(b, bs); }
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
        data_itemnumoflist(b, bs) {
            let listName = this.c.fieldVal('LIST', b);
            if (!this.c.findInListHelpers) this.c.findInListHelpers = new Set();
            this.c.findInListHelpers.add(listName);
            let itemVal = this.c.inputVal('ITEM', b, bs);
            let stackReporter = ['call', COMPAT_PREFIX + 'find %s in ' + listName, itemVal];
            let idx = 1;
            if (this.c.compatStackReporters.length > 0) {
                this.c.compatStackReporters[this.c.compatStackReporters.length - 1].push(stackReporter);
                idx = this.c.compatStackReporters[this.c.compatStackReporters.length - 1].length;
            }
            return ['getLine:ofList:', idx, this.c.compatVarName(COMPAT_PREFIX + 'results')];
        }
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

        music_playDrumForBeats(b, bs) { return ['playDrum', this.c.inputVal('DRUM', b, bs), this.c.inputVal('BEATS', b, bs)]; }
        music_restForBeats(b, bs) { return ['rest:elapsed:from:', this.c.inputVal('BEATS', b, bs)]; }
        music_playNoteForBeats(b, bs) { return ['noteOn:duration:elapsed:from:', this.c.inputVal('NOTE', b, bs), this.c.inputVal('BEATS', b, bs)]; }
        music_setInstrument(b, bs) { return ['instrument:', this.c.inputVal('INSTRUMENT', b, bs)]; }
        music_setTempo(b, bs) { return ['setTempoTo:', this.c.inputVal('TEMPO', b, bs)]; }
        music_changeTempo(b, bs) { return ['changeTempoBy:', this.c.inputVal('TEMPO', b, bs)]; }
        music_getTempo(b, bs) { return ['tempo']; }
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
            const compatListNames = [COMPAT_PREFIX + 'results', COMPAT_PREFIX + 'i', COMPAT_PREFIX + 'j', COMPAT_PREFIX + 'slice', COMPAT_PREFIX + 'found'];
            for (const tName of compatListNames) {
                const finalName = this.c.compatVarName(tName);
                if (!lists.some(l => l.listName === finalName)) {
                    lists.push({
                        listName: finalName,
                        contents: [],
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
            const placeholder = `<svg width="800" height="800" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M4 1C2.355 1 1 2.355 1 4v1h1V4c0-1.11.89-2 2-2h1V1zm2 0v1h4V1zm5 0v1h1c1.11 0 2 .89 2 2v1h1V4c0-1.645-1.355-3-3-3zM6 5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1M1 6v4h1V6zm13 0v4h1V6zM9.5 8l-2 2L6 9l-2 2v.5c0 .5.5.5.5.5h7s.473-.035.5-.5v-1zM1 11v1c0 1.645 1.355 3 3 3h1v-1H4c-1.11 0-2-.89-2-2v-1zm13 0v1c0 1.11-.89 2-2 2h-1v1h1c1.645 0 3-1.355 3-3v-1zm-8 3v1h4v-1zm0 0" fill="#2e3434" fill-opacity=".349"/></svg>`;

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
