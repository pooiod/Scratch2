// Controller support library by pooiod7 (only works on ruffle)

(function() {
    if (document.getElementById('virtual-kb-host')) return;

    const host = document.createElement('div');
    host.id = 'virtual-kb-host';
    Object.assign(host.style, {
        position: 'fixed', top: '0', left: '0', width: '100vw', height: '0',
        zIndex: '9999999999', pointerEvents: 'none'
    });
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
        :host { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 13px; color: #333; }
        * { box-sizing: border-box; }
        
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: #F0F0F0; border-left: 1px solid #D0D0D0; }
        ::-webkit-scrollbar-thumb { background: #C1C1C1; border-radius: 4px; border: 2px solid #F0F0F0; }
        ::-webkit-scrollbar-thumb:hover { background: #A8A8A8; }

        #toggle-btn {
            position: fixed; top: 3px; right: 3px;
            background: transparent; border: none; outline: none; cursor: pointer; pointer-events: auto; z-index: 10;
            padding: 0; margin: 0; display: flex; align-items: center; justify-content: center;
        }
        #toggle-btn svg { 
            height: 20px; 
            width: auto; 
            overflow: visible; 
            display: block;
        }
        #toggle-btn path { 
            fill: white; 
            stroke: ${location.pathname.includes("scratchx")?"#30485f":"#9c9ea2"}; 
            stroke-width: 1px;
            vector-effect: non-scaling-stroke;
        }

        #main-popup {
            display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.5); z-index: 90;
            align-items: center; justify-content: center; pointer-events: auto;
        }

        #container {
            background: #E6E6E6;
            border: 1px solid #999; border-radius: 8px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.4);
            display: flex; flex-direction: column;
            width: 90vw; max-width: 720px; height: 85vh; max-height: 600px;
            overflow: hidden; font-weight: bold;
        }

        #header {
            background: linear-gradient(to bottom, #9A9A9A, #808080);
            color: white; padding: 8px 12px;
            display: flex; align-items: center; gap: 10px;
            border-bottom: 1px solid #666;
            text-shadow: 0 -1px 0 rgba(0,0,0,0.3);
        }
        .title { flex: 1; font-size: 14px; pointer-events: none; }
        
        button.ui-btn {
            background: linear-gradient(to bottom, #FFFFFF, #D0D0D0);
            border: 1px solid #999; border-radius: 5px;
            color: #333; font-weight: bold; font-size: 11px;
            padding: 5px 10px; cursor: pointer;
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }
        button.ui-btn:hover { background: linear-gradient(to bottom, #FFF, #E0E0E0); }
        button.ui-btn:active { background: #CCC; box-shadow: inset 0 1px 3px rgba(0,0,0,0.2); }
        
        button.close-btn {
            background: linear-gradient(to bottom, #E74C3C, #C0392B);
            border: 1px solid #900; color: white;
            width: 20px; height: 20px; padding: 0;
            display: flex; align-items: center; justify-content: center;
            border-radius: 50%; box-shadow: inset 0 1px 0 rgba(255,255,255,0.4);
        }
        button.close-btn:hover { background: linear-gradient(to bottom, #FF5D4D, #D64536); }

        input[type="number"] {
            border: 1px solid #B0B0B0; background: white; 
            border-radius: 3px; padding: 3px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);
            color: #333; font-family: inherit; font-size: 12px;
        }

        #ext-status {
            padding: 10px; text-align: center; font-size: 13px;
            background: #F2F2F2; color: #555; border-bottom: 1px solid #D0D0D0;
        }
        
        #ext-cols { display: flex; flex: 1; flex-direction: row; overflow: hidden; background: #F9F9F9; }
        .ext-col { flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 10px; gap: 8px; }
        #ext-left { border-right: 1px solid #D0D0D0; background: #FFF; }
        #ext-right { background: #F2F2F2; }

        .ext-col-title {
            font-size: 12px; color: #666; text-transform: uppercase;
            border-bottom: 2px solid #E0E0E0; padding-bottom: 5px; margin-bottom: 5px;
        }
        
        .ext-map-item { 
            background: linear-gradient(to bottom, #5CA0FF, #3D88F5);
            padding: 6px 10px; border-radius: 4px; cursor: pointer; 
            border: 1px solid #3070D0; color: white;
            display: flex; justify-content: space-between; font-size: 11px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.2); text-shadow: 0 -1px 0 rgba(0,0,0,0.2);
        }
        .ext-map-item:hover { filter: brightness(1.1); }
        .ext-map-item.active-ext {
            background: linear-gradient(to bottom, #FFB833, #E59900); border-color: #C48200;
        }

        .joy-block {
            background: #E0E0E0; border: 1px solid #B0B0B0; 
            border-radius: 6px; padding: 10px; 
            display: flex; flex-direction: column; gap: 8px;
        }
        .joy-header { font-size: 12px; font-weight: bold; text-align: center; color: #555; }
        .joy-settings { 
            display: flex; flex-wrap: wrap; justify-content: space-around; 
            font-size: 11px; color: #444; align-items: center; gap: 6px; 
            background: #D6D6D6; padding: 5px; border-radius: 4px; border: 1px solid #C0C0C0;
        }
        .joy-mappings { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }

        .joy-scene {
            width: 80px; height: 80px;
            margin: 0 auto;
            position: relative;
            perspective: 400px;
        }
        
        .joy-base {
            width: 70px; height: 70px;
            background: linear-gradient(135deg, #bbb, #999);
            border-radius: 50%;
            position: absolute; top: 5px; left: 5px;
            box-shadow: inset 1px 1px 5px rgba(0,0,0,0.4), 0 5px 10px rgba(0,0,0,0.2);
            border: 1px solid #888;
        }

        .joy-pivot {
            position: absolute; top: 50%; left: 50%;
            width: 0; height: 0;
            transform-style: preserve-3d;
        }

        .joy-cap {
            position: absolute;
            width: 40px; height: 40px;
            left: -20px; top: -20px;
            background: radial-gradient(circle at 30% 30%, #444, #111);
            border-radius: 50%;
            transform: translateZ(25px);
            box-shadow: 0 5px 10px rgba(0,0,0,0.5), inset 0 2px 3px rgba(255,255,255,0.1);
            border: 1px solid #000;
        }

        #modal-overlay {
            display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.4); z-index: 100; align-items: center; justify-content: center; padding: 10px;
        }
        .modal-box {
            background: #F0F0F0; padding: 15px; border-radius: 10px; border: 4px solid #B0B0B0;
            display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 600px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5); font-family: sans-serif;
        }
        .modal-box textarea {
            width: 100%; padding: 8px; background: white; color: #333; 
            border: 1px solid #AAA; height: 150px; resize: none; 
            font-family: monospace; font-size: 12px; border-radius: 4px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
        }
        .modal-btns { display: flex; justify-content: flex-end; gap: 10px; margin-top: 5px; }
        
        .mini-key {
            text-align: center; padding: 8px 4px; background: #FFF; border-radius: 4px; 
            cursor: pointer; font-size: 11px; border: 1px solid #CCC; color: #333; 
            box-shadow: 0 2px 0 #CCC; position: relative; top: 0; transition: top 0.1s, box-shadow 0.1s;
        }
        .mini-key:active { top: 2px; box-shadow: 0 0 0 #CCC; }
        .mini-key:hover { background: #F9F9F9; }
        .mini-key-active { background: linear-gradient(to bottom, #5CA0FF, #3D88F5); color: white; border-color: #3373CC; box-shadow: 0 2px 0 #3373CC; }
    `;
    shadow.appendChild(style);

    const kbLayout = [
        [{n:'1',c:'Digit1'},{n:'2',c:'Digit2'},{n:'3',c:'Digit3'},{n:'4',c:'Digit4'},{n:'5',c:'Digit5'},{n:'6',c:'Digit6'},{n:'7',c:'Digit7'},{n:'8',c:'Digit8'},{n:'9',c:'Digit9'},{n:'0',c:'Digit0'}],
        [{n:'Q',c:'KeyQ'},{n:'W',c:'KeyW'},{n:'E',c:'KeyE'},{n:'R',c:'KeyR'},{n:'T',c:'KeyT'},{n:'Y',c:'KeyY'},{n:'U',c:'KeyU'},{n:'I',c:'KeyI'},{n:'O',c:'KeyO'},{n:'P',c:'KeyP'}],
        [{n:'A',w:1.5,c:'KeyA'},{n:'S',c:'KeyS'},{n:'D',c:'KeyD'},{n:'F',c:'KeyF'},{n:'G',c:'KeyG'},{n:'H',c:'KeyH'},{n:'J',c:'KeyJ'},{n:'K',c:'KeyK'},{n:'L',c:'KeyL'}],
        [{n:'Z',w:2,c:'KeyZ'},{n:'X',c:'KeyX'},{n:'C',c:'KeyC'},{n:'V',c:'KeyV'},{n:'B',c:'KeyB'},{n:'N',c:'KeyN'},{n:'M',c:'KeyM'},{n:'↑',c:'ArrowUp'}],
        [{n:'Space',w:6,c:'Space'},{n:'←',c:'ArrowLeft'},{n:'↓',c:'ArrowDown'},{n:'→',c:'ArrowRight'}]
    ];

    let pulseTime = parseInt(localStorage.getItem('vkb_pulse_time')) || 200;

    const defaultExternalMapping = {
        button_0: 'Space', button_1: 'KeyR', button_2: 'KeyF', button_3: 'KeyE',
        button_4: 'Digit1', button_5: 'Digit2', button_6: 'Digit3', button_7: 'Digit4',
        button_8: 'Enter', button_9: 'KeyP', 
        button_12: 'ArrowUp', button_13: 'ArrowDown', button_14: 'ArrowLeft', button_15: 'ArrowRight',
        button_16: 'Escape',
        axis_0_negative: 'KeyA', axis_0_positive: 'KeyD', axis_1_negative: 'KeyW', axis_1_positive: 'KeyS',
        axis_2_negative: 'ArrowLeft', axis_2_positive: 'ArrowRight', axis_3_negative: 'ArrowUp', axis_3_positive: 'ArrowDown'
    };
    const defaultExternalSettings = { joystick_0: { analog: true, deadzone: 0.15, maxzone: 0.90 }, joystick_1: { analog: true, deadzone: 0.15, maxzone: 0.90 } };

    let externalMapping = JSON.parse(localStorage.getItem('vkb_external_mapping')) || JSON.parse(JSON.stringify(defaultExternalMapping));
    let externalSettings = JSON.parse(localStorage.getItem('vkb_external_settings')) || JSON.parse(JSON.stringify(defaultExternalSettings));

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'toggle-btn';
    toggleBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512">
            <path d="M192 64C86 64 0 150 0 256S86 448 192 448l256 0c106 0 192-86 192-192s-86-192-192-192L192 64zM496 168a40 40 0 1 1 0 80 40 40 0 1 1 0-80zM392 304a40 40 0 1 1 80 0 40 40 0 1 1 -80 0zM168 200c0-13.3 10.7-24 24-24s24 10.7 24 24l0 32 32 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-32 0 0 32c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-32-32 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l32 0 0-32z"/>
        </svg>
    `;
    shadow.appendChild(toggleBtn);

    const mainPopup = document.createElement('div');
    mainPopup.id = 'main-popup';
    mainPopup.innerHTML = `
        <div id="container">
            <div id="header">
                <span class="title">Controller Mapping</span>
                <span style="font-size:12px; margin-right:5px; color:#EEE;">Pulse (ms): <input type="number" id="pulse-ms" value="${pulseTime}" style="width:50px;"></span>
                <button id="io-btn" class="ui-btn" title="Import/Export Settings">Data</button>
                <button class="close-btn" id="close-main">✕</button>
            </div>
            
            <div id="ext-status">Listening for controller... Press any button.</div>
            
            <div id="ext-cols">
                <div id="ext-left" class="ext-col">
                    <div class="ext-col-title">Buttons</div>
                    <div id="ext-btn-list"></div>
                </div>
                <div id="ext-right" class="ext-col">
                    <div class="ext-col-title">Joysticks</div>
                    <div id="ext-joy-list"></div>
                </div>
            </div>

            <div id="modal-overlay">
                <div class="modal-box">
                    <h3 id="modal-title" style="margin:0; font-size:16px;"></h3>
                    <div id="modal-body"></div>
                    <div class="modal-btns">
                        <button id="modal-cancel" class="ui-btn">Cancel</button>
                        <button id="modal-save" class="ui-btn" style="background: linear-gradient(to bottom, #4C97FF, #2875E8); color: white; border-color: #3373CC;">Save</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    shadow.appendChild(mainPopup);

    mainPopup.addEventListener('pointerdown', e => {
        if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) e.preventDefault();
    });

    toggleBtn.addEventListener('click', () => { mainPopup.style.display = 'flex'; });
    shadow.getElementById('close-main').addEventListener('click', () => { mainPopup.style.display = 'none'; });
    mainPopup.addEventListener('click', e => { if (e.target === mainPopup) mainPopup.style.display = 'none'; });

    shadow.getElementById('pulse-ms').addEventListener('change', e => {
        pulseTime = parseInt(e.target.value) || 200; localStorage.setItem('vkb_pulse_time', pulseTime);
    });

    const modalOverlay = shadow.getElementById('modal-overlay');
    
    function openModal(title, html, onSave) {
        shadow.getElementById('modal-title').textContent = title;
        shadow.getElementById('modal-body').innerHTML = html;
        modalOverlay.style.display = 'flex';
        shadow.getElementById('modal-body').querySelectorAll('textarea, input, select').forEach(el => {
            el.addEventListener('keydown', e => e.stopPropagation()); el.addEventListener('keyup', e => e.stopPropagation());
        });
        const close = () => { modalOverlay.style.display = 'none'; if (modalOverlay._cleanup) modalOverlay._cleanup(); };
        shadow.getElementById('modal-save').onclick = () => { onSave(); close(); };
        shadow.getElementById('modal-cancel').onclick = close;
    }

    function showMappingModal(label, currentVal, onSaveCallback) {
        let kbHtml = '<div style="display:flex; flex-direction:column; gap:4px; max-height:280px; overflow-y:auto; padding:10px; background:#E0E0E0; border:1px solid #CCC; border-radius:6px; margin-top:10px;">';
        kbLayout.forEach(row => {
            kbHtml += '<div style="display:flex; gap:4px;">';
            row.forEach(key => {
                const flex = key.w || 1; 
                const activeClass = currentVal === key.c ? 'mini-key-active' : '';
                kbHtml += `<div class="mini-key ${activeClass}" data-code="${key.c}" style="flex:${flex};">${key.n}</div>`;
            });
            kbHtml += '</div>';
        });
        kbHtml += '</div>';

        const html = `
            <div style="font-size:13px; margin-bottom:10px; color:#666;">Press a key on your physical keyboard, or click one below:</div>
            <div style="display:flex; gap:10px; align-items:center;">
                <div style="flex:1; background:#FFF; padding:8px; border-radius:4px; text-align:center; font-family:monospace; font-weight:bold; font-size:14px; border:1px solid #CCC; color:#333;" id="map-current">${currentVal || 'Unmapped'}</div>
                <button id="map-clear" class="ui-btn" style="color:#C0392B;">Unmap</button>
            </div>
            ${kbHtml}
        `;
        
        let selectedCode = currentVal;
        const updateUI = (code) => {
            selectedCode = code; shadow.getElementById('map-current').textContent = code || 'Unmapped';
            shadow.querySelectorAll('.mini-key').forEach(k => { 
                if (k.dataset.code === code) k.classList.add('mini-key-active');
                else k.classList.remove('mini-key-active');
            });
        };

        const handlePhysicalKey = (e) => { e.preventDefault(); e.stopPropagation(); updateUI(e.code); };

        openModal(`Map: ${label}`, html, () => onSaveCallback(selectedCode));
        document.addEventListener('keydown', handlePhysicalKey, { capture: true });
        modalOverlay._cleanup = () => document.removeEventListener('keydown', handlePhysicalKey, { capture: true });

        shadow.getElementById('map-clear').onclick = () => updateUI('');
        shadow.querySelectorAll('.mini-key').forEach(k => k.onclick = () => updateUI(k.dataset.code));
    }

    shadow.getElementById('io-btn').addEventListener('click', () => {
        const data = JSON.stringify({ externalMapping, externalSettings, pulseTime }, null, 2);
        openModal('Import/Export Data', `<textarea id="io-text" spellcheck="false" placeholder="Leave blank or type {} to reset to defaults">${data}</textarea>`, () => {
            const textVal = shadow.getElementById('io-text').value.trim();
            if (!textVal || textVal === '{}') {
                externalMapping = JSON.parse(JSON.stringify(defaultExternalMapping)); 
                externalSettings = JSON.parse(JSON.stringify(defaultExternalSettings)); 
                pulseTime = 200;
                localStorage.setItem('vkb_external_mapping', JSON.stringify(externalMapping)); 
                localStorage.setItem('vkb_external_settings', JSON.stringify(externalSettings));
                localStorage.setItem('vkb_pulse_time', pulseTime); shadow.getElementById('pulse-ms').value = pulseTime;
                if (activeGpId !== null) renderExtView(navigator.getGamepads()[activeGpId]);
            } else {
                try {
                    const parsed = JSON.parse(textVal);
                    if (parsed.externalMapping) { externalMapping = parsed.externalMapping; localStorage.setItem('vkb_external_mapping', JSON.stringify(externalMapping)); }
                    if (parsed.externalSettings) { externalSettings = parsed.externalSettings; localStorage.setItem('vkb_external_settings', JSON.stringify(externalSettings)); }
                    if (parsed.pulseTime) { pulseTime = parsed.pulseTime; localStorage.setItem('vkb_pulse_time', pulseTime); shadow.getElementById('pulse-ms').value = pulseTime; }
                    if (activeGpId !== null) renderExtView(navigator.getGamepads()[activeGpId]);
                } catch (e) { alert("Invalid JSON!"); }
            }
        });
    });

    let activeGpId = null;
    let externalDomNodes = {};
    let activePollKeys = new Set();

    const externalStatus = shadow.getElementById('ext-status');
    const externalButtonList = shadow.getElementById('ext-btn-list');
    const externalJoystickList = shadow.getElementById('ext-joy-list');

    function saveExternalSettings() { localStorage.setItem('vkb_external_settings', JSON.stringify(externalSettings)); }

    function renderExtView(gp) {
        externalDomNodes = {};
        if (!gp) { externalStatus.textContent = 'Listening for controller... Press any button.'; externalButtonList.innerHTML = ''; externalJoystickList.innerHTML = ''; return; }
        externalStatus.textContent = `Active: ${gp.id}`; externalButtonList.innerHTML = ''; externalJoystickList.innerHTML = '';

        const createMapUI = (id, label, parent) => {
            const div = document.createElement('div'); div.className = 'ext-map-item';
            div.innerHTML = `<span>${label}</span> <span>[${externalMapping[id] || '...'}]</span>`;
            div.onclick = () => showMappingModal(label, externalMapping[id] || '', val => { 
                if (val==='') delete externalMapping[id]; else externalMapping[id] = val; 
                localStorage.setItem('vkb_external_mapping', JSON.stringify(externalMapping)); renderExtView(gp); 
            });
            parent.appendChild(div); externalDomNodes[id] = div;
        };

        for (let i=0; i<gp.buttons.length; i++) createMapUI(`button_${i}`, `Button ${i}`, externalButtonList);

        const numSticks = Math.floor(gp.axes.length / 2);
        for (let s=0; s<numSticks; s++) {
            externalSettings[`joystick_${s}`] = externalSettings[`joystick_${s}`] || { analog: true, deadzone: 0.15, maxzone: 0.90 };
            const set = externalSettings[`joystick_${s}`];
            const block = document.createElement('div'); block.className = 'joy-block';
            block.innerHTML = `
                <div class="joy-header">Joystick ${s}</div>
                <div class="joy-scene">
                    <div class="joy-base"></div>
                    <div class="joy-pivot" id="ext-vis-joy-${s}">
                        <div class="joy-cap"></div>
                    </div>
                </div>
                <div class="joy-settings">
                    <label><input type="checkbox" id="joystick-analog-${s}" ${set.analog?'checked':''}> Analog</label>
                    <label>Deadzone: <input type="number" step="0.05" id="joystick-deadzone-${s}" value="${set.deadzone}"></label>
                    <label>Max Zone: <input type="number" step="0.05" id="joystick-maxzone-${s}" value="${set.maxzone}"></label>
                </div>
                <div class="joy-mappings" id="jm-${s}"></div>
            `;
            externalJoystickList.appendChild(block); externalDomNodes[`dpad_${s}`] = block.querySelector(`#ext-vis-joy-${s}`);
            
            block.querySelector(`#joystick-analog-${s}`).onchange = e => { set.analog = e.target.checked; saveExternalSettings(); };
            block.querySelector(`#joystick-deadzone-${s}`).onchange = e => { set.deadzone = parseFloat(e.target.value)||0; saveExternalSettings(); };
            block.querySelector(`#joystick-maxzone-${s}`).onchange = e => { set.maxzone = parseFloat(e.target.value)||1; saveExternalSettings(); };
            
            const mapContainer = block.querySelector(`#jm-${s}`);
            createMapUI(`axis_${s*2+1}_negative`, `Up`, mapContainer); 
            createMapUI(`axis_${s*2+1}_positive`, `Down`, mapContainer);
            createMapUI(`axis_${s*2}_negative`, `Left`, mapContainer); 
            createMapUI(`axis_${s*2}_positive`, `Right`, mapContainer);
        }
    }

    function toggleExternalUI(id, active) { 
        if (externalDomNodes[id]) externalDomNodes[id].classList.toggle('active-ext', active); 
    }

    function dispatchMapped(code, type) {
        if (!code) return; let char = code.startsWith('Key') ? code.charAt(3).toLowerCase() : (code === 'Space' ? ' ' : '');
        (document.activeElement || document.body).dispatchEvent(new KeyboardEvent(type, { key: char || code, code: code, bubbles: true, cancelable: true, composed: true }));
    }

    function masterPollLoop() {
        let keysToPressThisFrame = new Set();
        let uiToHighlight = new Set();
        
        const cycleLength = pulseTime;
        const cyclePos = performance.now() % cycleLength;

        const gps = navigator.getGamepads();
        let found = false, activeGp = null;

        for (const g of gps) {
            if (!g) continue;
            let active = false;
            for (let i=0; i<g.buttons.length; i++) { if (g.buttons[i].pressed) active = true; }
            for (let i=0; i<g.axes.length; i++) { if (Math.abs(g.axes[i]) > 0.1) active = true; }
            
            if (active && activeGpId !== g.index) { activeGpId = g.index; renderExtView(g); }
            if (g.index === activeGpId) { found = true; activeGp = g; break; }
        }

        if (found && activeGp) {
            for (let i=0; i<activeGp.buttons.length; i++) {
                if (activeGp.buttons[i].pressed) {
                    const code = externalMapping[`button_${i}`]; 
                    if (code) keysToPressThisFrame.add(code); 
                    uiToHighlight.add(`button_${i}`);
                }
            }
            const numSticks = Math.floor(activeGp.axes.length / 2);
            for (let s=0; s<numSticks; s++) {
                const ax = activeGp.axes[s*2], ay = activeGp.axes[s*2+1];
                const set = externalSettings[`joystick_${s}`] || { analog: true, deadzone: 0.15, maxzone: 0.90 };
                
                if (externalDomNodes[`dpad_${s}`]) {
                    externalDomNodes[`dpad_${s}`].style.transform = `rotateX(${-ay * 35}deg) rotateY(${ax * 35}deg)`;
                }

                let absX = Math.abs(ax), absY = Math.abs(ay);
                let nx = absX > set.deadzone ? Math.min(1, (absX - set.deadzone) / (set.maxzone - set.deadzone)) : 0;
                let ny = absY > set.deadzone ? Math.min(1, (absY - set.deadzone) / (set.maxzone - set.deadzone)) : 0;

                let downX = false, downY = false; let dirX = 0, dirY = 0;
                
                if (set.analog) {
                    downX = cyclePos < nx * cycleLength; downY = cyclePos < ny * cycleLength;
                    dirX = ax < 0 ? -1 : 1; dirY = ay < 0 ? -1 : 1;
                } else {
                    if (Math.hypot(ax, ay) > set.deadzone) {
                        const ang = Math.atan2(ay, ax) * 180 / Math.PI;
                        if (ang > -30 && ang <= 30) { downX = true; dirX = 1; }
                        else if (ang > 30 && ang <= 60) { downX = true; dirX = 1; downY = true; dirY = 1; }
                        else if (ang > 60 && ang <= 120) { downY = true; dirY = 1; }
                        else if (ang > 120 && ang <= 150) { downX = true; dirX = -1; downY = true; dirY = 1; }
                        else if (ang > 150 || ang <= -150) { downX = true; dirX = -1; }
                        else if (ang > -150 && ang <= -120) { downX = true; dirX = -1; downY = true; dirY = -1; }
                        else if (ang > -120 && ang <= -60) { downY = true; dirY = -1; }
                        else if (ang > -60 && ang <= -30) { downX = true; dirX = 1; downY = true; dirY = -1; }
                    }
                }

                if (downX && dirX === -1) { const c = externalMapping[`axis_${s*2}_negative`]; if (c) keysToPressThisFrame.add(c); if(nx>0) uiToHighlight.add(`axis_${s*2}_negative`); }
                if (downX && dirX === 1) { const c = externalMapping[`axis_${s*2}_positive`]; if (c) keysToPressThisFrame.add(c); if(nx>0) uiToHighlight.add(`axis_${s*2}_positive`); }
                if (downY && dirY === -1) { const c = externalMapping[`axis_${s*2+1}_negative`]; if (c) keysToPressThisFrame.add(c); if(ny>0) uiToHighlight.add(`axis_${s*2+1}_negative`); }
                if (downY && dirY === 1) { const c = externalMapping[`axis_${s*2+1}_positive`]; if (c) keysToPressThisFrame.add(c); if(ny>0) uiToHighlight.add(`axis_${s*2+1}_positive`); }
            }
            Object.keys(externalDomNodes).forEach(id => { 
                if (id.startsWith('button_') || id.startsWith('axis_')) toggleExternalUI(id, uiToHighlight.has(id)); 
            });
        } else if (!found && activeGpId !== null) { activeGpId = null; renderExtView(null); }

        for (const code of keysToPressThisFrame) {
            if (!activePollKeys.has(code)) { dispatchMapped(code, 'keydown'); activePollKeys.add(code); }
        }
        for (const code of[...activePollKeys]) {
            if (!keysToPressThisFrame.has(code)) { dispatchMapped(code, 'keyup'); activePollKeys.delete(code); }
        }
        requestAnimationFrame(masterPollLoop);
    }
    requestAnimationFrame(masterPollLoop);
})();
