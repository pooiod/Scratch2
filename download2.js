(function () {
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

    var ie10SvgToPng = [
        "function svgToPng(svgText) {",
        "  return new Promise(function(resolve, reject) {",
        "    try {",
        "      var encoded = encodeURIComponent(svgText).replace(/%([0-9A-F]{2})/g, function(m, p) { return String.fromCharCode('0x' + p); });",
        "      var b64 = btoa(encoded);",
        "      var src = 'data:image/svg+xml;charset=utf-8;base64,' + b64;",
        "      var img = new Image();",
        "      img.crossOrigin = 'Anonymous';",
        "      img.onload = function() {",
        "        try {",
        "          var cvs = document.createElement('canvas');",
        "          cvs.width = outW;",
        "          cvs.height = outH;",
        "          var ctx = cvs.getContext('2d');",
        "          ctx.clearRect(0,0,outW,outH);",
        "          ctx.drawImage(img, 0, 0, outW, outH);",
        "          var data = cvs.toDataURL('image/png');",
        "          var bin = atob(data.split(',')[1]);",
        "          var arr = new Uint8Array(bin.length);",
        "          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);",
        "          resolve(arr);",
        "        } catch(e) { reject(e); }",
        "      };",
        "      img.onerror = function() { reject(new Error('SVG load failed')); };",
        "      img.src = src;",
        "    } catch(e) { reject(e); }",
        "  });",
        "}"
    ].join('\n');

    load('https://cdnjs.cloudflare.com/ajax/libs/babel-polyfill/6.26.0/polyfill.min.js', function () {
        load('https://cdn.jsdelivr.net/npm/whatwg-fetch@3.0.0/dist/fetch.umd.min.js', function () {
            load('https://cdn.jsdelivr.net/npm/fast-text-encoding@1.0.6/text.min.js', function () {
                load('https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/6.26.0/babel.min.js', function () {
                    get('download.js', function (code) {
                        try {
                            var modCode = code.replace('function svgToPng(svgText)', 'function _disabled_svgToPng(svgText)');

                            modCode = modCode + '\n\n' + ie10SvgToPng;

                            var out = Babel.transform(modCode, { presets: ['es2015', 'stage-2'] }).code;

                            var s = document.createElement('script');
                            s.text = out;
                            document.body.appendChild(s);

                            if (window.startMain) window.startMain();
                        } catch (e) {
                            if (console && console.error) console.error(e);
                        }
                    });
                });
            });
        });
    });
})();
