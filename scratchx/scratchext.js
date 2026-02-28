// scratch_ext.js
// Shane M. Clements, November 2013
// ScratchExtensions

// Scratch 2.0 extension manager which Scratch communicates with to initialize extensions and communicate with them.
// The extension manager also handles creating the browser plugin to enable access to HID and serial devices.

window.ScratchExtensions = new (function () {
    var plugin = null;
    var handlers = {};
    var blockDefs = {};
    var menuDefs = {};
    var deviceSpecs = {};
    var devices = {};
    var poller = null;
    var lib = this;

    var isOffline = Scratch && Scratch.FlashApp && Scratch.FlashApp.ASobj &&
        Scratch.FlashApp.ASobj.isOffline && Scratch.FlashApp.ASobj.isOffline();
    var pluginAvailable = function () {
        return !!window.ArrayBuffer && !!(
                isOffline ||
                (window.ScratchPlugin && window.ScratchPlugin.isAvailable()) ||
                (window.ScratchDeviceHost && window.ScratchDeviceHost.isAvailable())
            );
    };

    lib.register = function (name, descriptor, handler, deviceSpec) {
        if (name in handlers) {
            console.log('Scratch extension "' + name + '" already exists!');
            return false;
        }

        handlers[name] = handler;
        blockDefs[name] = descriptor.blocks;
        if (descriptor.menus) menuDefs[name] = descriptor.menus;
        if (deviceSpec) deviceSpecs[name] = deviceSpec;

        // Show the blocks in Scratch!
        var extObj = {
            extensionName: name,
            blockSpecs: descriptor.blocks,
            url: descriptor.url,
            menus: descriptor.menus,
            javascriptURL: loadingURL
        };
        Scratch.FlashApp.ASobj.ASloadExtension(extObj);

        if (deviceSpec) {
            if (!plugin) {
                if (pluginAvailable()) {
                    // createDevicePlugin() will eventually call checkPolling() if it succeeds
                    setTimeout(createDevicePlugin, 10);
                } else if (ScratchDeviceManager) {
                    // No plugin is NBD if we're using the SDM
                    checkPolling();
                } else if (window.ScratchPlugin.useActiveX) {
                    JSsetProjectBanner('Sorry, your version of Internet Explorer is not supported.  Please upgrade to version 10 or 11.');
                }
            }
            else {
                // Second hardware-using project in the same tab
                checkPolling();
            }
        }

        return true;
    };

    var loadingURL;
    lib.loadExternalJS = function (url) {
        var scr = document.createElement("script");
        scr.src = url;// + "?ts=" + new Date().getTime();
        loadingURL = url;
        document.getElementsByTagName("head")[0].appendChild(scr);
    };

    lib.loadLocalJS = function (code) {
        // Run the extension code in the global scope
        try {
            (new Function(code))();
        } catch (e) {
            console.log(e.stack.toString());
        }
    };

    lib.unregister = function (name) {
        try {
            handlers[name]._shutdown();
        } catch (e) {
        }
        delete handlers[name];
        delete blockDefs[name];
        delete menuDefs[name];
        delete deviceSpecs[name];
    };

    lib.canAccessDevices = function () {
        return pluginAvailable();
    };

    lib.getReporter = function (ext_name, reporter, args) {
        return handlers[ext_name][reporter].apply(handlers[ext_name], args);
    };

    lib.getReporterAsync = function (ext_name, reporter, args, job_id) {
        var callback = function (retval) {
            Scratch.FlashApp.ASobj.ASextensionReporterDone(ext_name, job_id, retval);
        };
        if(handlers[ext_name]._getStatus().status != 2){
            callback(false); 
        }
        else{
            args.push(callback);
            handlers[ext_name][reporter].apply(handlers[ext_name], args);
        }
    };

    lib.getReporterForceAsync = function (ext_name, reporter, args, job_id) {
        var retval = handlers[ext_name][reporter].apply(handlers[ext_name], args);
        Scratch.FlashApp.ASobj.ASextensionReporterDone(ext_name, job_id, retval);
    };

    lib.runCommand = function (ext_name, command, args) {
        handlers[ext_name][command].apply(handlers[ext_name], args);
    };

    lib.runAsync = function (ext_name, command, args, job_id) {
        var callback = function () {
            Scratch.FlashApp.ASobj.ASextensionCallDone(ext_name, job_id);
        };
        args.push(callback);
        handlers[ext_name][command].apply(handlers[ext_name], args);
    };

    lib.getStatus = function (ext_name) {
        if (!(ext_name in handlers)) {
            return {status: 0, msg: 'Not loaded'};
        }

        if (ext_name in deviceSpecs) {
            switch (deviceSpecs[ext_name].type) {
                case 'ble':
                case 'wedo2':
                    if (!(ScratchDeviceManager && ScratchDeviceManager.isConnected())) {
                        return {status: 0, msg: 'Missing Scratch Device Manager'};
                    }
                    break;
                default:
                    if (!pluginAvailable()) {
                        return {status: 0, msg: 'Missing browser plugin'};
                    }
                    break;
            }
        }

        return handlers[ext_name]._getStatus();
    };

    lib.stop = function (ext_name) {
        var ext = handlers[ext_name];
        if (ext._stop) {
            ext._stop();
        }
        else if (ext.resetAll) { // old, undocumented call
            ext.resetAll();
        }
    };

    lib.notify = function (text) {
        if (window.JSsetProjectBanner) {
            JSsetProjectBanner(text);
        } else {
            alert(text);
        }
    };

    lib.resetPlugin = function () {
        if (plugin && plugin.reset) plugin.reset();
        shutdown();
    };

    $(window).unload(function (e) {
        shutdown();
    });

    function shutdown() {
        for (var extName in handlers) {
            handlers[extName]._shutdown();
        }
        handlers = {};
        stopPolling();
    }

    function checkDevices() {
        var awaitingSpecs = {};
        var ext_name;
        for (ext_name in deviceSpecs) {
            if (!devices[ext_name]) {
                var spec = deviceSpecs[ext_name];
                if (spec.type == 'hid') {
                    if (!awaitingSpecs['hid']) awaitingSpecs['hid'] = {};
                    awaitingSpecs['hid'][spec.vendor + '_' + spec.product] = ext_name;
                }
                else {
                    awaitingSpecs[spec.type] = ext_name;
                }
            }
        }

        for (var specType in awaitingSpecs) {
            if (!awaitingSpecs.hasOwnProperty(specType)) continue;

            if (plugin && specType == 'hid') {
                var awaitingHid = awaitingSpecs['hid'];
                plugin.hid_list(function (deviceList) {
                    for (var i = 0; i < deviceList.length; i++) {
                        var deviceID = deviceList[i]["vendor_id"] + '_' + deviceList[i]["product_id"];
                        var hid_ext_name = awaitingHid[deviceID];
                        if (hid_ext_name) {
                            handlers[hid_ext_name]._deviceConnected(new HidDevice(deviceList[i], hid_ext_name));
                        }
                    }
                });
            }
            else if (plugin && specType == 'serial') {
                ext_name = awaitingSpecs['serial'];
                plugin.serial_list(function (deviceList) {
                    for (var i = 0; i < deviceList.length; i++) {
                        handlers[ext_name]._deviceConnected(new SerialDevice(deviceList[i], ext_name));
                    }
                });
            }
            else if (ScratchDeviceManager) {
                ext_name = awaitingSpecs[specType];
                ScratchDeviceManager.device_list(specType, ext_name, deviceSpecs[ext_name], deviceListCallback);
            }
        }

        if (!shouldLookForDevices()) {
            stopPolling();
        }
    }

    function deviceListCallback(deviceList, ext_type, ext_name) {
        for (var i = 0; i < deviceList.length; ++i) {
            var deviceConstructor = Devices[ext_type];
            var deviceId = deviceList[i].id || deviceList[i];
            var device = new deviceConstructor(deviceId, ext_type, ext_name);
            handlers[ext_name]._deviceConnected(device);
        }
    }

    function checkPolling() {
        if (poller || !shouldLookForDevices()) return;

        poller = setInterval(checkDevices, 500);
    }

    function stopPolling() {
        if (poller) clearInterval(poller);
        poller = null;
    }

    function shouldLookForDevices() {
        for (var ext_name in deviceSpecs) {
            if (!devices[ext_name]) {
                return true;
            }
        }

        return false;
    }

    function createDevicePlugin() {
        if (plugin) return;

        try {
            // TODO: delegate more of this to the other files
            if (isOffline) {
                // Talk to the AIR Native Extension through the offline editor's plugin emulation.
                plugin = Scratch.FlashApp.ASobj.getPlugin();
            } else if (window.ScratchDeviceHost && window.ScratchDeviceHost.isAvailable()) {
                // Talk to the Native Messaging Host through a Chrome extension.
                plugin = window.ScratchDeviceHost;
            } else {
                if (window.ScratchPlugin.useActiveX) {
                    // we must be on IE or similar
                    plugin = new ActiveXObject(window.ScratchPlugin.axObjectName);
                } else {
                    // Not IE: try NPAPI
                    var pluginContainer = document.createElement('div');
                    document.getElementById('scratch').parentNode.appendChild(pluginContainer);
                    pluginContainer.innerHTML =
                        '<object type="application/x-scratchdeviceplugin" width="1" height="1"> </object>';
                    plugin = pluginContainer.firstChild;
                }
                // Talk to the actual plugin, but make it pretend to be asynchronous.
                plugin = new window.ScratchPlugin.PluginWrapper(plugin);
            }
        }
        catch (e) {
            console.error('Error creating plugin or wrapper:', e);
            plugin = null;
        }

        // Wait a moment to access the plugin and claim any devices that plugins are
        // interested in.
        setTimeout(checkPolling, 100);
    }

    function HidDevice(info, ext_name) {
        var dev = null;
        var self = this;

        // TODO: add support for multiple devices per extension
        //if(!(ext_name in devices)) devices[ext_name] = {};

        this.id = info["path"];
        this.info = info;

        function disconnect() {
            setTimeout(function () {
                self.close();
                handlers[ext_name]._deviceRemoved(self);
            }, 0);
        }

        this.open = function (readyCallback) {
            plugin.hid_open(self.id, function (d) {
                dev = d;
                if (dev) {
                    devices[ext_name] = self;
                    dev.set_nonblocking(true);
                }
                if (readyCallback) readyCallback(d ? self : null);
            });
        };
        this.close = function () {
            if (!dev) return;
            dev.close();
            delete devices[ext_name];
            dev = null;

            checkPolling();
        };
        this.write = function (data, callback) {
            if (!dev) return;
            dev.write(data, function (len) {
                if (len < 0) disconnect();
                if (callback) callback(len);
            });
        };
        this.read = function (callback, len) {
            if (!dev) return null;
            if (!len) len = 65;
            dev.read(len, function (data) {
                if (data.byteLength == 0) disconnect();
                callback(data);
            });
        };
    }

    function SerialDevice(id, ext_name) {
        var dev = null;
        var self = this;

        // TODO: add support for multiple devices per extension
        //if(!(ext_name in devices)) devices[ext_name] = {};

        this.id = id;
        this.open = function (opts, readyCallback) {
            plugin.serial_open(self.id, opts, function (d) {
                dev = d;
                if (dev) {
                    devices[ext_name] = self;
                    dev.set_error_handler(function (message) {
                        console.log('Serial device error\nDevice: ' + id + '\nError: ' + message);
                    });
                }
                if (readyCallback) readyCallback(d ? self : null);
            });
        };
        this.close = function () {
            if (!dev) return;
            dev.close();
            delete devices[ext_name];
            dev = null;

            checkPolling();
        };
        this.send = function (data) {
            if (!dev) return;
            dev.send(data);
        };
        this.set_receive_handler = function (handler) {
            if (!dev) return;
            dev.set_receive_handler(handler);
        };
    }

    function WeDo2Device(id, ext_type, ext_name) {
        var dev = null;
        this.ext_type = ext_type;
        this.ext_name = ext_name;
        var self = this;
        this.id = id;

        function RawWeDo2(deviceId, socket) {
            var WeDo = this;
            var eventHandlers = {};
    
            WeDo.close = function() {
                socket.close();
            };
    
            WeDo.setMotorOn = function(motorIndex, power) {
                socket.emit('motorOn', {motorIndex:motorIndex, power:power});
            };
    
            WeDo.setMotorOff = function(motorIndex) {
                socket.emit('motorOff', {motorIndex:motorIndex});
            };
    
            WeDo.setMotorBrake = function(motorIndex) {
                socket.emit('motorBrake', {motorIndex:motorIndex});
            };
    
            WeDo.setLED = function(rgb) {
                socket.emit('setLED', {rgb:rgb});
            };
    
            WeDo.playTone = function(tone, durationMs) {
                socket.emit('playTone', {tone:tone, ms:durationMs});
            };
    
            WeDo.stopTone = function() {
                socket.emit('stopTone');
            };
    
            function setHandler(eventName, handler) {
                if (eventHandlers.hasOwnProperty(eventName)) {
                    var oldHandler = eventHandlers[eventName];
                    if (oldHandler) {
                        socket.removeListener(eventName, oldHandler);
                    }
                }
                if (handler) {
                    socket.on(eventName, handler);
                }
                eventHandlers[eventName] = handler;
            }
    
            // function handler(event) { access event.sensorName and event.sensorValue }
            WeDo.setSensorHandler = function (handler) {
                setHandler('sensorChanged', handler);
            };
    
            WeDo.setDeviceWasClosedHandler = function (handler) {
                // TODO: resolve this ambiguity
                setHandler('disconnect', handler);
                setHandler('deviceWasClosed', handler);
            };
        }

        function disconnect() {
            setTimeout(function () {
                self.close();
                handlers[ext_name]._deviceRemoved(self);
            }, 0);
        }

        this.is_open = function() {
            return !!dev;
        };

        this.open = function(readyCallback) {
            ScratchDeviceManager.socket_open(self.ext_name, self.ext_type, self.id, function(socket) {
                if (socket) {
                    dev = new RawWeDo2(self.id, socket);
                    devices[ext_name] = self;
                    dev.setDeviceWasClosedHandler(disconnect);
                }
                else {
                    dev = null;
                    disconnect();
                }
                if (readyCallback) {
                    readyCallback(dev ? self : null);
                }
            });
        };

        this.close = function() {
            if (!dev) return;
            dev.close();
            delete devices[ext_name];
            dev = null;

            checkPolling();
        };

        // The `handler` should be a function like: function handler(event) {...}
        // The `event` will contain properties called `sensorName` and `sensorValue`.
        // Sensor names include `tilt` and `distance`.
        this.set_sensor_handler = function(handler) {
            if (!dev) return;
            dev.setSensorHandler(handler);
        };

        // Starts motor at given power, 0-100. Use negative power for reverse.
        this.set_motor_on = function(motorIndex, power) {
            dev.setMotorOn(motorIndex, power);
        };
        // Applies active braking.
        this.set_motor_brake = function(motorIndex) {
            dev.setMotorBrake(motorIndex);
        };
        // Turns motor off. Depending on power and load, the motor will drift to a stop.
        this.set_motor_off = function(motorIndex) {
            dev.setMotorOff(motorIndex);
        };

        // Sets the RGB LED color. The RGB color should be specified in 0xRRGGBB format.
        this.set_led = function(rgb) {
            dev.setLED(rgb);
        };

        this.play_tone = function(tone, durationMs) {
            dev.playTone(tone, durationMs);
        };
        this.stop_tone = function() {
            dev.stopTone();
        };
    }


    function BleDevice(id, ext_type, ext_name) {
        var self = this;
        this.ext_name = ext_name;
        this.ext_type = ext_type;
        this.socket = null;

        this.id = id;

        var onActions = [];
        var onceActions = [];

        function disconnect() {
            setTimeout(function () {
                self.close();
                handlers[self.ext_name]._deviceRemoved(self);
            }, 0);
        }

        this.emit = function(action, data){
            if(self.socket){
                self.socket.emit(action, data);
            }
            return !!self.socket;
        };

        this.on = function(action, callback){
            if(self.is_open()){
                self.socket.on(action, callback);
            }
            else{
                onActions.push([action, callback]);
            }
        };

        this.once = function(action, callback){
            if(self.is_open()){
                self.socket.once(action, callback);
            }
            else{
                onceActions.push([action, callback]);
            }
        };

        this.open = function(readyCallback) {
            ScratchDeviceManager.socket_open(self.ext_name, ext_type, self.id, function(s) {
                self.socket = s; 
                if (self.socket) {
                    devices[self.ext_name] = self;
                    onActions.forEach(function(element){ 
                        self.socket.on(element[0], element[1]);
                    });
                    onceActions.forEach(function(element){
                        self.socket.once(element[0], element[1]);
                    });

                    self.socket.on('disconnect', disconnect);
                    self.socket.on('deviceWasClosed', disconnect);

                }
                if (readyCallback) readyCallback(self.socket ? self : null);
            });
        };

        this.close = function() {
            if (!self.socket) return;
            self.socket.close();
            delete devices[self.ext_name];
            self.socket = null;

            checkPolling();
        };

        this.is_open = function() {
            return !!self.socket;
        };

    }
    Devices = {ble: BleDevice, wedo2: WeDo2Device};
})();



// Basic Scratch3 extension suport
(function(global) {
    'use strict';

    global.Scratch = global.Scratch || {};

    const mouseState = {
        x: 0,
        y: 0,
        isDown: false,
        buttons: 0
    };

    const keyState = {};

    const getCanvas = () => {
        const ruffle = document.querySelector('ruffle-player');
        if (ruffle && ruffle.shadowRoot) {
            return ruffle.shadowRoot.querySelector('canvas');
        }
        if (ruffle && ruffle.querySelector) {
            return ruffle.querySelector('canvas');
        }
        return document.getElementsByTagName('canvas')[0] || null;
    };

    const updateMouse = (e) => {
        const canvas = getCanvas();
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = 480 / rect.width;
        const scaleY = 360 / rect.height;

        const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
        const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

        mouseState.x = (clientX - rect.left) * scaleX - 240;
        mouseState.y = 180 - (clientY - rect.top) * scaleY;
        
        mouseState.x = Math.max(-240, Math.min(240, mouseState.x));
        mouseState.y = Math.max(-180, Math.min(180, mouseState.y));
    };

    window.addEventListener('mousemove', updateMouse);
    window.addEventListener('mousedown', (e) => {
        mouseState.isDown = true;
        mouseState.buttons = e.buttons;
        updateMouse(e);
    });
    window.addEventListener('mouseup', (e) => {
        mouseState.isDown = false;
        mouseState.buttons = e.buttons;
        updateMouse(e);
    });
    window.addEventListener('touchstart', (e) => {
        mouseState.isDown = true;
        updateMouse(e);
    }, {passive: true});
    window.addEventListener('touchend', () => {
        mouseState.isDown = false;
    });

    window.addEventListener('keydown', (e) => {
        keyState[e.key] = true;
        keyState[e.code] = true;
    });
    window.addEventListener('keyup', (e) => {
        keyState[e.key] = false;
        keyState[e.code] = false;
    });

    class VideoDevice {
        constructor() {
            this._stream = null;
            this._video = null;
            this.provider = null; 
        }

        get videoReady() {
            return !!this._stream;
        }

        enableVideo() {
            if (this._stream) return Promise.resolve(this._stream);
            return navigator.mediaDevices.getUserMedia({ video: true })
                .then(stream => {
                    this._stream = stream;
                    this._video = document.createElement('video');
                    this._video.srcObject = stream;
                    this._video.play();
                    return stream;
                })
                .catch(e => {
                    console.warn('Video access denied', e);
                    return null;
                });
        }

        disableVideo() {
            if (this._stream) {
                this._stream.getTracks().forEach(t => t.stop());
                this._stream = null;
            }
            this._video = null;
        }

        getFrame({ format = 'canvas' } = {}) {
            if (!this._video) return null;
            if (format === 'image-data') {
                const c = document.createElement('canvas');
                c.width = 480;
                c.height = 360;
                const ctx = c.getContext('2d');
                ctx.drawImage(this._video, 0, 0, 480, 360);
                return ctx.getImageData(0, 0, 480, 360);
            }
            return this._video;
        }
    }

    const videoDeviceInstance = new VideoDevice();

    const S3API = {
        BlockType: {
            COMMAND: 'command', REPORTER: 'reporter', BOOLEAN: 'boolean',
            HAT: 'hat', EVENT: 'event', LOOP: 'loop', CONDITIONAL: 'conditional', BUTTON: 'button'
        },
        ArgumentType: {
            STRING: 'string', NUMBER: 'number', BOOLEAN: 'boolean',
            COLOR: 'color', ANGLE: 'angle', MATRIX: 'matrix', NOTE: 'note', IMAGE: 'image'
        },
        extensions: {
            unsandboxed: true,
        },
        Cast: {
            toString: v => String(v),
            toNumber: v => {
                const n = Number(v);
                return isNaN(n) ? 0 : n;
            },
            toBoolean: v => {
                if (typeof v === 'boolean') return v;
                if (typeof v === 'string') {
                    if (v === '' || v === '0' || v.toLowerCase() === 'false') return false;
                    return true;
                }
                return !!v;
            },
            compare: (v1, v2) => {
                const n1 = Number(v1), n2 = Number(v2);
                if (!isNaN(n1) && !isNaN(n2)) return n1 - n2;
                return String(v1).localeCompare(String(v2));
            },
            isInt: v => !isNaN(v) && (parseFloat(v) | 0) === parseFloat(v),
            isWhiteSpace: v => v === null || v.trim().length === 0,
            toListIndex: (index, length, acceptAll) => {
                if (typeof index !== 'number') {
                    if (index === 'last') return length;
                    if (index === 'random') return Math.floor(Math.random() * length) + 1;
                    if (acceptAll && index === 'all') return 'all';
                    index = Number(index);
                }
                index = Math.floor(index);
                if (index < 1 || index > length) return 0;
                return index;
            },
            toRgbColorList: (hex) => {
                const hexValue = parseInt(hex.replace('#', ''), 16);
                return [(hexValue >> 16) & 0xFF, (hexValue >> 8) & 0xFF, hexValue & 0xFF];
            },
            toRgbColorObject: (hex) => {
                const [r, g, b] = S3API.Cast.toRgbColorList(hex);
                return { r, g, b, a: 255 };
            }
        },
        fetch: (url, opts) => window.fetch(url, opts),
        canFetch: () => true,
        openWindow: (url) => window.open(url, '_blank'),
        redirect: (url) => window.location.href = url,
        vm: {
            runtime: {
                startHats: () => {},
                stopAll: () => {},
                on: () => {},
                emit: () => {},
                ioDevices: {
                    clock: { projectTimer: () => (Date.now() / 1000) },
                    mouse: {
                        getScratchX: () => mouseState.x,
                        getScratchY: () => mouseState.y,
                        getIsDown: () => mouseState.isDown,
                        get x() { return mouseState.x; },
                        get y() { return mouseState.y; },
                        get isDown() { return mouseState.isDown; }
                    },
                    keyboard: {
                        getKeyIsDown: (key) => !!(keyState[key] || keyState[key.toLowerCase()])
                    },
                    video: videoDeviceInstance
                },
                get renderer() {
                    return {
                        get canvas() { return getCanvas(); }
                    };
                }
            },
            renderer: {
                get canvas() { return getCanvas(); }
            },
            on: () => {}
        },
        runtime: {
            on: () => {},
            emit: () => {},
            startHats: () => {},
            ioDevices: {
                clock: { projectTimer: () => (Date.now() / 1000) },
                mouse: {
                    getScratchX: () => mouseState.x,
                    getScratchY: () => mouseState.y,
                    getIsDown: () => mouseState.isDown,
                    get x() { return mouseState.x; },
                    get y() { return mouseState.y; },
                    get isDown() { return mouseState.isDown; }
                },
                keyboard: {
                    getKeyIsDown: (key) => !!(keyState[key] || keyState[key.toLowerCase()])
                },
                video: videoDeviceInstance
            }
        },
        renderer: {
            get canvas() { return getCanvas(); }
        },
        audioEngine: {},
        translate: (t) => t,
    };

    S3API.translate.setup = () => {};

    Object.assign(global.Scratch, S3API);

    function showS2Notification(title, message) {
        const id = 's2-notification-' + Date.now();
        const div = document.createElement('div');
        
        Object.assign(div.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '300px',
            background: 'linear-gradient(to bottom, #fcfcfc 0%, #d0d0d0 100%)',
            border: '1px solid #999',
            borderRadius: '8px',
            boxShadow: '0px 4px 10px rgba(0,0,0,0.3)',
            padding: '10px',
            fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
            fontSize: '13px',
            color: '#333',
            zIndex: '10000',
            opacity: '0',
            transition: 'opacity 0.5s ease',
            pointerEvents: 'none'
        });

        div.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px; color: #444; border-bottom: 1px solid #bbb; padding-bottom: 5px;">
                ${title}
            </div>
            <div>${message}</div>
        `;

        document.body.appendChild(div);

        setTimeout(() => { div.style.opacity = '1'; }, 50);

        setTimeout(() => {
            div.style.opacity = '0';
            setTimeout(() => document.body.removeChild(div), 500);
        }, 5000);
    }

    Scratch.extensions.register = function(extensionInstance) {
        let currentBlockJSON = '';
        let pollingInterval = null;

        const updateExtension = () => {
            const info = extensionInstance.getInfo();
            const visibleBlocks = info.blocks.filter(b => {
                if (typeof b !== 'object') return true;
                return !b.hide && !b.hideFromPalette;
            });

            const newBlockJSON = JSON.stringify(visibleBlocks);
            if (newBlockJSON === currentBlockJSON) return;
            currentBlockJSON = newBlockJSON;

            const s2Descriptor = {
                blocks: [],
                menus: info.menus || {},
                url: info.docsURI || null
            };
            const s2Ext = {};

            if (s2Descriptor.menus) {
                for (const key in s2Descriptor.menus) {
                    const m = s2Descriptor.menus[key];
                    if (m.items) s2Descriptor.menus[key] = m.items;
                    else if (typeof m === 'function') s2Descriptor.menus[key] = m();
                }
            }

            const parseBlockText = (text, args) => {
                const argOrder = [];
                const s2Text = text.replace(/\[([^\]]+)\]/g, (match, argName) => {
                    argOrder.push(argName);
                    const argDef = args[argName] || {};
                    
                    if (argDef.menu) return `%m.${argDef.menu}`;
                    if (argDef.type === S3API.ArgumentType.NUMBER) return `%n`;
                    if (argDef.type === S3API.ArgumentType.BOOLEAN) return `%b`;
                    if (argDef.type === S3API.ArgumentType.COLOR) return `%c`;
                    
                    return `%s`;
                });
                return { s2Text, argOrder };
            };

            info.blocks.forEach(block => {
                if (typeof block === 'object') {
                    if (block.hide || block.hideFromPalette) return;

                    const { s2Text, argOrder } = parseBlockText(block.text, block.arguments || {});

                    let s2Type = 'err';
                    if (block.blockType === S3API.BlockType.COMMAND) s2Type = 'w';
                    else if (block.blockType === S3API.BlockType.REPORTER) s2Type = 'R';
                    else if (block.blockType === S3API.BlockType.BOOLEAN) s2Type = 'b';
                    else if (block.blockType === S3API.BlockType.HAT) s2Type = 'h';
                    else if (block.blockType === S3API.BlockType.EVENT) s2Type = 'h';
                    
                    const blockEntry = [s2Type, s2Text, block.opcode];
                    argOrder.forEach(argName => {
                        const def = block.arguments[argName].defaultValue;
                        blockEntry.push(def !== undefined ? def : '');
                    });
                    s2Descriptor.blocks.push(blockEntry);

                    s2Ext[block.opcode] = function() {
                        const argsArray = Array.from(arguments);
                        
                        const hasCallback = ['w', 'R', 'h'].includes(s2Type);
                        const callback = hasCallback ? argsArray.pop() : null;

                        const argsObj = {};
                        argOrder.forEach((name, i) => argsObj[name] = argsArray[i]);

                        const util = { yield: () => {}, thread: {} };

                        try {
                            const result = extensionInstance[block.opcode](argsObj, util);

                            if (result && typeof result.then === 'function') {
                                result.then(val => {
                                    if (typeof callback === 'function') callback(val);
                                }).catch(err => {
                                    if (typeof callback === 'function') callback();
                                });
                            } else {
                                if (typeof callback === 'function') callback(result);
                                return result;
                            }
                        } catch (e) {
                            if (typeof callback === 'function') callback();
                        }
                    };
                }
            });

            s2Ext._getStatus = () => ({ status: 2, msg: 'Ready' });
            
            s2Ext._shutdown = function() {
                if (pollingInterval) clearInterval(pollingInterval);
                showS2Notification('Scratch3 compatability warning', `${info.name} may have extra scripts running in the background. Be sure to reload before loading this extension again`);
                if (extensionInstance._shutdown) extensionInstance._shutdown();
            };

            ScratchExtensions.register(info.name, s2Descriptor, s2Ext);
        };

        updateExtension();
        pollingInterval = setInterval(updateExtension, 1000);
    };

})(window);
