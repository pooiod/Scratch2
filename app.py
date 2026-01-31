import sys
import os
import shutil
import tempfile
from PyQt5.QtCore import QUrl, QCoreApplication, Qt, QDir
from PyQt5.QtWidgets import (QApplication, QMainWindow, QDesktopWidget, QShortcut, QDialog, QVBoxLayout, QComboBox, QLabel, QPushButton, QFileDialog)
from PyQt5.QtGui import QKeySequence, QIcon
from PyQt5.QtWebEngineWidgets import QWebEngineView, QWebEngineSettings, QWebEnginePage
from PyQt5.QtMultimedia import QAudioDeviceInfo, QCameraInfo, QAudio

FLASH_PATH = os.path.join(os.path.dirname(__file__), "pepflashplayer.dll") # https://yyf.mubilop.com/file/3b795dd8/pepflashplayer.dll
ICON_PATH = os.path.join(os.path.dirname(__file__), "AppIcon48.ico")
FLASH_VERSION = "32.0.0.371"
TARGET_URL = "https://scratchflash.pages.dev/"
DEFAULT_ZOOM = 0.8

class DeviceSelector(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Select Input Devices")
        self.setFixedSize(300, 200)
        if os.path.exists(ICON_PATH): self.setWindowIcon(QIcon(ICON_PATH))

        layout = QVBoxLayout()
        layout.addWidget(QLabel("Microphone:"))
        self.mic_box = QComboBox()
        mics = QAudioDeviceInfo.availableDevices(QAudio.AudioInput)
        default_mic = QAudioDeviceInfo.defaultInputDevice().deviceName()
        for info in mics: self.mic_box.addItem(info.deviceName())
        self.mic_box.setCurrentText(default_mic)
        layout.addWidget(self.mic_box)

        layout.addWidget(QLabel("Camera:"))
        self.cam_box = QComboBox()
        cams = QCameraInfo.availableCameras()
        default_cam = QCameraInfo.defaultCamera().description() if cams else ""
        for cam in cams: self.cam_box.addItem(cam.description())
        self.cam_box.setCurrentText(default_cam)
        layout.addWidget(self.cam_box)

        self.btn = QPushButton("Use Selected Devices")
        self.btn.clicked.connect(self.accept)
        layout.addWidget(self.btn)
        self.setLayout(layout)

class FlashBrowser(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Scratch Flash")
        if os.path.exists(ICON_PATH): self.setWindowIcon(QIcon(ICON_PATH))

        self.resize(900, 500)
        self.center_window()
        self.permission_requested = False

        self.active_downloads = {} 

        self.browser = QWebEngineView()
        self.browser.page().featurePermissionRequested.connect(self.handle_permission)
        self.browser.page().profile().downloadRequested.connect(self.handle_download)

        settings = self.browser.settings()
        settings.setAttribute(QWebEngineSettings.PluginsEnabled, True)
        settings.setAttribute(QWebEngineSettings.AllowRunningInsecureContent, True)
        settings.setAttribute(QWebEngineSettings.PlaybackRequiresUserGesture, False)

        self.browser.setZoomFactor(DEFAULT_ZOOM)
        self.setCentralWidget(self.browser)
        self.browser.load(QUrl(TARGET_URL))
        self.init_shortcuts()

    def center_window(self):
        qr = self.frameGeometry()
        cp = QDesktopWidget().availableGeometry().center()
        qr.moveCenter(cp)
        self.move(qr.topLeft())

    def handle_permission(self, url, feature):
        if not self.permission_requested:
            self.permission_requested = True
            DeviceSelector(self).exec_()
        self.browser.page().setFeaturePermission(url, feature, QWebEnginePage.PermissionGrantedByUser)

    def handle_download(self, download_item):
        suggested_name = download_item.suggestedFileName()

        final_path, _ = QFileDialog.getSaveFileName(self, "Save File", suggested_name)

        if final_path:
            final_path = QDir.toNativeSeparators(os.path.abspath(final_path))

            temp_dir = tempfile.gettempdir()
            temp_name = f"scratch_dl_{os.urandom(4).hex()}_{suggested_name}"
            temp_path = QDir.toNativeSeparators(os.path.join(temp_dir, temp_name))

            self.active_downloads[download_item] = {
                'final_path': final_path,
                'temp_path': temp_path
            }

            download_item.setPath(temp_path)
            # download_item.downloadProgress.connect(
            #     lambda rec, tot: logging.debug(f"Progress: {rec}/{tot}") if tot > 0 else None
            # )
            download_item.finished.connect(lambda: self.on_download_finished(download_item))

            download_item.accept()
        else:
            download_item.cancel()

    def on_download_finished(self, item):
        if item not in self.active_downloads:
            return

        info = self.active_downloads[item]
        temp_path = info['temp_path']
        final_path = info['final_path']

        if item.state() == 2:
            try:
                os.makedirs(os.path.dirname(final_path), exist_ok=True)

                shutil.move(temp_path, final_path)
            except Exception as e:
                print(f"Failed to move file: {e}")
        else:
            if os.path.exists(temp_path):
                os.remove(temp_path)

        del self.active_downloads[item]

    def init_shortcuts(self):
        QShortcut(QKeySequence("Ctrl+="), self, self.zoom_in)
        QShortcut(QKeySequence("Ctrl++"), self, self.zoom_in)
        QShortcut(QKeySequence("Ctrl+-"), self, self.zoom_out)
        QShortcut(QKeySequence("Ctrl+0"), self, self.zoom_reset)

    def zoom_in(self): self.browser.setZoomFactor(self.browser.zoomFactor() + 0.1)
    def zoom_out(self): self.browser.setZoomFactor(max(0.1, self.browser.zoomFactor() - 0.1))
    def zoom_reset(self): self.browser.setZoomFactor(DEFAULT_ZOOM)

if __name__ == "__main__":
    if os.path.exists(FLASH_PATH):
        sys.argv.append(f"--ppapi-flash-path={FLASH_PATH}")
        sys.argv.append(f"--ppapi-flash-version={FLASH_VERSION}")

    QCoreApplication.setAttribute(Qt.AA_EnableHighDpiScaling)
    app = QApplication(sys.argv)
    if os.path.exists(ICON_PATH): app.setWindowIcon(QIcon(ICON_PATH))
    QWebEngineSettings.globalSettings().setAttribute(QWebEngineSettings.PluginsEnabled, True)

    window = FlashBrowser()
    window.show()
    sys.exit(app.exec_())
