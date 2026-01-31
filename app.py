import sys
import os
from PyQt5.QtCore import QUrl, QCoreApplication, Qt
from PyQt5.QtWidgets import (QApplication, QMainWindow, QDesktopWidget, QShortcut, QDialog, QVBoxLayout, QComboBox, QLabel, QPushButton)
from PyQt5.QtGui import QKeySequence
from PyQt5.QtWebEngineWidgets import QWebEngineView, QWebEngineSettings, QWebEnginePage
from PyQt5.QtMultimedia import QAudioDeviceInfo, QCameraInfo, QAudio

FLASH_PATH = os.path.join(os.path.dirname(__file__), "pepflashplayer.dll")
FLASH_VERSION = "32.0.0.371"
TARGET_URL = "https://scratchflash.pages.dev/"
DEFAULT_ZOOM = 0.8

class DeviceSelector(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Select Input Devices")
        self.setFixedSize(300, 200)
        layout = QVBoxLayout()

        layout.addWidget(QLabel("Microphone:"))
        self.mic_box = QComboBox()
        mics = QAudioDeviceInfo.availableDevices(QAudio.AudioInput)
        default_mic = QAudioDeviceInfo.defaultInputDevice().deviceName()
        for info in mics:
            self.mic_box.addItem(info.deviceName())
        self.mic_box.setCurrentText(default_mic)
        layout.addWidget(self.mic_box)

        layout.addWidget(QLabel("Camera:"))
        self.cam_box = QComboBox()
        cams = QCameraInfo.availableCameras()
        default_cam = QCameraInfo.defaultCamera().description() if cams else ""
        for cam in cams:
            self.cam_box.addItem(cam.description())
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
        self.resize(900, 500)
        self.center_window()
        
        self.permission_requested = False
        
        self.browser = QWebEngineView()
        self.browser.page().featurePermissionRequested.connect(self.handle_permission)
        
        settings = self.browser.settings()
        settings.setAttribute(QWebEngineSettings.PluginsEnabled, True)
        settings.setAttribute(QWebEngineSettings.AllowRunningInsecureContent, True)
        settings.setAttribute(QWebEngineSettings.PlaybackRequiresUserGesture, False)
        
        self.browser.setZoomFactor(DEFAULT_ZOOM)
        self.setCentralWidget(self.browser)
        self.browser.load(QUrl(TARGET_URL))
        
        self.init_shortcuts()

    def center_window(self):
        qt_rectangle = self.frameGeometry()
        center_point = QDesktopWidget().availableGeometry().center()
        qt_rectangle.moveCenter(center_point)
        self.move(qt_rectangle.topLeft())

    def handle_permission(self, url, feature):
        if not self.permission_requested:
            self.permission_requested = True
            selector = DeviceSelector(self)
            selector.exec_()
        
        self.browser.page().setFeaturePermission(
            url, feature, QWebEnginePage.PermissionGrantedByUser
        )

    def init_shortcuts(self):
        QShortcut(QKeySequence("Ctrl+="), self, self.zoom_in)
        QShortcut(QKeySequence("Ctrl++"), self, self.zoom_in)
        QShortcut(QKeySequence("Ctrl+-"), self, self.zoom_out)
        QShortcut(QKeySequence("Ctrl+0"), self, self.zoom_reset)

    def zoom_in(self):
        self.browser.setZoomFactor(self.browser.zoomFactor() + 0.1)

    def zoom_out(self):
        self.browser.setZoomFactor(max(0.1, self.browser.zoomFactor() - 0.1))

    def zoom_reset(self):
        self.browser.setZoomFactor(DEFAULT_ZOOM)

if __name__ == "__main__":
    if os.path.exists(FLASH_PATH):
        sys.argv.append(f"--ppapi-flash-path={FLASH_PATH}")
        sys.argv.append(f"--ppapi-flash-version={FLASH_VERSION}")
    
    QCoreApplication.setAttribute(Qt.AA_EnableHighDpiScaling)
    app = QApplication(sys.argv)
    QWebEngineSettings.globalSettings().setAttribute(QWebEngineSettings.PluginsEnabled, True)
    
    window = FlashBrowser()
    window.show()
    sys.exit(app.exec_())
