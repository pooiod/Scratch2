/*!	SWFObject v2.2 <http://code.google.com/p/swfobject/> 
	Refactored for readability.
*/

var swfobject = function() {
	
	var TYPE_UNDEFINED = "undefined",
		IS_DEBUG = false,
		TYPE_OBJECT = "object",
		SHOCKWAVE_FLASH = "Shockwave Flash",
		SHOCKWAVE_FLASH_AX = "ShockwaveFlash.ShockwaveFlash",
		FLASH_MIME_TYPE = "application/x-shockwave-flash",
		EXPRESS_INSTALL_ID = "SWFObjectExprInst",
		EVENT_ON_READY_STATE_CHANGE = "onreadystatechange",
		
		globalWindow = window,
		globalDocument = document,
		globalNavigator = navigator,
		
		isFlashPluginDetected = false,
		domLoadCallbacks = [main],
		registeredObjects = [],
		dynamicObjectIds = [],
		eventListeners = [],
		storedAltContent,
		storedAltContentId,
		storedCallbackFn,
		storedCallbackObj,
		isDomLoaded = false,
		isExpressInstallActive = false,
		dynamicStylesheet,
		dynamicStylesheetMedia,
		autoHideShow = true,
	
	/* Centralized function for browser feature detection */	
	browserFeatures = function() {
		var isW3CDOM = typeof globalDocument.getElementById != TYPE_UNDEFINED && typeof globalDocument.getElementsByTagName != TYPE_UNDEFINED && typeof globalDocument.createElement != TYPE_UNDEFINED,
			userAgent = globalNavigator.userAgent.toLowerCase(),
			platform = globalNavigator.platform.toLowerCase(),
			isWindows = platform ? /win/.test(platform) : /win/.test(userAgent),
			isMac = platform ? /mac/.test(platform) : /mac/.test(userAgent),
			webkitVersion = /webkit/.test(userAgent) ? parseFloat(userAgent.replace(/^.*webkit\/(\d+(\.\d+)?).*$/, "$1")) : false, 
			isIE = !+"\v1", 
			playerVersion = [0,0,0],
			description = null;

		if (typeof globalNavigator.plugins != TYPE_UNDEFINED && typeof globalNavigator.plugins[SHOCKWAVE_FLASH] == TYPE_OBJECT) {
			description = globalNavigator.plugins[SHOCKWAVE_FLASH].description;
			// Safari 3+ detection
			if (description && !(typeof globalNavigator.mimeTypes != TYPE_UNDEFINED && globalNavigator.mimeTypes[FLASH_MIME_TYPE] && !globalNavigator.mimeTypes[FLASH_MIME_TYPE].enabledPlugin)) { 
				isFlashPluginDetected = true;
				isIE = false; 
				description = description.replace(/^.*\s+(\S+\s+\S+$)/, "$1");
				playerVersion[0] = parseInt(description.replace(/^(.*)\..*$/, "$1"), 10);
				playerVersion[1] = parseInt(description.replace(/^.*\.(.*)\s.*$/, "$1"), 10);
				playerVersion[2] = /[a-zA-Z]/.test(description) ? parseInt(description.replace(/^.*[a-zA-Z]+(.*)$/, "$1"), 10) : 0;
			}
		}
		else if (typeof globalWindow.ActiveXObject != TYPE_UNDEFINED) {
			try {
				var activeXObj = new ActiveXObject(SHOCKWAVE_FLASH_AX);
				if (activeXObj) { 
					description = activeXObj.GetVariable("$version");
					if (description) {
						isIE = true; 
						description = description.split(" ")[1].split(",");
						playerVersion = [parseInt(description[0], 10), parseInt(description[1], 10), parseInt(description[2], 10)];
					}
				}
			}
			catch(e) { if (IS_DEBUG) throw e; }
		}
		return { w3c: isW3CDOM, pv: playerVersion, wk: webkitVersion, ie: isIE, win: isWindows, mac: isMac };
	}(),
	
	/* Cross-browser onDomLoad */ 
	onDomLoad = function() {
		if (!browserFeatures.w3c) { return; }
		
		// If loaded dynamically after window load
		if ((typeof globalDocument.readyState != TYPE_UNDEFINED && globalDocument.readyState == "complete") || (typeof globalDocument.readyState == TYPE_UNDEFINED && (globalDocument.getElementsByTagName("body")[0] || globalDocument.body))) { 
			executeDomLoadFunctions();
		}
		
		if (!isDomLoaded) {
			if (typeof globalDocument.addEventListener != TYPE_UNDEFINED) {
				globalDocument.addEventListener("DOMContentLoaded", executeDomLoadFunctions, false);
			}		
			if (browserFeatures.ie && browserFeatures.win) {
				globalDocument.attachEvent(EVENT_ON_READY_STATE_CHANGE, function() {
					if (globalDocument.readyState == "complete") {
						globalDocument.detachEvent(EVENT_ON_READY_STATE_CHANGE, arguments.callee);
						executeDomLoadFunctions();
					}
				});
				if (globalWindow == top) { 
					(function(){
						if (isDomLoaded) { return; }
						try {
							globalDocument.documentElement.doScroll("left");
						}
						catch(e) {
							setTimeout(arguments.callee, 0);
							return;
						}
						executeDomLoadFunctions();
					})();
				}
			}
			if (browserFeatures.wk) {
				(function(){
					if (isDomLoaded) { return; }
					if (!/loaded|complete/.test(globalDocument.readyState)) {
						setTimeout(arguments.callee, 0);
						return;
					}
					executeDomLoadFunctions();
				})();
			}
			addLoadEvent(executeDomLoadFunctions);
		}
	}();
	
	function executeDomLoadFunctions() {
		if (isDomLoaded) { return; }
		try { 
			var testElem = globalDocument.getElementsByTagName("body")[0].appendChild(createElement("span"));
			testElem.parentNode.removeChild(testElem);
		}
		catch (e) {
		  if (IS_DEBUG) throw e;
		  return;
	  }
		isDomLoaded = true;
		var callbackLength = domLoadCallbacks.length;
		for (var i = 0; i < callbackLength; i++) {
			domLoadCallbacks[i]();
		}
	}
	
	function addDomLoadEvent(callbackFn) {
		if (isDomLoaded) {
			callbackFn();
		}
		else { 
			domLoadCallbacks[domLoadCallbacks.length] = callbackFn; 
		}
	}
	
	/* Cross-browser onload */
	function addLoadEvent(callbackFn) {
		if (typeof globalWindow.addEventListener != TYPE_UNDEFINED) {
			globalWindow.addEventListener("load", callbackFn, false);
		}
		else if (typeof globalDocument.addEventListener != TYPE_UNDEFINED) {
			globalDocument.addEventListener("load", callbackFn, false);
		}
		else if (typeof globalWindow.attachEvent != TYPE_UNDEFINED) {
			addListener(globalWindow, "onload", callbackFn);
		}
		else if (typeof globalWindow.onload == "function") {
			var oldOnLoad = globalWindow.onload;
			globalWindow.onload = function() {
				oldOnLoad();
				callbackFn();
			};
		}
		else {
			globalWindow.onload = callbackFn;
		}
	}
	
	/* Main function */
	function main() { 
		if (isFlashPluginDetected) {
			testPlayerVersion();
		}
		else {
			matchVersions();
		}
	}
	
	/* Detect the Flash Player version via DOM for non-IE */
	function testPlayerVersion() {
		var body = globalDocument.getElementsByTagName("body")[0];
		var testObject = createElement(TYPE_OBJECT);
		testObject.setAttribute("type", FLASH_MIME_TYPE);
		var loadedObject = body.appendChild(testObject);
		
		if (loadedObject) {
			var counter = 0;
			(function(){
				if (typeof loadedObject.GetVariable != TYPE_UNDEFINED) {
					var versionDesc = loadedObject.GetVariable("$version");
					if (versionDesc) {
						versionDesc = versionDesc.split(" ")[1].split(",");
						browserFeatures.pv = [parseInt(versionDesc[0], 10), parseInt(versionDesc[1], 10), parseInt(versionDesc[2], 10)];
					}
				}
				else if (counter < 10) {
					counter++;
					setTimeout(arguments.callee, 10);
					return;
				}
				body.removeChild(testObject);
				loadedObject = null;
				matchVersions();
			})();
		}
		else {
			matchVersions();
		}
	}
	
	/* Perform Flash Player and SWF version matching */
	function matchVersions() {
		var regLength = registeredObjects.length;
		if (regLength > 0) {
			for (var i = 0; i < regLength; i++) { 
				var id = registeredObjects[i].id;
				var callback = registeredObjects[i].callbackFn;
				var callbackObj = {success:false, id:id};
				
				if (browserFeatures.pv[0] > 0) {
					var domElement = getElementById(id);
					if (domElement) {
						if (hasPlayerVersion(registeredObjects[i].swfVersion) && !(browserFeatures.wk && browserFeatures.wk < 312)) { 
							setVisibility(id, true);
							if (callback) {
								callbackObj.success = true;
								callbackObj.ref = getObjectById(id);
								callback(callbackObj);
							}
						}
						else if (registeredObjects[i].expressInstall && canExpressInstall()) { 
							var attributes = {};
							attributes.data = registeredObjects[i].expressInstall;
							attributes.width = domElement.getAttribute("width") || "0";
							attributes.height = domElement.getAttribute("height") || "0";
							if (domElement.getAttribute("class")) { attributes.styleclass = domElement.getAttribute("class"); }
							if (domElement.getAttribute("align")) { attributes.align = domElement.getAttribute("align"); }
							
							var params = {};
							var paramElements = domElement.getElementsByTagName("param");
							var paramLength = paramElements.length;
							for (var j = 0; j < paramLength; j++) {
								if (paramElements[j].getAttribute("name").toLowerCase() != "movie") {
									params[paramElements[j].getAttribute("name")] = paramElements[j].getAttribute("value");
								}
							}
							showExpressInstall(attributes, params, id, callback);
						}
						else { 
							displayAltContent(domElement);
							if (callback) { callback(callbackObj); }
						}
					}
				}
				else {	
					setVisibility(id, true);
					if (callback) {
						var targetObject = getObjectById(id); 
						if (targetObject && typeof targetObject.SetVariable != TYPE_UNDEFINED) { 
							callbackObj.success = true;
							callbackObj.ref = targetObject;
						}
						callback(callbackObj);
					}
				}
			}
		}
	}
	
	function getObjectById(objectIdStr) {
		var result = null;
		var element = getElementById(objectIdStr);
		if (element && element.nodeName == "OBJECT") {
			if (typeof element.SetVariable != TYPE_UNDEFINED) {
				result = element;
			}
			else {
				var nestedObject = element.getElementsByTagName(TYPE_OBJECT)[0];
				if (nestedObject) {
					result = nestedObject;
				}
			}
		}
		return result;
	}
	
	function canExpressInstall() {
		return !isExpressInstallActive && hasPlayerVersion("6.0.65") && (browserFeatures.win || browserFeatures.mac) && !(browserFeatures.wk && browserFeatures.wk < 312);
	}
	
	function showExpressInstall(attributes, params, replaceElemIdStr, callbackFn) {
		isExpressInstallActive = true;
		storedCallbackFn = callbackFn || null;
		storedCallbackObj = {success:false, id:replaceElemIdStr};
		
		var element = getElementById(replaceElemIdStr);
		if (element) {
			if (element.nodeName == "OBJECT") { 
				storedAltContent = abstractAltContent(element);
				storedAltContentId = null;
			}
			else { 
				storedAltContent = element;
				storedAltContentId = replaceElemIdStr;
			}
			attributes.id = EXPRESS_INSTALL_ID;
			if (typeof attributes.width == TYPE_UNDEFINED || (!/%$/.test(attributes.width) && parseInt(attributes.width, 10) < 310)) { attributes.width = "310"; }
			if (typeof attributes.height == TYPE_UNDEFINED || (!/%$/.test(attributes.height) && parseInt(attributes.height, 10) < 137)) { attributes.height = "137"; }
			globalDocument.title = globalDocument.title.slice(0, 47) + " - Flash Player Installation";
			
			var playerType = browserFeatures.ie && browserFeatures.win ? "ActiveX" : "PlugIn",
				flashVars = "MMredirectURL=" + globalWindow.location.toString().replace(/&/g,"%26") + "&MMplayerType=" + playerType + "&MMdoctitle=" + globalDocument.title;
			
			if (typeof params.flashvars != TYPE_UNDEFINED) {
				params.flashvars += "&" + flashVars;
			}
			else {
				params.flashvars = flashVars;
			}
			
			// IE Workarounds
			if (browserFeatures.ie && browserFeatures.win && element.readyState != 4) {
				var newObj = createElement("div");
				replaceElemIdStr += "SWFObjectNew";
				newObj.setAttribute("id", replaceElemIdStr);
				element.parentNode.insertBefore(newObj, element); 
				element.style.display = "none";
				(function(){
					if (element.readyState == 4) {
						element.parentNode.removeChild(element);
					}
					else {
						setTimeout(arguments.callee, 10);
					}
				})();
			}
			createSWF(attributes, params, replaceElemIdStr);
		}
	}
	
	function displayAltContent(element) {
		if (browserFeatures.ie && browserFeatures.win && element.readyState != 4) {
			var placeholder = createElement("div");
			element.parentNode.insertBefore(placeholder, element); 
			placeholder.parentNode.replaceChild(abstractAltContent(element), placeholder);
			element.style.display = "none";
			(function(){
				if (element.readyState == 4) {
					element.parentNode.removeChild(element);
				}
				else {
					setTimeout(arguments.callee, 10);
				}
			})();
		}
		else {
			element.parentNode.replaceChild(abstractAltContent(element), element);
		}
	} 

	function abstractAltContent(element) {
		var altContent = createElement("div");
		if (browserFeatures.win && browserFeatures.ie) {
			altContent.innerHTML = element.innerHTML;
		}
		else {
			var nestedObj = element.getElementsByTagName(TYPE_OBJECT)[0];
			if (nestedObj) {
				var children = nestedObj.childNodes;
				if (children) {
					var childLen = children.length;
					for (var i = 0; i < childLen; i++) {
						if (!(children[i].nodeType == 1 && children[i].nodeName == "PARAM") && !(children[i].nodeType == 8)) {
							altContent.appendChild(children[i].cloneNode(true));
						}
					}
				}
			}
		}
		return altContent;
	}
	
	/* Cross-browser dynamic SWF creation */
	function createSWF(attributes, params, id) {
		var resultElement, element = getElementById(id);
		if (browserFeatures.wk && browserFeatures.wk < 312) { return resultElement; }
		
		if (element) {
			if (typeof attributes.id == TYPE_UNDEFINED) { 
				attributes.id = id;
			}
			// Internet Explorer construction
			if (browserFeatures.ie && browserFeatures.win) { 
				var attrString = "";
				for (var i in attributes) {
					if (attributes[i] != Object.prototype[i]) { 
						if (i.toLowerCase() == "data") {
							params.movie = attributes[i];
						}
						else if (i.toLowerCase() == "styleclass") { 
							attrString += ' class="' + attributes[i] + '"';
						}
						else if (i.toLowerCase() != "classid") {
							attrString += ' ' + i + '="' + attributes[i] + '"';
						}
					}
				}
				var paramString = "";
				for (var j in params) {
					if (params[j] != Object.prototype[j]) { 
						paramString += '<param name="' + j + '" value="' + params[j] + '" />';
					}
				}
				element.outerHTML = '<object classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000"' + attrString + '>' + paramString + '</object>';
				dynamicObjectIds[dynamicObjectIds.length] = attributes.id; 
				resultElement = getElementById(attributes.id);	
			}
			// Standard construction
			else { 
				var objElement = createElement(TYPE_OBJECT);
				objElement.setAttribute("type", FLASH_MIME_TYPE);
				for (var m in attributes) {
					if (attributes[m] != Object.prototype[m]) { 
						if (m.toLowerCase() == "styleclass") { 
							objElement.setAttribute("class", attributes[m]);
						}
						else if (m.toLowerCase() != "classid") { 
							objElement.setAttribute(m, attributes[m]);
						}
					}
				}
				for (var n in params) {
					if (params[n] != Object.prototype[n] && n.toLowerCase() != "movie") { 
						createObjParam(objElement, n, params[n]);
					}
				}
				element.parentNode.replaceChild(objElement, element);
				resultElement = objElement;
			}
		}

        var existingFlashObject = document.querySelector("object");
        if (existingFlashObject && window.RufflePlayer) {
            var ruffleInstance = window.RufflePlayer.newest();
            var rufflePlayer = ruffleInstance.createPlayer();
            var movieUrl = existingFlashObject.data || existingFlashObject.src || existingFlashObject.querySelector("param[name='movie']")?.value;

            rufflePlayer.style.width = "100%";
            rufflePlayer.style.height = "100%";

            existingFlashObject.parentNode.replaceChild(rufflePlayer, existingFlashObject);

            rufflePlayer.load({
                url: movieUrl,
                autoplay: "on",
                unmuteOverlay: "hidden",
                allowscriptaccess: 'always',
                allowfullscreen: 'true',
                wmode: 'direct',
                menu: 'false',
                maxExecutionDuration: 99999999999
            });

            resultElement = document.querySelector('ruffle-player');
        }

		return resultElement;
	}
	
	function createObjParam(element, paramName, paramValue) {
		var param = createElement("param");
		param.setAttribute("name", paramName);	
		param.setAttribute("value", paramValue);
		element.appendChild(param);
	}
	
	/* Cross-browser SWF removal */
	function removeSWF(id) {
		var element = getElementById(id);
		if (element && element.nodeName == "OBJECT") {
			if (browserFeatures.ie && browserFeatures.win) {
				element.style.display = "none";
				(function(){
					if (element.readyState == 4) {
						removeObjectInIE(id);
					}
					else {
						setTimeout(arguments.callee, 10);
					}
				})();
			}
			else {
				element.parentNode.removeChild(element);
			}
		}
	}
	
	function removeObjectInIE(id) {
		var element = getElementById(id);
		if (element) {
			for (var i in element) {
				if (typeof element[i] == "function") {
					element[i] = null;
				}
			}
			element.parentNode.removeChild(element);
		}
	}
	
	function getElementById(id) {
		var element = null;
		try {
			element = globalDocument.getElementById(id);
		}
		catch (e) { if (IS_DEBUG) throw e; }
		return element;
	}
	
	function createElement(tagName) {
		return globalDocument.createElement(tagName);
	}
	
	function addListener(target, eventType, callbackFn) {
		target.attachEvent(eventType, callbackFn);
		eventListeners[eventListeners.length] = [target, eventType, callbackFn];
	}
	
	/* Flash Player and SWF content version matching */
	function hasPlayerVersion(reqVersion) {
		var currentVersion = browserFeatures.pv, 
            reqParts = reqVersion.split(".");
		
        reqParts[0] = parseInt(reqParts[0], 10);
		reqParts[1] = parseInt(reqParts[1], 10) || 0; 
		reqParts[2] = parseInt(reqParts[2], 10) || 0;
		
        return (currentVersion[0] > reqParts[0] || 
               (currentVersion[0] == reqParts[0] && currentVersion[1] > reqParts[1]) || 
               (currentVersion[0] == reqParts[0] && currentVersion[1] == reqParts[1] && currentVersion[2] >= reqParts[2])) ? true : false;
	}
	
	/* Cross-browser dynamic CSS creation */	
	function createCSS(selector, declaration, media, newStyle) {
		if (browserFeatures.ie && browserFeatures.mac) { return; }
		var headElement = globalDocument.getElementsByTagName("head")[0];
		if (!headElement) { return; } 
		var mediaType = (media && typeof media == "string") ? media : "screen";
		if (newStyle) {
			dynamicStylesheet = null;
			dynamicStylesheetMedia = null;
		}
		if (!dynamicStylesheet || dynamicStylesheetMedia != mediaType) { 
			var styleElem = createElement("style");
			styleElem.setAttribute("type", "text/css");
			styleElem.setAttribute("media", mediaType);
			dynamicStylesheet = headElement.appendChild(styleElem);
			if (browserFeatures.ie && browserFeatures.win && typeof globalDocument.styleSheets != TYPE_UNDEFINED && globalDocument.styleSheets.length > 0) {
				dynamicStylesheet = globalDocument.styleSheets[globalDocument.styleSheets.length - 1];
			}
			dynamicStylesheetMedia = mediaType;
		}
		// add style rule
		if (browserFeatures.ie && browserFeatures.win) {
			if (dynamicStylesheet && typeof dynamicStylesheet.addRule == TYPE_OBJECT) {
				dynamicStylesheet.addRule(selector, declaration);
			}
		}
		else {
			if (dynamicStylesheet && typeof globalDocument.createTextNode != TYPE_UNDEFINED) {
				dynamicStylesheet.appendChild(globalDocument.createTextNode(selector + " {" + declaration + "}"));
			}
		}
	}
	
	function setVisibility(id, isVisible) {
		if (!autoHideShow) { return; }
		var visibilityState = isVisible ? "visible" : "hidden";
		if (isDomLoaded && getElementById(id)) {
			getElementById(id).style.visibility = visibilityState;
		}
		else {
			createCSS("#" + id, "visibility:" + visibilityState);
		}
	}

	function urlEncodeIfNecessary(str) {
		var regex = /[\\\"<>\.;]/;
		var hasBadChars = regex.exec(str) != null;
		return hasBadChars && typeof encodeURIComponent != TYPE_UNDEFINED ? encodeURIComponent(str) : str;
	}
	
	/* Release memory to avoid memory leaks */
	var cleanup = function() {
		if (browserFeatures.ie && browserFeatures.win) {
			window.attachEvent("onunload", function() {
				var listenerLen = eventListeners.length;
				for (var i = 0; i < listenerLen; i++) {
					eventListeners[i][0].detachEvent(eventListeners[i][1], eventListeners[i][2]);
				}
				var objectLen = dynamicObjectIds.length;
				for (var j = 0; j < objectLen; j++) {
					removeSWF(dynamicObjectIds[j]);
				}
				for (var k in browserFeatures) {
					browserFeatures[k] = null;
				}
				browserFeatures = null;
				for (var l in swfobject) {
					swfobject[l] = null;
				}
				swfobject = null;
			});
		}
	}();
	
	return {
		/* Public API */ 
		registerObject: function(objectIdStr, swfVersionStr, xiSwfUrlStr, callbackFn) {
			if (browserFeatures.w3c && objectIdStr && swfVersionStr) {
				var regObj = {};
				regObj.id = objectIdStr;
				regObj.swfVersion = swfVersionStr;
				regObj.expressInstall = xiSwfUrlStr;
				regObj.callbackFn = callbackFn;
				registeredObjects[registeredObjects.length] = regObj;
				setVisibility(objectIdStr, false);
			}
			else if (callbackFn) {
				callbackFn({success:false, id:objectIdStr});
			}
		},
		
		getObjectById: function(objectIdStr) {
			if (browserFeatures.w3c) {
				return getObjectById(objectIdStr);
			}
		},
		
		embedSWF: function(swfUrlStr, replaceElemIdStr, widthStr, heightStr, swfVersionStr, xiSwfUrlStr, flashvarsObj, parObj, attObj, callbackFn) {
			var callbackObj = {success:false, id:replaceElemIdStr};
			if (browserFeatures.w3c && !(browserFeatures.wk && browserFeatures.wk < 312) && swfUrlStr && replaceElemIdStr && widthStr && heightStr && swfVersionStr) {
				setVisibility(replaceElemIdStr, false);
				addDomLoadEvent(function() {
					widthStr += ""; 
					heightStr += "";
					var attributes = {};
					if (attObj && typeof attObj === TYPE_OBJECT) {
						for (var i in attObj) { 
							attributes[i] = attObj[i];
						}
					}
					attributes.data = swfUrlStr;
					attributes.width = widthStr;
					attributes.height = heightStr;
					var params = {}; 
					if (parObj && typeof parObj === TYPE_OBJECT) {
						for (var j in parObj) { 
							params[j] = parObj[j];
						}
					}
					if (flashvarsObj && typeof flashvarsObj === TYPE_OBJECT) {
						for (var k in flashvarsObj) { 
							if (typeof params.flashvars != TYPE_UNDEFINED) {
								params.flashvars += "&" + k + "=" + flashvarsObj[k];
							}
							else {
								params.flashvars = k + "=" + flashvarsObj[k];
							}
						}
					}
					if (hasPlayerVersion(swfVersionStr)) { // create SWF
						var obj = createSWF(attributes, params, replaceElemIdStr);
						if (attributes.id == replaceElemIdStr) {
							setVisibility(replaceElemIdStr, true);
						}
						callbackObj.success = true;
						callbackObj.ref = obj;
					}
					else if (xiSwfUrlStr && canExpressInstall()) { // show Adobe Express Install
						attributes.data = xiSwfUrlStr;
						showExpressInstall(attributes, params, replaceElemIdStr, callbackFn);
						return;
					}
					else { // show alternative content
						setVisibility(replaceElemIdStr, true);
					}
					if (callbackFn) { callbackFn(callbackObj); }
				});
			}
			else if (callbackFn) { callbackFn(callbackObj);	}
		},
		
		switchOffAutoHideShow: function() {
			autoHideShow = false;
		},
		
		ua: browserFeatures,
		
		getFlashPlayerVersion: function() {
			return { major:browserFeatures.pv[0], minor:browserFeatures.pv[1], release:browserFeatures.pv[2] };
		},
		
		hasFlashPlayerVersion: hasPlayerVersion,
		
		createSWF: function(attObj, parObj, replaceElemIdStr) {
			if (browserFeatures.w3c) {
				return createSWF(attObj, parObj, replaceElemIdStr);
			}
			else {
				return undefined;
			}
		},
		
		showExpressInstall: function(attributes, params, replaceElemIdStr, callbackFn) {
			if (browserFeatures.w3c && canExpressInstall()) {
				showExpressInstall(attributes, params, replaceElemIdStr, callbackFn);
			}
		},
		
		removeSWF: function(objElemIdStr) {
			if (browserFeatures.w3c) {
				removeSWF(objElemIdStr);
			}
		},
		
		createCSS: function(selStr, declStr, mediaStr, newStyleBoolean) {
			if (browserFeatures.w3c) {
				createCSS(selStr, declStr, mediaStr, newStyleBoolean);
			}
		},
		
		addDomLoadEvent: addDomLoadEvent,
		
		addLoadEvent: addLoadEvent,
		
		getQueryParamValue: function(param) {
			var query = globalDocument.location.search || globalDocument.location.hash;
			if (query) {
				if (/\?/.test(query)) { query = query.split("?")[1]; } 
				if (param == null) {
					return urlEncodeIfNecessary(query);
				}
				var pairs = query.split("&");
				for (var i = 0; i < pairs.length; i++) {
					if (pairs[i].substring(0, pairs[i].indexOf("=")) == param) {
						return urlEncodeIfNecessary(pairs[i].substring((pairs[i].indexOf("=") + 1)));
					}
				}
			}
			return "";
		},
		
		// For internal usage only
		expressInstallCallback: function() {
			if (isExpressInstallActive) {
				var obj = getElementById(EXPRESS_INSTALL_ID);
				if (obj && storedAltContent) {
					obj.parentNode.replaceChild(storedAltContent, obj);
					if (storedAltContentId) {
						setVisibility(storedAltContentId, true);
						if (browserFeatures.ie && browserFeatures.win) { storedAltContent.style.display = "block"; }
					}
					if (storedCallbackFn) { storedCallbackFn(storedCallbackObj); }
				}
				isExpressInstallActive = false;
			} 
		}
	};
}();
