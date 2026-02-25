function hasFlash() {
  console.log("hasFlash() called");
  var hasFlash = false;
  if (navigator.plugins && navigator.plugins.length > 0) {
    if (navigator.plugins['Shockwave Flash']) hasFlash = true;
  }
  console.log("hasFlash() result:", hasFlash);
  return hasFlash;
}

function hasruffle() {
  console.log("hasruffle() called");
  var result = document.querySelector('ruffle-player') !== null;
  console.log("hasruffle() result:", result);
  return result;
}

function hasadobeflash() {
  console.log("hasadobeflash() called");
  var result = hasFlash() && !hasruffle();
  console.log("hasadobeflash() result:", result);
  return result;
}

function hasRuffleScript() {
  console.log("hasRuffleScript() called");
  var headScripts = document.head.getElementsByTagName('script');
  for (var i = 0; i < headScripts.length; i++) {
    if (headScripts[i].getAttribute('src') === '/_static/js/ruffle.js') {
      console.log("hasRuffleScript() found ruffle.js");
      return true;
    }
  }
  console.log("hasRuffleScript() did not find ruffle.js");
  return false;
}

document.addEventListener("keydown", function(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === "r") {
    console.log("Reload triggered via keyboard shortcut");
    window.location.reload();
  }
});

var logs = [];
function createAlert(message, color) {
  console.log("createAlert() called - message:", message, "color:", color);
  var alertContainer = document.getElementById('alert-container');
  if (!alertContainer) {
    console.log("createAlert(): alert-container not found, aborting");
    return;
  }

  var alertNode = document.createElement('div');
  alertNode.className = 'alert';
  alertNode.innerHTML = message;
  alertNode.style.color = color || "white";

  logs.push({ text: message, color: color || "white" });
  console.log("createAlert(): log added, total logs:", logs.length);
  
  alertContainer.appendChild(alertNode);

  setTimeout(function() { 
    console.log("createAlert(): setting opacity to 1 for message:", message);
    alertNode.style.opacity = '1'; 
  }, 10);
  
  setTimeout(function() {
    console.log("createAlert(): starting fade out for message:", message);
    alertNode.style.opacity = '0';
    setTimeout(function() { 
      console.log("createAlert(): removing alert node for message:", message);
      alertNode.remove(); 
    }, 300);
  }, 9000);
}

var Scratch = Scratch || { v: "0.3.5" };
Scratch.editorIsReady = false;
Scratch.FlashApp = Scratch.FlashApp || {};
var inScratchX2 = true;
var editorId = "scratch";
var editor;
console.log("Global Scratch variables initialized:", Scratch);

function handleEmbedStatus(e) {
  console.log("handleEmbedStatus() called with event:", e);
  var loader = document.getElementById('scratch-loader');
  if (loader) {
    console.log("handleEmbedStatus(): hiding loader");
    loader.style.opacity = 0;
  }

  var scratchNode = document.getElementById(editorId) || document.querySelector('ruffle-player');
  console.log("handleEmbedStatus(): scratchNode found:", scratchNode);

  if (!e.success) {
    console.log("handleEmbedStatus(): embed failed");
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
    console.log("handleEmbedStatus(): embed successful, setting ASobj");
    Scratch.FlashApp.ASobj = scratchNode;
  }
}

function JSthrowError(e) {
  console.log("JSthrowError() called with:", e);
  if (window.onerror) {
    console.log("JSthrowError(): routing to window.onerror");
    window.onerror(e, 'swf', 0);
  } else {
    console.log("JSthrowError(): routing to console.error");
    console.error(e);
  }
}

window.onerror = function catcherrorandshow(message, source, lineno, colno, error) {
  console.log("window.onerror triggered - message:", message, "source:", source, "lineno:", lineno);
  if (message.includes("Failed to load SBX")) {
    createAlert("Load Error: Failed to load project", "orange");
  } else {
    createAlert("Error: " + message, "yellow");
  }
  return false;
};

function JSeditorReady() {
  console.log("JSeditorReady() called");
  try {
    Scratch.editorIsReady = true;
    console.log("JSeditorReady(): dispatching editor:ready event");
    document.dispatchEvent(new Event("editor:ready"));
    editor = document.getElementById(editorId) || document.querySelector('ruffle-player');
    console.log("JSeditorReady(): queueing doafterloadthings()");
    setTimeout(doafterloadthings, 1000);
    return true;
  } catch (error) {
    console.log("JSeditorReady(): caught error:", error);
    createAlert("Error Loading SWF: " + error.message, "yellow");
    console.error(error.message, "\n", error.stack);
    throw error;
  }
}

function doafterloadthings() {
  document.getElementById("scratch-loader").style.opacity = 0;

  console.log("doafterloadthings() called");
  var extensionsParam = new URLSearchParams(window.location.search).get('ext');
  console.log("doafterloadthings(): extensionsParam:", extensionsParam);
  
  if (extensionsParam) {
    var extensionUrls = extensionsParam.split('|');
    extensionUrls.forEach(function(extensionUrl) {
      console.log("doafterloadthings(): processing extension:", extensionUrl);
      if (Scratch.FlashApp.ASobj && Scratch.FlashApp.ASobj.ASloadGithubURL) {
        console.log("doafterloadthings(): loading extension into ASobj");
        Scratch.FlashApp.ASobj.ASloadGithubURL(extensionUrl);
      } else {
        console.log("doafterloadthings(): ASloadGithubURL not available");
      }
    });
    console.log("Extensions loaded");
  }
}

function JSshowExtensionDialog() {
  console.log("JSshowExtensionDialog() called");
  var url = prompt("Enter Extension URL:");
  console.log("JSshowExtensionDialog(): user provided url:", url);
  if (url) sendURLtoFlash(url);
}

function JSshowWarning(extensionData) {
  console.log("JSshowWarning() called with:", extensionData);
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
console.log("flashVars constructed:", flashVars);

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
console.log("SWF params mapped:", params);

var swfAttributes = {
  data: 'ScratchX.swf',
  width: '100%',
  height: '100%'
};

var swf = swfobject.createSWF(swfAttributes, params, editorId); // document.getElementById(editorId) || document.querySelector('ruffle-player');
handleEmbedStatus({ success: !!swf, ref: swf });

console.log("Calling loadFromURLParameter with:", window.location.search);
loadFromURLParameter(window.location.search);

function sendFileToFlash(file) {
  console.log("sendFileToFlash() called for file:", file);
  var fileReader = new FileReader();
  fileReader.onload = function(e) {
    console.log("sendFileToFlash(): fileReader loaded");
    var fileAsB64 = ab_to_b64(fileReader.result);
    
    var triggerLoad = function() {
      console.log("sendFileToFlash(): executing ASloadBase64SBX");
      Scratch.FlashApp.ASobj.ASloadBase64SBX(fileAsB64);
      if (typeof fileloadedtoflash === 'function') {
        console.log("sendFileToFlash(): triggering fileloadedtoflash callback");
        fileloadedtoflash();
      }
    };

    if (Scratch.FlashApp.ASobj && Scratch.FlashApp.ASobj.ASloadBase64SBX) {
      console.log("sendFileToFlash(): ASobj ready, triggering load");
      triggerLoad();
    } else {
      console.log("sendFileToFlash(): ASobj not ready, awaiting editor:ready event");
      document.addEventListener("editor:ready", function handler() {
        console.log("sendFileToFlash(): editor:ready fired, triggering load");
        triggerLoad();
        document.removeEventListener("editor:ready", handler);
      });
    }
  };
  fileReader.readAsArrayBuffer(file);
}

function sendURLtoFlash() {
  var urls = Array.prototype.slice.call(arguments);
  console.log("sendURLtoFlash() called with arguments:", urls);
  if (urls.length <= 0) {
    console.log("sendURLtoFlash(): no arguments, aborting");
    return;
  }

  var triggerLoad = function() {
    console.log("sendURLtoFlash(): executing ASloadGithubURL");
    Scratch.FlashApp.ASobj.ASloadGithubURL(urls);
  };

  if (Scratch.editorIsReady && Scratch.FlashApp.ASobj && Scratch.FlashApp.ASobj.ASloadGithubURL) {
    console.log("sendURLtoFlash(): editor ready, triggering load");
    triggerLoad();
  } else {
    console.log("sendURLtoFlash(): editor not ready, awaiting editor:ready event");
    document.addEventListener("editor:ready", function handler() {
      console.log("sendURLtoFlash(): editor:ready fired, triggering load");
      triggerLoad();
      document.removeEventListener("editor:ready", handler);
    });
  }
}

function loadFromURLParameter(queryString) {
  console.log("loadFromURLParameter() called with:", queryString);
  var paramString = queryString.replace(/^\?|\/$/g, '');
  var vars = paramString.split("&");
  var urls = [];
  for (var i = 0; i < vars.length; i++) {
    var pair = vars[i].split("=");
    if (pair.length > 1 && pair[0] == "url") {
      var decodedUrl = decodeURIComponent(pair[1]);
      console.log("loadFromURLParameter(): extracted url:", decodedUrl);
      urls.push(decodedUrl);
    }
  }
  if (urls.length > 0) {
    console.log("loadFromURLParameter(): delegating to sendURLtoFlash");
    sendURLtoFlash.apply(window, urls);
  } else {
    console.log("loadFromURLParameter(): no target urls found in parameters");
  }
}
