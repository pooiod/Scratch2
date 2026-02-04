(function (files) {
    function load(src, cb) {
        var s = document.createElement('script');
        s.src = src;
        s.async = false;
        s.onload = s.onreadystatechange = function () {
            if (!this.readyState || this.readyState === 'loaded' || this.readyState === 'complete') {
                s.onload = s.onreadystatechange = null;
                if (cb) cb();
            }
        };
        document.getElementsByTagName('head')[0].appendChild(s);
    }

    function get(url, cb) {
        var x = new XMLHttpRequest();
        x.open('GET', url, true);
        x.onreadystatechange = function () {
            if (x.readyState === 4 && (x.status === 200 || x.status === 0)) {
                cb(x.responseText);
            }
        };
        x.send(null);
    }

    function loadFiles(cb) {
        var remaining = files.length;

        files.forEach(function (file) {
            load(file, function () {
                remaining--;
                if (remaining === 0) {
                    cb();
                }
            });
        });
    }

    function transpileFiles(cb) {
        var remaining = files.length;

        files.forEach(function (file) {
            get(file, function (code) {
                try {
                    var ieFunc = "async function svgToPng(svgText) { " +
                        "return new Promise(function(resolve, reject) { " +
                        "var c = document.createElement('canvas'); " +
                        "c.width = outW; c.height = outH; " +
                        "canvg(c, svgText, { " +
                        "ignoreMouse: true, " +
                        "ignoreAnimation: true, " +
                        "renderCallback: function() { " +
                        "c.toBlob(function(blob) { " +
                        "var fr = new FileReader(); " +
                        "fr.onload = function() { resolve(new Uint8Array(fr.result)); }; " +
                        "fr.onerror = function(e) { reject(e); }; " +
                        "fr.readAsArrayBuffer(blob); " +
                        "}, 'image/png'); " +
                        "} " +
                        "}); " +
                        "}); " +
                        "}";

                    code = code.replace(/function svgToPng\(svgText\) \{[\s\S]*?return new Uint8Array\(ab\);\s*\}/, ieFunc);
                } catch (e) {
                    if (console && console.error) console.error(e);
                }

                var transpiled = Babel.transform(code, { presets: ['es2015'] }).code;

                var s = document.createElement('script');
                s.type = 'text/javascript';
                s.async = false;
                s.text = transpiled;
                document.getElementsByTagName('head')[0].appendChild(s);

                remaining--;
                if (remaining === 0) {
                    cb();
                }
            });
        });
    }

    // I didn't want to reqrite all my code to be IE compatible, so libs are used instead
    if (/MSIE|Trident/.test(navigator.userAgent)) {
        load('https://cdnjs.cloudflare.com/ajax/libs/babel-polyfill/6.26.0/polyfill.min.js', function () {
            load('https://cdn.jsdelivr.net/npm/whatwg-fetch@3.0.0/dist/fetch.umd.min.js', function () {
                load('https://cdn.jsdelivr.net/npm/fast-text-encoding@1.0.6/text.min.js', function () {
                    load('https://cdn.jsdelivr.net/npm/canvas-toBlob@1.0.0/canvas-toBlob.min.js', function () {
                        load('https://cdn.jsdelivr.net/npm/rgbcolor@1.0.1/index.js', function () {
                            load('https://cdnjs.cloudflare.com/ajax/libs/stackblur-canvas/1.4.1/stackblur.min.js', function () {
                                load('https://cdn.jsdelivr.net/npm/canvg@1.5.3/dist/browser/canvg.min.js', function () {
                                    load('https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/6.26.0/babel.min.js', function () {
                                        transpileFiles(function() {
                                            startMain();
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    } else {
        startMain();
    }
})(['download.js', 'scratchGUI.js']);
