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

    load('https://cdnjs.cloudflare.com/ajax/libs/babel-polyfill/6.26.0/polyfill.min.js', function () {
        load('https://cdn.jsdelivr.net/npm/whatwg-fetch@3.0.0/dist/fetch.umd.min.js', function () {
            load('https://cdn.jsdelivr.net/npm/fast-text-encoding@1.0.6/text.min.js', function () {
                load('https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/6.26.0/babel.min.js', function () {
                    get('download.js', function (code) {
                        try {
                            var out = Babel.transform(code, { presets: ['es2015', 'stage-2'] }).code;
                            var s = document.createElement('script');
                            s.text = out;
                            document.body.appendChild(s);
                            window.startMain();
                        } catch (e) {
                            if (console && console.error) console.error(e);
                        }
                    });
                });
            });
        });
    });
})();
