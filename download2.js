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
                    console.error('Failed to load ' + url);
                }
            }
        };
        xhr.send(null);
    }

    function initLoader() {
        loadScript('https://cdn.jsdelivr.net/npm/es6-promise@4/dist/es6-promise.auto.min.js', function () {
            loadScript('https://cdn.jsdelivr.net/npm/whatwg-fetch@3.0.0/dist/fetch.umd.min.js', function () {
                loadScript('https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js', function () {

                    fetchSource('download.js', function (modernCode) {
                        try {
                            var transpiledResult = Babel.transform(modernCode, {
                                presets: ['env']
                            }).code;

                            var newScript = document.createElement('script');
                            newScript.type = 'text/javascript';
                            newScript.text = transpiledResult;
                            document.body.appendChild(newScript);

                            window.startMain();
                        } catch (e) {
                            console.error('Transpilation failed:', e);
                        }
                    });
                });
            });
        });
    }

    initLoader();
})();
