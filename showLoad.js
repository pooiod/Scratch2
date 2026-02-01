const style = document.createElement('style');
style.innerHTML = `
    @keyframes _lagSpin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    #_lagSpinner {
        position: fixed;
        top: 5px;
        right: 5px;
        width: 15px;
        height: 15px;
        border: 2px solid rgba(100, 100, 100, 0.1);
        border-top: 2px solid white;
        border-radius: 50%;
        animation: _lagSpin 0.8s linear infinite;
        z-index: 9999999999999;
        display: none;
        pointer-events: none;
    }
`;
document.head.appendChild(style);

const spinner = document.createElement('div');
spinner.id = '_lagSpinner';
document.body.appendChild(spinner);

let lastTime = performance.now();
let hideTimer;

const checkLag = () => {
    const now = performance.now();
    const diff = now - lastTime;

    if (diff > 60) {
        spinner.style.display = 'block';
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            spinner.style.display = 'none';
        }, 500);
    }

    lastTime = now;
    requestAnimationFrame(checkLag);
};

requestAnimationFrame(checkLag);
