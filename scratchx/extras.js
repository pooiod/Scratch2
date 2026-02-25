// Custom JS functions (to be used with the JavaScript blocks or other extensions)

const functs = ["JSshowExtensionDialog()", "loadext(extension)", "alert(text)", "showLogs()", "getlogs()", "log(text,color)", "scratchVM()", "closeAlerts()", "makestring(obj)", "showloader(color)", "hideloader()", "async promptai(prompt)"];

function showloader(color) {}
function hideloader() {}

function makestring(item) {
  const input = document.createElement('input');
  input.type = 'text';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.value = item;

  const value = input.value;

  document.body.removeChild(input);

  if (value === '[object Object]') {
    const jsonString = JSON.stringify(item);
    if (jsonString === '{}' || jsonString === undefined) {
      return 'Error: stringerror';
    } else {
      return jsonString;
    }
  } else {
    return value;
  }
}

function scratchVM() {
  return editor;
  //return document.getElementById("scratch");
}

function getlogs() {
  return logs;
}

// Function to display cnsole logs
function showLogs() {
  var logFrame = document.createElement("div");
  logFrame.id = "logFrame";

  var logContainer = document.createElement("div");
  logContainer.id = "logContainer";

  var closeButton = document.createElement("button");
  closeButton.id = "closeButton";
  closeButton.innerHTML = "Close";
  closeButton.onclick = function() {
    document.body.removeChild(logFrame);
  };

  logContainer.appendChild(closeButton);

  var logElement = document.createElement("div");
  logElement.style.color = "black";
  logElement.innerHTML = "<p>Logs:</p>";
  logContainer.appendChild(logElement);

  logs.forEach(function(log) {
    var logElement = document.createElement("div");
    logElement.style.color = log.color;
    logElement.style.textShadow = "-1px -1px 0 #000, 0px -1px 0 #000, 1px -1px 0 #000, -1px 0px 0 #000, 1px 0px 0 #000, -1px 1px 0 #000, 0px 1px 0 #000, 1px 1px 0 #000";
    logElement.textContent = log.text;
    logContainer.appendChild(logElement);
  });

  logFrame.appendChild(logContainer);

  document.body.appendChild(logFrame);
}

// load an extension with this function using the javascript block  
function loadext(ext) {
  const userConfirmed = true;//window.confirm(`Do you want to load the extension: ${ext}?`);
  if (userConfirmed) {
    Scratch.FlashApp.ASobj.ASloadGithubURL(ext);
    createAlert(`VM: Extension loaded: ${ext}`);
    setTimeout(function() {
      $(document).trigger("modal:exit")
    }, 10);
    return true;
  } else {
    createAlert('VM: Extension load canceled.', "yellow");
    return false;
  }
}

function sex() {
  console.log("sex");
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "0";
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
  container.style.display = "flex";
  container.style.justifyContent = "center";
  container.style.alignItems = "center";

  const image = document.createElement("img");
  image.src = "https://media.tenor.com/B85QfhcxFKMAAAAd/rat-spinning.gif";
  image.style.maxWidth = "100%";
  image.style.maxHeight = "100%";

  container.appendChild(image);

  document.body.appendChild(container);

  setTimeout(() => {
    document.body.removeChild(container);
    console.log("That was some good sex");
  }, 2000);
}

function scripterror(err) {
  createAlert('Script Error: ' + err, "yellow");
}

// load a project (good for games that load other games) 
function loadproject(proj) {
  const userConfirmed = true; //window.confirm(`Do you want to load the project: ${proj}?`);
  if (userConfirmed) {
    createAlert(`VM: Project loading: ${proj}`);
    sendURLtoFlash.apply(window, ["Project.sbx"]);
    setTimeout(function() {
      $(document).trigger("modal:exit")
      //createAlert(`VM: Project loaded`);
    }, 10);
    return true;
  } else {
    createAlert('VM: Project load canceled.', "yellow");
    return false;
  }
}

// show an alert at the bottom of the screen
var alertDiv;
function alert(message) {
  if (message === "") {
    message = "[ Blank Message ]";// fix for blank messages
  }
  if (alertDiv) {
    document.body.removeChild(alertDiv);
  }
  alertDiv = document.createElement('div');
  alertDiv.classList.add('custom-alert');
  const closeBtn = document.createElement('span');
  closeBtn.classList.add('close-btn');
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', () => {
    closeAlerts();
  });
  alertDiv.textContent = message;
  alertDiv.appendChild(closeBtn);
  document.body.appendChild(alertDiv);
  alertDiv.getBoundingClientRect();
  alertDiv.style.transform = 'translateY(0)';
}
function closeAlerts() {
  alertDiv.style.transform = 'translateY(100%)';
  setTimeout(() => {
    document.body.removeChild(alertDiv);
    alertDiv = false;
  }, 300);
}

// show messages in the console, also show them as text to the bottom right 
function log(message, color, notlog) {
  createAlert(message, color);
  if (!notlog) {
    console.log("Script: " + message)
  }
}

var beforegptprompt = `Your name is "ScratchX Bot". You are an ai bot on Scratchx made by pooiod7 to follow out the orders in the following prompt: 
ScratchX docs:
`;
var fromid = window.location.href;

async function promptai(prompt) {
  if (prompt == "") {
    prompt = "Respond as if this message was blank.";
  }
  return "API removed";
}
