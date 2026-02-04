(function () {
    function loadScript(src, callback) {
        var script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.onload = script.onreadystatechange = function () {
            if (!this.readyState || this.readyState === 'loaded' || this.readyState === 'complete') {
                script.onload = script.onreadystatechange = null;
                if (callback) callback();
            }
        };
        document.head.appendChild(script);
    }

    function fetchSource(url, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200 || xhr.status === 0) {
                    callback(xhr.responseText);
                } else {
                    alert('Failed to fetch ' + url);
                }
            }
        };
        xhr.send(null);
    }

    function initLoader() {
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/babel-polyfill/6.26.0/polyfill.min.js', function () {
            loadScript('https://cdn.jsdelivr.net/npm/whatwg-fetch@3.0.0/dist/fetch.umd.min.js', function () {
                loadScript('https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/6.26.0/babel.min.js', function () {

                    fetchSource('download.js', function (modernCode) {
                        try {
                            if (typeof Babel === 'undefined' || !Babel.transform) {
                                throw new Error('Babel compiler failed to load.');
                            }

                            var result = Babel.transform(modernCode, {
                                presets: ['es2015', 'stage-2']
                            });

                            var newScript = document.createElement('script');
                            newScript.type = 'text/javascript';
                            newScript.text = result.code;
                            document.body.appendChild(newScript);

                            if (window.startMain) {
                                window.startMain();
                            }

                        } catch (e) {
                            alert('Error: ' + e.message);
                            if (console && console.error) console.error(e);
                        }
                    });
                });
            });
        });
    }

    initLoader();
})();
