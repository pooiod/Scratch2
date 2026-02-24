function hasFlash() {
  var hasFlash = false;
  if (navigator.plugins && navigator.plugins.length > 0) {
    if (navigator.plugins['Shockwave Flash']) hasFlash = true;
  }
  return hasFlash;
}
function hasruffle() {
  return document.querySelector('ruffle-player') !== null;
}
function hasadobeflash() {
  return hasFlash() && !hasruffle();
}
function hasRuffleScript() {
  var headScripts = document.head.getElementsByTagName('script');
  for (var i = 0; i < headScripts.length; i++) {
    if (headScripts[i].getAttribute('src') === '/_static/js/ruffle.js') return true;
  }
  return false;
}

document.addEventListener("keydown", function(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === "r") {
    window.location.reload();
  }
});

var logs = [];
function createAlert(message, color) {
  var alertContainer = document.getElementById('alert-container');
  if (!alertContainer) return;

  var alertNode = document.createElement('div');
  alertNode.className = 'alert';
  alertNode.innerHTML = message;
  alertNode.style.color = color || "white";

  logs.push({ text: message, color: color || "white" });
  alertContainer.appendChild(alertNode);

  setTimeout(function() { alertNode.style.opacity = '1'; }, 10);
  setTimeout(function() {
    alertNode.style.opacity = '0';
    setTimeout(function() { alertNode.remove(); }, 300);
  }, 9000);
}

var Scratch = Scratch || { v: "0.3.5" };
Scratch.editorIsReady = false;
Scratch.FlashApp = Scratch.FlashApp || {};
var inScratchX2 = true;
var editorId = "scratch";
var editor;

function handleEmbedStatus(e) {
  var loader = document.getElementById('scratch-loader');
  if (loader) loader.style.opacity = 0;

  var scratchNode = document.getElementById(editorId) || document.querySelector('ruffle-player');
  
  if (!e.success) {
    if (scratchNode) {
      scratchNode.style.marginTop = '10px';
      var thumb = scratchNode.querySelector('img.proj_thumb');
      if (thumb) thumb.style.width = '179px';
      var unsupported = scratchNode.querySelector('div.scratch_unsupported');
      if (unsupported) unsupported.style.display = 'block';
      var loading = scratchNode.querySelector('div.scratch_loading');
      if (loading) loading.style.display = 'none';
    }
  } else {
    Scratch.FlashApp.ASobj = scratchNode;
  }
}

function JSthrowError(e) {
  if (window.onerror) {
    window.onerror(e, 'swf', 0);
  } else {
    console.error(e);
  }
}

window.onerror = function catcherrorandshow(message, source, lineno, colno, error) {
  if (message.includes("Failed to load SBX")) {
    createAlert("Load Error: Failed to load project", "orange");
  } else {
    createAlert("Error: " + message, "yellow");
  }
  return false;
};

function JSeditorReady() {
  try {
    Scratch.editorIsReady = true;
    document.dispatchEvent(new Event("editor:ready"));
    editor = document.getElementById(editorId);
    setTimeout(doafterloadthings, 1000);
    return true;
  } catch (error) {
    createAlert("Error Loading SWF: " + error.message, "yellow");
    console.error(error.message, "\n", error.stack);
    throw error;
  }
}

function doafterloadthings() {
  var extensionsParam = new URLSearchParams(window.location.search).get('ext');
  if (extensionsParam) {
    var extensionUrls = extensionsParam.split('|');
    extensionUrls.forEach(function(extensionUrl) {
      if (Scratch.FlashApp.ASobj && Scratch.FlashApp.ASobj.ASloadGithubURL) {
        Scratch.FlashApp.ASobj.ASloadGithubURL(extensionUrl);
      }
    });
    console.log("Extensions loaded");
  }

  if (typeof dragndrop === "function") {
    dragndrop();
  }
}

function JSshowExtensionDialog() {
  var url = prompt("Enter Extension URL:");
  if (url) sendURLtoFlash(url);
}

function JSshowWarning(extensionData) {
  console.warn("Extension Warning:", extensionData);
  alert("Extension Warning! Check console for details.");
}

var flashVars = {
  autostart: 'false',
  extensionDevMode: 'true',
  server: encodeURIComponent(location.host),
  cloudToken: '4af4863d-a921-4004-b2cb-e0ad00ee1927',
  cdnToken: '34f16bc63e8ada7dfd7ec12c715d0c94',
  urlOverrides: {
    sitePrefix: "https://scratch.mit.edu/",
    siteCdnPrefix: "https://cdn.scratch.mit.edu/",
    assetPrefix: "https://assets.scratch.mit.edu/",
    assetCdnPrefix: "https://cdn.assets.scratch.mit.edu/",
    projectPrefix: "https://projects.scratch.mit.edu/",
    projectCdnPrefix: "https://cdn.projects.scratch.mit.edu/",
    internalAPI: "internalapi/",
    siteAPI: "site-api/",
    staticFiles: "scratchr2/static/"
  },
  inIE: (navigator.userAgent.indexOf('MSIE') > -1)
};

var params = {
  allowscriptaccess: 'always',
  allowfullscreen: 'true',
  wmode: 'direct',
  menu: 'false'
};

params.flashvars = Object.keys(flashVars).map(function(prop) {
  var val = flashVars[prop];
  if (typeof val === 'object' && val !== null) {
    val = encodeURIComponent(JSON.stringify(val));
  }
  return prop + '=' + val;
}).join('&');

var swfAttributes = {
  data: 'ScratchX.swf',
  width: '100%',
  height: '100%'
};

document.addEventListener("DOMContentLoaded", function() {
  if (typeof swfobject !== 'undefined') {
    var swf = swfobject.createSWF(swfAttributes, params, editorId);
    handleEmbedStatus({ success: !!swf, ref: swf });
  } else {
    handleEmbedStatus({ success: true });
  }
  loadFromURLParameter(window.location.search);
});

function sendFileToFlash(file) {
  var fileReader = new FileReader();
  fileReader.onload = function(e) {
    var fileAsB64 = ab_to_b64(fileReader.result);
    
    var triggerLoad = function() {
      Scratch.FlashApp.ASobj.ASloadBase64SBX(fileAsB64);
      if (typeof fileloadedtoflash === 'function') fileloadedtoflash();
    };

    if (Scratch.FlashApp.ASobj && Scratch.FlashApp.ASobj.ASloadBase64SBX) {
      triggerLoad();
    } else {
      document.addEventListener("editor:ready", function handler() {
        triggerLoad();
        document.removeEventListener("editor:ready", handler);
      });
    }
  };
  fileReader.readAsArrayBuffer(file);
}

function sendURLtoFlash() {
  var urls = Array.prototype.slice.call(arguments);
  if (urls.length <= 0) return;

  var triggerLoad = function() {
    Scratch.FlashApp.ASobj.ASloadGithubURL(urls);
  };

  if (Scratch.editorIsReady && Scratch.FlashApp.ASobj && Scratch.FlashApp.ASobj.ASloadGithubURL) {
    triggerLoad();
  } else {
    document.addEventListener("editor:ready", function handler() {
      triggerLoad();
      document.removeEventListener("editor:ready", handler);
    });
  }
}

function loadFromURLParameter(queryString) {
  var paramString = queryString.replace(/^\?|\/$/g, '');
  var vars = paramString.split("&");
  var urls = [];
  for (var i = 0; i < vars.length; i++) {
    var pair = vars[i].split("=");
    if (pair.length > 1 && pair[0] == "url") {
      urls.push(decodeURIComponent(pair[1]));
    }
  }
  if (urls.length > 0) sendURLtoFlash.apply(window, urls);
}
