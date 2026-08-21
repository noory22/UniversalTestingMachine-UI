import os, sys, csv, random, time, threading, struct
from PyQt5 import QtWidgets, QtGui, QtCore, uic
from PyQt5.QtWidgets import QApplication, QMainWindow, QLineEdit, QFrame, QPushButton, QMessageBox, QVBoxLayout, QFileDialog, QListWidgetItem, QComboBox
from PyQt5.QtCore import Qt, QTimer, pyqtSignal, pyqtSlot, QThread
from PyQt5.QtGui import QPixmap, QImage, QIntValidator, QDoubleValidator, QIcon
from PyQt5.QtCore import Qt, QTimer, QSize
from datetime import datetime
from pymodbus.client import ModbusSerialClient
import serial.tools.list_ports
import serial
import numpy as np
import re
import pandas as pd
import pyqtgraph as pg  # For real-time graphing
# base_path = sys._MEIPASS


# -------------------------------
# UI PATH
# -------------------------------
base_path = os.path.dirname(os.path.abspath(__file__))
ui_path = os.path.join(base_path, "utm.ui")

# -------------------------------
# PLC Settings (from main.py)
# -------------------------------
BAUDRATE = 9600
TIMEOUT = 1
REG_X = 10   # R10 → distance (16-bit int)
REG_Y = 14   # R14 → force (32-bit float: R14+R15)
REG_F= 100   # R100 → Force in grams (setttings screen)
REG_G= 101   # R101 → Real-time Plc Value (setttings screen)
REG_Z = 5    # R5 → If 1 than Start->Enable If 0 than Start -> Disable 
REG_WEIGHT = 102       # R16 → Weight range parameter
COIL_START = 2003   # M3
COIL_STOP = 2006    # M6
COIL_RESET = 2004   # M4
COIL_TEAR = 2007    # M7
COIL_NORMAL = 2100    # M100 → Normal mode
COIL_TARE_S = 2101    # M101 → Settings Tare mode (1-sec pulse)
COIL_CALIBRATE = 2102 # M102 → Calibrate mode
# -------------------------------

# -------------------------------
# Worker Thread for Modbus Communication
# -------------------------------
class ModbusWorker(QThread):
    # Define signals to update UI
    data_updated = pyqtSignal(int, float)  # (distance, force) - Updated for float
    connection_status = pyqtSignal(bool, str)  # (connected, message)
    error_occurred = pyqtSignal(str)  # error message
    z_register_updated = pyqtSignal(int)  # New signal for REG_Z value
    settings_data_updated = pyqtSignal(int, int)  # (r100_grams, r101_raw) - Decoupled from force_r14
    
    def __init__(self):
        super().__init__()
        self.modbus_client = None
        self.com_port = None
        self.running = False
        self.process_active = False
        self.device_id = 1
        self.update_interval = 500  # 500ms polling (from main.py)
        self.z_register_value = 0  # Store REG_Z value
        
    def set_com_port(self, com_port):
        """Set COM port for Modbus connection"""
        self.com_port = com_port
        
    def connect_modbus(self):
        """Connect to Modbus device"""
        try:
            if not self.com_port:
                self.error_occurred.emit("No COM port specified!")
                return False
                
            # Close existing client if any
            if self.modbus_client:
                try:
                    self.modbus_client.close()
                except:
                    pass
                    
            self.modbus_client = ModbusSerialClient(
                port=self.com_port,
                baudrate=BAUDRATE,
                bytesize=8,
                parity='E',  # even parity (from main.py)
                stopbits=1,
                timeout=TIMEOUT
            )
            
            if self.modbus_client.connect():
                self.connection_status.emit(True, f"Connected to {self.com_port}")
                return True
            else:
                self.connection_status.emit(False, "Failed to connect to PLC")
                return False
                
        except Exception as e:
            self.error_occurred.emit(f"Connection error: {str(e)}")
            return False
    
    def read_z_register(self):
        """Read REG_Z register (R5)"""
        if not self.modbus_client or not self.modbus_client.connected:
            return None
            
        try:
            resp_z = self.modbus_client.read_holding_registers(REG_Z, count=1)
            if resp_z is None or not resp_z.registers:
                return None
            
            z_value = resp_z.registers[0]
            return z_value
                
        except Exception as e:
            print(f"Read REG_Z error: {e}")
            return None
    
    def start_process(self):
        """Start the process by writing to coils (from main.py)"""
        if not self.modbus_client or not self.modbus_client.connected:
            self.error_occurred.emit("Not connected to Modbus device")
            return False
            
        try:
            # Write coils according to main.py logic
            self.modbus_client.write_coil(COIL_START, True)
            self.modbus_client.write_coil(COIL_RESET, False)
            self.modbus_client.write_coil(COIL_STOP, False)
            self.modbus_client.write_coil(COIL_TEAR, False)  # Ensure M7 is off when starting
            
            self.process_active = True
            return True
                
        except Exception as e:
            self.error_occurred.emit(f"Error starting process: {str(e)}")
            return False
    
    def stop_process(self):
        """Stop the process by writing to coils (from main.py)"""
        if not self.modbus_client or not self.modbus_client.connected:
            return True 
            
        try:
            # Write coils according to main.py logic
            self.modbus_client.write_coil(COIL_STOP, True)
            self.modbus_client.write_coil(COIL_START, False)
            self.modbus_client.write_coil(COIL_RESET, False)
            self.modbus_client.write_coil(COIL_TEAR, False)  # Ensure M7 is off when stopping
            
            self.process_active = False
            return True
                
        except Exception as e:
            self.error_occurred.emit(f"Error stopping process: {str(e)}")
            return False
    
    def reset_process(self):
        """Reset process by writing to coils (from main.py)"""
        if not self.modbus_client or not self.modbus_client.connected:
            return True
            
        try:
            # Write coils according to main.py logic
            self.modbus_client.write_coil(COIL_RESET, True)
            self.modbus_client.write_coil(COIL_STOP, False)
            self.modbus_client.write_coil(COIL_START, False)
            self.modbus_client.write_coil(COIL_TEAR, False)  # Ensure M7 is off when resetting
            
            # Note: Don't clear data here - let UI handle it
            return True
                
        except Exception as e:
            self.error_occurred.emit(f"Error resetting process: {str(e)}")
            return False
    
    def turn_on_tear(self):
        """Turn on coil M7 (Tear function)"""
        if not self.modbus_client or not self.modbus_client.connected:
            self.error_occurred.emit("Not connected to Modbus device")
            return False
            
        try:
            # Turn on M7 coil (Tear function)
            self.modbus_client.write_coil(COIL_TEAR, True)
            
            # Turn off other coils to avoid conflicts
            self.modbus_client.write_coil(COIL_START, False)
            self.modbus_client.write_coil(COIL_STOP, False)
            self.modbus_client.write_coil(COIL_RESET, False)
            
            # Set process as inactive when Tear is activated
            self.process_active = False
            
            return True
                
        except Exception as e:
            self.error_occurred.emit(f"Error turning on Tear (M7): {str(e)}")
            return False
    
    def turn_off_tear(self):
        """Turn off coil M7"""
        if not self.modbus_client or not self.modbus_client.connected:
            return True
            
        try:
            # Turn off M7 coil
            result = self.modbus_client.write_coil(COIL_TEAR, False)
            return True
                
        except Exception as e:
            print(f"Error turning off Tear (M7): {str(e)}")
            return False
    
    def turn_on_settings_normal(self):
        """Turn on coil M100 (Settings Normal)"""
        if not self.modbus_client or not self.modbus_client.connected:
            self.error_occurred.emit("Not connected to Modbus device")
            return False
            
        try:
            self.modbus_client.write_coil(COIL_NORMAL, True)
            return True
        except Exception as e:
            self.error_occurred.emit(f"Error turning on Settings Normal (M100): {str(e)}")
            return False

    def turn_off_settings_normal(self):
        """Turn off coil M100 (Settings Normal)"""
        if not self.modbus_client or not self.modbus_client.connected:
            return True
            
        try:
            self.modbus_client.write_coil(COIL_NORMAL, False)
            return True
        except Exception as e:
            print(f"Error turning off Settings Normal (M100): {str(e)}")
            return False

    def turn_on_settings_tare(self):
        """Turn on coil M101 (Settings Tare)"""
        if not self.modbus_client or not self.modbus_client.connected:
            self.error_occurred.emit("Not connected to Modbus device")
            return False
            
        try:
            self.modbus_client.write_coil(COIL_TARE_S, True)
            return True
        except Exception as e:
            self.error_occurred.emit(f"Error turning on Settings Tare (M101): {str(e)}")
            return False

    def turn_off_settings_tare(self):
        """Turn off coil M101 (Settings Tare)"""
        if not self.modbus_client or not self.modbus_client.connected:
            return True
            
        try:
            self.modbus_client.write_coil(COIL_TARE_S, False)
            return True
        except Exception as e:
            print(f"Error turning off Settings Tare (M101): {str(e)}")
            return False
    
    def write_weight_register(self, value):
        """Write weight range parameter to R102 register"""
        if not self.modbus_client or not self.modbus_client.connected:
            self.error_occurred.emit("Not connected to Modbus device")
            return False
            
        try:
            self.modbus_client.write_register(REG_WEIGHT, int(value))
            return True
        except Exception as e:
            self.error_occurred.emit(f"Error writing weight register: {str(e)}")
            return False

    def write_mode_coil(self, mode):
        """Write mode selection to M-bit coils (M100: Normal, M102: Calibrate)"""
        if not self.modbus_client or not self.modbus_client.connected:
            self.error_occurred.emit("Not connected to Modbus device")
            return False
            
        try:
            if mode == 'normal':
                self.modbus_client.write_coil(COIL_NORMAL, True)
                self.modbus_client.write_coil(COIL_CALIBRATE, False)
            elif mode == 'calibrate':
                self.modbus_client.write_coil(COIL_NORMAL, False)
                self.modbus_client.write_coil(COIL_CALIBRATE, True)
            return True
        except Exception as e:
            self.error_occurred.emit(f"Error setting mode coil: {str(e)}")
            return False

    def read_registers(self):
        """Read distance and force registers (from main.py)"""
        if not self.modbus_client or not self.modbus_client.connected:
            return None, None
            
        try:
            # Read distance (16-bit int) from register 10
            resp_x = self.modbus_client.read_holding_registers(REG_X, count=1)
            
            # Read force (32-bit float, R14+R15)
            resp_y = self.modbus_client.read_holding_registers(REG_Y, count=2)
            
            if resp_x is None or resp_y is None:
                return None, None
            
            # Distance (16-bit int)
            x = resp_x.registers[0] if resp_x.registers else 0
            
            # Force 32-bit float IEEE-754 (FATEK)
            # From main.py: R14 = low word, R15 = high word
            r14 = resp_y.registers[0] if len(resp_y.registers) > 0 else 0  # low word
            r15 = resp_y.registers[1] if len(resp_y.registers) > 1 else 0  # high word
            
            # Correct byte order: little-endian per register, R14 first, R15 second
            # From main.py: <H for unsigned short (2 bytes), <f for float (4 bytes)
            r14_bytes = struct.pack('<H', r14)  # low word bytes
            r15_bytes = struct.pack('<H', r15)  # high word bytes
            b = r14_bytes + r15_bytes
            
            y = struct.unpack('<f', b)[0] if b else 0.0
            
            return x, y
                
        except Exception as e:
            print(f"Read error: {e}")
            return None, None

    def read_settings_registers(self):
        """Read settings registers: R100 (REG_F) and R101 (REG_G)"""
        if not self.modbus_client or not self.modbus_client.connected:
            return None, None
            
        try:
            # Read 2 registers starting from REG_F (R100)
            resp = self.modbus_client.read_holding_registers(REG_F, count=2)
            if resp is None or resp.isError() or not resp.registers or len(resp.registers) < 2:
                return None, None
                
            r100 = resp.registers[0]
            r101 = resp.registers[1]
            
            # Convert to signed 16-bit integers
            r100_signed = r100 - 65536 if r100 > 32767 else r100
            r101_signed = r101 - 65536 if r101 > 32767 else r101
            
            return r100_signed, r101_signed
        except Exception as e:
            print(f"Read settings registers error: {e}")
            return None, None
    
    def run(self):
        """Main thread loop for continuous reading"""
        self.running = True
        
        while self.running:
            if self.modbus_client and self.modbus_client.connected:
                # Always read REG_Z when connected
                z_value = self.read_z_register()
                if z_value is not None and z_value != self.z_register_value:
                    self.z_register_value = z_value
                    self.z_register_updated.emit(z_value)
                
                # Read distance and force continuously
                distance, force = self.read_registers()
                if distance is not None and force is not None:
                    self.data_updated.emit(distance, force)
                    
                    # Read settings registers
                    r100, r101 = self.read_settings_registers()
                    if r100 is not None and r101 is not None:
                        self.settings_data_updated.emit(r100, r101)
            
            # Sleep for update interval (500ms from main.py)
            self.msleep(self.update_interval)
    
    def stop(self):
        """Stop the thread"""
        self.running = False
        self.process_active = False
        # Do NOT call self.wait() here, it should be called by the main thread
        
        # Close Modbus connection
        try:
            if self.modbus_client:
                self.modbus_client.close()
        except:
            pass

# -------------------------------
# Auto-detect USB-RS232 converter
# -------------------------------
def auto_detect_serial_port():
    """Auto-detect serial ports and return list of available ports"""
    ports = serial.tools.list_ports.comports()
    available_ports = []
    
    for port in ports:
        desc = port.description.lower()
        # Check for common USB-to-serial converters
        if ("ch340" in desc or "usb" in desc or "serial" in desc or 
            "ftdi" in desc or "prolific" in desc or "cp210" in desc or
            "rs-232" in desc or "rs232" in desc):
            # For known converters, we list them without opening to avoid UI hangs
            available_ports.append({
                'device': port.device,
                'description': port.description,
                'hwid': port.hwid
            })
        else:
            # For other ports, just list them
            available_ports.append({
                'device': port.device,
                'description': port.description,
                'hwid': port.hwid
            })
    
    # Sort ports by COM port number
    available_ports.sort(key=lambda x: int(re.search(r'COM(\d+)', x['device'], re.IGNORECASE).group(1)) 
                         if re.search(r'COM(\d+)', x['device'], re.IGNORECASE) else 999)
    
    return available_ports

def get_best_auto_detected_port():
    """Get the best auto-detected port (for initial selection)"""
    ports = auto_detect_serial_port()
    if ports:
        # Try to find a USB-to-serial converter first
        for port in ports:
            desc = port['description'].lower()
            if ("ch340" in desc or "usb" in desc or "ftdi" in desc or 
                "prolific" in desc or "cp210" in desc):
                return port['device']
        # If no USB converter found, return the first port
        return ports[0]['device']
    return None

# -------------------------------
# Settings Screen Class
# -------------------------------
class SettingsScreen(QtWidgets.QWidget):
    def __init__(self, modbus_worker, parent=None):
        super().__init__(parent)
        self.setObjectName("screen_settings")
        self.modbus_worker = modbus_worker
        self.current_mode = "Normal"
        
        # Single shot timer for Normal (Coil M100) 1-second auto turn off
        self.normal_timer = QTimer()
        self.normal_timer.setSingleShot(True)
        self.normal_timer.timeout.connect(self.auto_turn_off_normal)
        
        # Single shot timer for Tare (Coil M101) 1-second auto turn off
        self.tare_timer = QTimer()
        self.tare_timer.setSingleShot(True)
        self.tare_timer.timeout.connect(self.auto_turn_off_tare)
        
        self.setup_ui()

    def setup_ui(self):
        self.setStyleSheet("background-color: #F8FAFC;")
        
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(20, 20, 20, 20)
        main_layout.setSpacing(15)
        
        # Header Card
        header_card = QFrame()
        header_card.setStyleSheet("""
            QFrame {
                background-color: #FFFFFF;
                border: 1px solid #E2E8F0;
                border-radius: 12px;
            }
        """)
        header_layout = QVBoxLayout(header_card)
        header_layout.setContentsMargins(24, 18, 24, 18)
        header_layout.setSpacing(6)
        
        lbl_subtitle_top = QtWidgets.QLabel("⚙ CALIBRATION UTILITY")
        lbl_subtitle_top.setStyleSheet("color: #3B82F6; font-size: 11px; font-weight: bold; letter-spacing: 1px;")
        
        lbl_title = QtWidgets.QLabel("Load Cell Calibration")
        lbl_title.setStyleSheet("color: #0F172A; font-size: 24px; font-weight: bold;")
        
        lbl_desc = QtWidgets.QLabel("Configure load cell calibration inputs and monitor real-time force register telemetry.")
        lbl_desc.setStyleSheet("color: #64748B; font-size: 13px;")
        
        header_layout.addWidget(lbl_subtitle_top)
        header_layout.addWidget(lbl_title)
        header_layout.addWidget(lbl_desc)
        
        main_layout.addWidget(header_card)
        
        # Cards Container (Horizontal Layout)
        cards_layout = QtWidgets.QHBoxLayout()
        cards_layout.setSpacing(15)
        
        # Card 1: Calibration Parameters
        card_left = QFrame()
        card_left.setStyleSheet("""
            QFrame {
                background-color: #FFFFFF;
                border: 1px solid #E2E8F0;
                border-radius: 12px;
            }
        """)
        left_layout = QVBoxLayout(card_left)
        left_layout.setContentsMargins(24, 20, 24, 24)
        left_layout.setSpacing(16)
        
        left_header = QtWidgets.QHBoxLayout()
        icon_param = QtWidgets.QLabel("🎛")
        icon_param.setStyleSheet("font-size: 18px; color: #3B82F6;")
        lbl_param_title = QtWidgets.QLabel("Calibration Parameters")
        lbl_param_title.setStyleSheet("font-size: 18px; font-weight: bold; color: #0F172A;")
        left_header.addWidget(icon_param)
        left_header.addWidget(lbl_param_title)
        left_header.addStretch()
        left_layout.addLayout(left_header)
        
        divider1 = QFrame()
        divider1.setFrameShape(QFrame.HLine)
        divider1.setStyleSheet("color: #F1F5F9;")
        left_layout.addWidget(divider1)
        
        lbl_weight_title = QtWidgets.QLabel("🔒 Weight Range (0-1000)")
        lbl_weight_title.setStyleSheet("font-size: 13px; font-weight: 600; color: #334155;")
        left_layout.addWidget(lbl_weight_title)
        
        weight_input_layout = QtWidgets.QHBoxLayout()
        self.spin_weight = QtWidgets.QSpinBox()
        self.spin_weight.setRange(0, 1000)
        self.spin_weight.setValue(100)
        self.spin_weight.setFixedHeight(42)
        self.spin_weight.setStyleSheet("""
            QSpinBox {
                border: 1px solid #CBD5E1;
                border-radius: 8px;
                padding: 0 12px;
                font-size: 14px;
                color: #0F172A;
                background-color: #FFFFFF;
            }
            QSpinBox:focus {
                border: 2px solid #3B82F6;
            }
        """)
        
        btn_send = QPushButton("Send")
        btn_send.setFixedSize(85, 42)
        btn_send.setCursor(QtCore.Qt.PointingHandCursor)
        btn_send.setStyleSheet("""
            QPushButton {
                background-color: #6366F1;
                color: white;
                font-size: 14px;
                font-weight: bold;
                border-radius: 8px;
                border: none;
            }
            QPushButton:hover {
                background-color: #4F46E5;
            }
            QPushButton:pressed {
                background-color: #4338CA;
            }
        """)
        btn_send.clicked.connect(self.on_send_weight)
        
        weight_input_layout.addWidget(self.spin_weight)
        weight_input_layout.addWidget(btn_send)
        left_layout.addLayout(weight_input_layout)
        
        left_layout.addSpacing(10)
        
        lbl_mode_title = QtWidgets.QLabel("🎛 Input Mode Selection")
        lbl_mode_title.setStyleSheet("font-size: 13px; font-weight: 600; color: #334155;")
        left_layout.addWidget(lbl_mode_title)
        
        mode_btn_layout = QtWidgets.QHBoxLayout()
        mode_btn_layout.setSpacing(10)
        
        self.btn_normal = QPushButton("Normal")
        self.btn_tare = QPushButton("Tare")
        self.btn_calib = QPushButton("Calibrate")
        
        for btn in (self.btn_normal, self.btn_tare, self.btn_calib):
            btn.setFixedHeight(42)
            btn.setCursor(QtCore.Qt.PointingHandCursor)
        
        self.btn_normal.clicked.connect(self.activate_normal)
        self.btn_tare.clicked.connect(self.activate_tare)
        self.btn_calib.clicked.connect(lambda: self.set_input_mode("Calibrate"))
        
        mode_btn_layout.addWidget(self.btn_normal)
        mode_btn_layout.addWidget(self.btn_tare)
        mode_btn_layout.addWidget(self.btn_calib)
        left_layout.addLayout(mode_btn_layout)
        
        status_layout = QtWidgets.QHBoxLayout()
        lbl_curr_tag = QtWidgets.QLabel("Current:")
        lbl_curr_tag.setStyleSheet("color: #64748B; font-size: 12px;")
        
        self.lbl_curr_val = QtWidgets.QLabel("Normal")
        self.lbl_curr_val.setStyleSheet("""
            background-color: #F1F5F9;
            color: #0F172A;
            font-size: 12px;
            font-weight: bold;
            padding: 3px 8px;
            border-radius: 4px;
            border: 1px solid #E2E8F0;
        """)
        status_layout.addWidget(lbl_curr_tag)
        status_layout.addWidget(self.lbl_curr_val)
        status_layout.addStretch()
        
        left_layout.addLayout(status_layout)
        left_layout.addStretch()
        
        # Card 2: Live Calibration Reads
        card_right = QFrame()
        card_right.setStyleSheet("""
            QFrame {
                background-color: #FFFFFF;
                border: 1px solid #E2E8F0;
                border-radius: 12px;
            }
        """)
        right_layout = QVBoxLayout(card_right)
        right_layout.setContentsMargins(24, 20, 24, 24)
        right_layout.setSpacing(16)
        
        right_header = QtWidgets.QHBoxLayout()
        icon_reads = QtWidgets.QLabel("📈")
        icon_reads.setStyleSheet("font-size: 18px; color: #10B981;")
        lbl_reads_title = QtWidgets.QLabel("Live Calibration Reads")
        lbl_reads_title.setStyleSheet("font-size: 18px; font-weight: bold; color: #0F172A;")
        right_header.addWidget(icon_reads)
        right_header.addWidget(lbl_reads_title)
        right_header.addStretch()
        right_layout.addLayout(right_header)
        
        divider2 = QFrame()
        divider2.setFrameShape(QFrame.HLine)
        divider2.setStyleSheet("color: #F1F5F9;")
        right_layout.addWidget(divider2)
        
        self.card_metric1, self.lbl_val1 = self.create_metric_box("REAL-TIME FORCE", "--", "#10B981")
        right_layout.addWidget(self.card_metric1)
        
        self.card_metric2, self.lbl_val2 = self.create_metric_box("RAW FORCE VALUE", "--", "#2563EB")
        right_layout.addWidget(self.card_metric2)
        
        self.card_metric3, self.lbl_val3 = self.create_metric_box("PLC REAL-TIME VALUE", "--", "#D97706")
        right_layout.addWidget(self.card_metric3)
        
        right_layout.addStretch()
        
        cards_layout.addWidget(card_left, 1)
        cards_layout.addWidget(card_right, 1)
        
        main_layout.addLayout(cards_layout)
        
        self.update_mode_button_styles()

    def create_metric_box(self, label_text, default_val, color_hex):
        box = QFrame()
        box.setFixedHeight(54)
        box.setStyleSheet("""
            QFrame {
                background-color: #F8FAFC;
                border: 1px solid #E2E8F0;
                border-radius: 8px;
            }
        """)
        box_layout = QtWidgets.QHBoxLayout(box)
        box_layout.setContentsMargins(16, 0, 16, 0)
        
        lbl_tag = QtWidgets.QLabel(label_text)
        lbl_tag.setStyleSheet("color: #64748B; font-size: 11px; font-weight: bold; letter-spacing: 0.5px;")
        
        lbl_val = QtWidgets.QLabel(default_val)
        lbl_val.setStyleSheet(f"color: {color_hex}; font-size: 18px; font-weight: bold;")
        
        box_layout.addWidget(lbl_tag)
        box_layout.addStretch()
        box_layout.addWidget(lbl_val)
        
        return box, lbl_val

    def set_input_mode(self, mode):
        self.current_mode = mode
        self.lbl_curr_val.setText(mode)
        self.update_mode_button_styles()
        
        if self.modbus_worker:
            mode_lower = mode.lower()
            success = self.modbus_worker.write_mode_coil(mode_lower)
            if success:
                print(f"✅ PLC Mode set to: {mode}")

    def update_mode_button_styles(self):
        active_style = """
            QPushButton {
                background-color: #EFF6FF;
                border: 2px solid #3B82F6;
                color: #2563EB;
                font-size: 13px;
                font-weight: bold;
                border-radius: 8px;
            }
        """
        inactive_style = """
            QPushButton {
                background-color: #FFFFFF;
                border: 1px solid #E2E8F0;
                color: #64748B;
                font-size: 13px;
                font-weight: 500;
                border-radius: 8px;
            }
            QPushButton:hover {
                background-color: #F8FAFC;
                color: #334155;
            }
        """
        self.btn_normal.setStyleSheet(active_style if self.current_mode == "Normal" else inactive_style)
        self.btn_tare.setStyleSheet(active_style if self.current_mode == "Tare" else inactive_style)
        self.btn_calib.setStyleSheet(active_style if self.current_mode == "Calibrate" else inactive_style)

    def on_send_weight(self):
        val = self.spin_weight.value()
        if self.modbus_worker:
            success = self.modbus_worker.write_weight_register(val)
            if success:
                QMessageBox.information(self, "Success", f"Weight parameter {val} sent to register R16!")
            else:
                QMessageBox.warning(self, "Warning", "Not connected to PLC or error writing register.")

    def activate_normal(self):
        """Activate Settings Normal (Coil M100) for 1 second identical to Tare behavior"""
        self.current_mode = "Normal"
        self.lbl_curr_val.setText("Normal")
        self.update_mode_button_styles()
        
        if self.modbus_worker:
            if self.modbus_worker.turn_on_settings_normal():
                print("✅ Settings: Normal (M100) turned ON - 1s Timer started")
                self.normal_timer.start(1000)
            else:
                QMessageBox.warning(self, "Error", "Not connected to PLC or failed to turn on Normal (M100)!")

    def auto_turn_off_normal(self):
        """Automatically turn off Coil M100 after 1 second"""
        if self.modbus_worker:
            self.modbus_worker.turn_off_settings_normal()
            print("⏹ Settings: Normal (M100) automatically turned OFF after 1 second")

    def activate_tare(self):
        """Activate Settings Tare (Coil M101) for 1 second identical to M7 behavior"""
        self.current_mode = "Tare"
        self.lbl_curr_val.setText("Tare")
        self.update_mode_button_styles()
        
        if self.modbus_worker:
            if self.modbus_worker.turn_on_settings_tare():
                print("✅ Settings: Tare (M101) turned ON")
                self.tare_timer.start(1000)
            else:
                QMessageBox.warning(self, "Error", "Not connected to PLC or failed to turn on Tare (M101)!")

    def auto_turn_off_tare(self):
        """Automatically turn off Coil M101 after 1 second"""
        if self.modbus_worker:
            self.modbus_worker.turn_off_settings_tare()
            print("⏹ Settings: Tare (M101) automatically turned OFF after 1 second")

    def update_telemetry(self, distance, force):
        """Update live force telemetry from R14 - independent of R100/R101"""
        if not self.isVisible():
            return
        self.lbl_val1.setText(f"{force:.3f} mN")

    def update_settings_telemetry(self, r100, r101):
        """Update R100/R101 telemetry on settings screen - independent of R14"""
        if not self.isVisible():
            return
        self.lbl_val2.setText(f"{r101}")
        self.lbl_val3.setText(f"{r100} g")


# -------------------------------
# Main Window Class
# -------------------------------
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        
        # Load .ui file
        uic.loadUi(ui_path, self)

        # ------------------------------------------
        # CREATE LOGS FOLDER FOR ALL CSV STORAGE
        # ------------------------------------------
        self.logs_folder = os.path.join(base_path, "logs")

        # Create the folder if not present
        if not os.path.exists(self.logs_folder):
            os.makedirs(self.logs_folder)
        # -----------------------------------------
        
        # Initialize variables
        self.com_port = None
        self.process_running = False
        self.tear_active = False  # Track M7 (Tear) state
        self.data_log = []  # Store (distance, force, timestamp) tuples
        self.csv_file = None  # CSV file object for real-time data logging
        self.csv_writer = None  # CSV writer object
        self.csv_file_path = None  # Path to the CSV file
        self.is_logging_data = False  # Flag to track if data logging is active
        self.csv_files = []  # List to store CSV file paths
        self.current_loaded_file = None  # Currently loaded CSV file path
        self.z_register_value = 0  # Store REG_Z value
        
        # Timer for automatic tear turn-off
        self.tear_timer = QTimer()
        self.tear_timer.setSingleShot(True)  # One-shot timer
        self.tear_timer.timeout.connect(self.auto_turn_off_tear)
        
        # Setup UI
        self.setup_ui()
        # Debug UI setup
        self.debug_ui_setup()
        
        # Initialize Modbus worker thread
        self.modbus_worker = ModbusWorker()
        
        # Initialize Settings screen widget
        self.screen_settings = SettingsScreen(self.modbus_worker, parent=self.centralwidget)
        self.screen_settings.setGeometry(0, 69, 1031, 531)
        self.screen_settings.hide()

        # Connect worker signals to slots
        self.modbus_worker.data_updated.connect(self.update_data_display)
        self.modbus_worker.data_updated.connect(self.screen_settings.update_telemetry)
        self.modbus_worker.settings_data_updated.connect(self.screen_settings.update_settings_telemetry)
        self.modbus_worker.connection_status.connect(self.handle_connection_status)
        self.modbus_worker.error_occurred.connect(self.handle_error)
        self.modbus_worker.z_register_updated.connect(self.handle_z_register_update)
        
        # Setup real-time graphs for both screens
        self.setup_graphs()
        
        # Start application directly with Main Menu
        self.handle_screen_change(2)
        
        # Auto-detect and populate COM ports on startup
        self.populate_com_ports()

    def setup_ui(self):
        """Initialize UI components"""
        # Set button icons (if needed)
        self.setup_icons()
        
        # Connect button signals
        self.connect_signals()
        
        # Initialize screen 5 (Process Mode) controls
        self.init_process_screen()
        
        # Create and setup COM port combobox on screen_2
        self.setup_com_port_ui()

    def setup_com_port_ui(self):
        """Setup COM port selection UI in MAIN WINDOW - Top right corner"""
        try:
            # Get main window dimensions
            main_window_width = self.width()
            main_window_height = self.height()
            
            print(f"DEBUG: Main window size: {main_window_width}x{main_window_height}")
            
            # Calculate positions for top right corner of main window
            # We'll place them in the top right area, near the window edge
            
            # Define total width needed for all controls
            total_width_needed = 600  # Approximate total width
            
            # Start position from right edge
            start_x = main_window_width - total_width_needed - 20  # 20px margin from right
            
            # TOP ROW: Label, ComboBox, Connect/Disconnect button, Refresh
            y_position = 10  # Near top of window
            
            # Create a label for COM port selection - IN MAIN WINDOW
            self.com_port_label = QtWidgets.QLabel("Select COM Port:", self)
            self.com_port_label.setGeometry(start_x, y_position, 150, 30)
            self.com_port_label.setStyleSheet("""
                font-size: 14px; 
                font-weight: bold;
                background-color: transparent;
            """)
            self.com_port_label.show()
            
            # Create combobox for COM port selection - IN MAIN WINDOW
            self.com_port_combo = QComboBox(self)
            self.com_port_combo.setGeometry(start_x + 160, y_position, 200, 30)
            self.com_port_combo.setStyleSheet("""
                QComboBox {
                    font-size: 14px;
                    padding: 5px;
                    border: 1px solid #ccc;
                    border-radius: 3px;
                    background-color: white;
                }
            """)
            self.com_port_combo.show()
            
            # Create SINGLE button that toggles between Connect/Disconnect - IN MAIN WINDOW
            self.connect_disconnect_button = QPushButton("Connect", self)
            self.connect_disconnect_button.setGeometry(start_x + 370, y_position, 100, 30)
            self.connect_disconnect_button.setStyleSheet("""
                QPushButton {
                    font-size: 14px;
                    font-weight: bold;
                    background-color: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    padding: 5px;
                }
                QPushButton:hover {
                    background-color: #45a049;
                }
                QPushButton:disabled {
                    background-color: #cccccc;
                }
            """)
            self.connect_disconnect_button.clicked.connect(self.toggle_connection)
            self.connect_disconnect_button.show()
            
            # Create refresh button - IN MAIN WINDOW
            self.refresh_button = QPushButton("Refresh", self)
            self.refresh_button.setGeometry(start_x + 480, y_position, 100, 30)
            self.refresh_button.setStyleSheet("""
                QPushButton {
                    font-size: 14px;
                    font-weight: bold;
                    background-color: #008CBA;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    padding: 5px;
                }
                QPushButton:hover {
                    background-color: #007B9E;
                }
            """)
            self.refresh_button.clicked.connect(self.populate_com_ports)
            self.refresh_button.show()
            
            # BOTTOM ROW: Status only (no separate disconnect button)
            y_position_bottom = y_position + 40  # 40px below top row
            
            # Create status label - IN MAIN WINDOW
            self.connection_status_label = QtWidgets.QLabel("Status: Not Connected", self)
            self.connection_status_label.setGeometry(start_x, y_position_bottom, 580, 30)
            self.connection_status_label.setStyleSheet("""
                font-size: 14px; 
                color: #ff0000;
                background-color: transparent;
            """)
            self.connection_status_label.show()
            
            print(f"DEBUG: COM port controls placed in main window at x={start_x}")
            
        except Exception as e:
            print(f"COM port UI setup error (main window): {e}")
            import traceback
            traceback.print_exc()

    def toggle_connection(self):
        """Toggle between connecting and disconnecting"""
        if self.connect_disconnect_button.text() == "Connect":
            self.connect_to_selected_port()
        else:  # Button says "Disconnect"
            self.disconnect_modbus()

    def populate_com_ports(self):
        """Populate the COM port combobox with available ports"""
        try:
            # Clear current items
            self.com_port_combo.clear()
            
            # Get available ports
            ports = auto_detect_serial_port()
            
            if not ports:
                self.com_port_combo.addItem("No COM ports found")
                self.com_port_combo.setEnabled(False)
                self.connect_disconnect_button.setEnabled(False)
                self.connect_disconnect_button.setText("Connect")
                self.connection_status_label.setText("Status: No COM ports available")
                return
            
            # Add ports to combobox
            for port in ports:
                display_text = f"{port['device']} - {port['description']}"
                self.com_port_combo.addItem(display_text, port['device'])
            
            # Auto-select the best port if available
            auto_port = get_best_auto_detected_port()
            if auto_port:
                for i in range(self.com_port_combo.count()):
                    if self.com_port_combo.itemData(i) == auto_port:
                        self.com_port_combo.setCurrentIndex(i)
                        break
            
            self.com_port_combo.setEnabled(True)
            self.connect_disconnect_button.setEnabled(True)
            self.connect_disconnect_button.setText("Connect")
            self.connection_status_label.setText("Status: Select a COM port and click Connect")
            
        except Exception as e:
            print(f"Error populating COM ports: {e}")
            self.com_port_combo.addItem("Error detecting ports")
            self.com_port_combo.setEnabled(False)
            self.connect_disconnect_button.setEnabled(False)

    def connect_to_selected_port(self):
        """Connect to the selected COM port"""
        if self.com_port_combo.currentIndex() < 0:
            QMessageBox.warning(self, "Warning", "Please select a COM port first!")
            return
        
        selected_text = self.com_port_combo.currentText()
        selected_port = self.com_port_combo.currentData()
        
        if not selected_port or selected_port == "No COM ports found":
            QMessageBox.warning(self, "Warning", "Invalid COM port selected!")
            return
        
        # Update status
        self.connection_status_label.setText(f"Status: Connecting to {selected_port}...")
        self.connection_status_label.setStyleSheet("font-size: 14px; color: #ff9800;")
        QApplication.processEvents()  # Update UI immediately
        
        # Set COM port in worker
        self.modbus_worker.set_com_port(selected_port)
        
        # Attempt to connect
        connection_success = False
        try:
            connection_success = self.modbus_worker.connect_modbus()
        except Exception as e:
            print(f"Connection exception: {e}")
            
        if connection_success:
            # Update UI to connected state
            self.com_port = selected_port
            self.connect_disconnect_button.setText("Disconnect")
            self.connect_disconnect_button.setStyleSheet("""
                QPushButton {
                    font-size: 14px;
                    font-weight: bold;
                    background-color: #f44336;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    padding: 5px;
                }
                QPushButton:hover {
                    background-color: #d32f2f;
                }
            """)
            
            # Disable selection widgets
            self.com_port_combo.setEnabled(False)
            self.refresh_button.setEnabled(False)
            
            # Update status
            self.connection_status_label.setText("Status: Connected")
            self.connection_status_label.setStyleSheet("font-size: 14px; color: #4CAF50;")
            
            # Start the worker thread
            if not self.modbus_worker.isRunning():
                self.modbus_worker.start()
                
            # Update process mode buttons if we're on that screen
            if self.screen_5.isVisible():
                self.button_8.setEnabled(False)
                self.button_9.setEnabled(True)
                self.button_10.setEnabled(True)
                self.button_10.setText("Tear")
                self.update_start_button_state()
                
            print(f"✅ Connected to {selected_port}")
        else:
            # Connection failed
            self.connection_status_label.setText("Status: Connection failed")
            self.connection_status_label.setStyleSheet("font-size: 14px; color: #ff0000;")
            print(f"❌ Failed to connect to {selected_port}")

    def disconnect_modbus(self):
        """Disconnect from Modbus"""
        # Stop the worker thread
        if self.modbus_worker.isRunning():
            self.modbus_worker.stop()
            self.modbus_worker.wait()
        
        # Update UI - Change button back to Connect
        self.connect_disconnect_button.setText("Connect")
        self.connect_disconnect_button.setStyleSheet("""
            QPushButton {
                font-size: 14px;
                font-weight: bold;
                background-color: #4CAF50;
                color: white;
                border: none;
                border-radius: 5px;
                padding: 5px;
            }
            QPushButton:hover {
                background-color: #45a049;
            }
            QPushButton:disabled {
                background-color: #cccccc;
            }
        """)
        
        self.com_port_combo.setEnabled(True)
        self.refresh_button.setEnabled(True)
        
        # Update status
        self.connection_status_label.setText("Status: Disconnected")
        self.connection_status_label.setStyleSheet("font-size: 14px; color: #ff0000;")
        
        # Update process mode buttons if we're on that screen
        if self.screen_5.isVisible():
            self.button_7.setEnabled(False)   # Disable Start button
            self.button_8.setEnabled(False)   # Disable Stop button
            self.button_9.setEnabled(False)   # Disable Reset button
            self.button_10.setEnabled()  # Disable Tear button
        
        print("🔌 Modbus disconnected")

    def setup_icons(self):
        """Set icons for buttons (keeping for consistency)"""
        try:
            # Any icons needed for other screens can be set here
            pass
        except Exception as e:
            print(f"Icon setup error: {e}")

    def connect_signals(self):
        # Navigation & Main Menu Layout Alignment
        self.button_A.clicked.connect(self.handle_back_pressed)
        
        # Fit container card and buttons cleanly inside label_50
        if hasattr(self, 'label_50'):
            self.label_50.setGeometry(60, 95, 380, 260)
            self.label_50.raise_()

        if hasattr(self, 'button_2'):
            self.button_2.setGeometry(100, 120, 300, 55)
            self.button_2.raise_()
            self.button_2.clicked.connect(lambda: self.handle_screen_change(5))  # Process Mode

        if hasattr(self, 'button_17'):
            self.button_17.setGeometry(100, 195, 300, 55)
            self.button_17.raise_()
            self.button_17.clicked.connect(lambda: self.handle_screen_change(7))  # Process Logs

        # Settings Button on Main Menu (screen_2)
        self.button_settings = QPushButton("Settings", self.screen_2)
        self.button_settings.setGeometry(100, 270, 300, 55)
        self.button_settings.setFont(QtGui.QFont("SF Pro Display", 16, QtGui.QFont.Bold))
        self.button_settings.setStyleSheet("""
            QPushButton {
                color: #FFFFFF;
                background-color: #00509E;
                border-radius: 5px;
                padding: 5px 10px;
            }
            QPushButton:hover {
                background-color: #003F7F;
            }
        """)
        self.button_settings.clicked.connect(lambda: self.handle_screen_change(9))
        self.button_settings.raise_()
        self.button_settings.show()
        
        # Process Mode screen
        self.button_7.clicked.connect(self.start_process)   # Start
        self.button_8.clicked.connect(self.stop_process)    # Stop
        self.button_9.clicked.connect(self.reset_process)   # Reset
        self.button_10.clicked.connect(self.activate_tear)  # Tear (M7) - Single activation
        
        # CSV file management (assuming button_21 exists in your UI)
        if hasattr(self, 'button_21'):
            self.button_21.clicked.connect(self.load_csv_files_to_list)
        
        # ConfigList selection
        if hasattr(self, 'configlist_2'):
            self.configlist_2.itemSelectionChanged.connect(self.on_csv_file_selected)

        # DELETE SELECTED CSV
        if hasattr(self, 'button_19'):
            self.button_19.clicked.connect(self.delete_selected_csv)

        # DELETE ALL CSV
        if hasattr(self, 'button_22'):
            self.button_22.clicked.connect(self.delete_all_csv)
        
        # CSV Save button (assuming you have a button in UI for this)
        # If not, we'll add it programmatically or you can add it to your UI file
        self.button_save_csv = QPushButton("Save Data to CSV", self)
        self.button_save_csv.clicked.connect(self.save_data_to_csv)
        # Position it appropriately - adjust as needed
        self.button_save_csv.setGeometry(20, 400, 150, 40)
        self.button_save_csv.hide()  # Hide initially

    def delete_selected_csv(self):
        try:
            items = self.configlist_2.selectedItems()
            if not items:
                QMessageBox.information(self, "No file selected", "Please select a file to delete.")
                return

            item = items[0]
            file_path = item.data(Qt.UserRole)

            if os.path.exists(file_path):
                os.remove(file_path)

            self.load_csv_files_to_list()
            self.clear_graph_screen7()

            QMessageBox.information(self, "Deleted", "Selected file deleted successfully.")

        except Exception as e:
            QMessageBox.warning(self, "Error", f"Failed to delete file:\n{str(e)}")

    
    def delete_all_csv(self):
        try:
            reply = QMessageBox.question(
                self,
                "Delete ALL",
                "Are you sure you want to delete ALL log files?",
                QMessageBox.Yes | QMessageBox.No
            )

            if reply != QMessageBox.Yes:
                return

            for fname in os.listdir(self.logs_folder):
                if fname.endswith(".csv"):
                    os.remove(os.path.join(self.logs_folder, fname))

            self.load_csv_files_to_list()
            self.clear_graph_screen7()

            QMessageBox.information(self, "Deleted", "All CSV log files deleted.")

        except Exception as e:
            QMessageBox.warning(self, "Error", f"Failed to delete files:\n{str(e)}")

    def init_process_screen(self):
        """Initialize process screen components"""
        # Clear labels
        self.label_57.setText("0")
        self.label_41.setText("0.000")
        
        # Disable all buttons initially
        self.button_7.setEnabled(False)   # Start
        self.button_8.setEnabled(False)   # Stop
        self.button_9.setEnabled(False)   # Reset
        self.button_10.setEnabled(True)  # Tear
        self.button_10.setText("Tear")    # Ensure button text is correct

    def setup_graphs(self):
        """Setup real-time graphs for both screens"""
        # Setup graph for Screen 5 (Process Mode) - Real-time data only
        self.setup_graph_screen5()
        
        # Setup graph for Screen 7 (Process Logs) - CSV data only
        self.setup_graph_screen7()
        
        # Initialize data arrays for real-time graph (Screen 5)
        self.realtime_distance = []
        self.realtime_force = []
        
        # Initialize arrays for CSV data (Screen 7)
        self.csv_distance = []
        self.csv_force = []

    def setup_graph_screen5(self):
        """Setup real-time graph in feed_graph frame (Screen 5) - Real-time data only"""
        try:
            # Clear existing layout
            if self.feed_graph.layout():
                QtWidgets.QWidget().setLayout(self.feed_graph.layout())
            
            # Create new layout
            layout = QVBoxLayout(self.feed_graph)
            self.feed_graph.setLayout(layout)
            
            # Create PlotWidget
            self.plot_widget_screen5 = pg.PlotWidget()
            layout.addWidget(self.plot_widget_screen5)
            
            # Configure plot for real-time data
            self.plot_widget_screen5.setBackground('w')
            self.plot_widget_screen5.setLabel('left', 'Force (mN)')
            self.plot_widget_screen5.setLabel('bottom', 'Distance (mm)')
            self.plot_widget_screen5.showGrid(x=True, y=True)
            self.plot_widget_screen5.setTitle('Force vs Distance - Real Time')
            
            # Create a custom pen with thicker width and custom color
            # Options for color: '#FFD700' (gold), '#FFA500' (orange), '#FF6347' (tomato)
            # Options for width: 2, 3, 4, etc. (default is 1)
            custom_pen = pg.mkPen(
                color="#0037FF",  # Gold color instead of light yellow
                width=3,          # Increased stroke width (thicker line)
                style=QtCore.Qt.SolidLine
            )
            
            # Initialize plot curve for real-time data only with custom pen
            self.realtime_plot_curve = self.plot_widget_screen5.plot(
                [], [], 
                pen=custom_pen, 
                symbol='o', 
                symbolSize=5, 
                name='Real-time Data'
            )
            
            # Add legend
            self.plot_widget_screen5.addLegend()
            
        except Exception as e:
            print(f"Graph setup error for Screen 5: {e}")
            # Create a simple label if pyqtgraph fails
            error_label = QtWidgets.QLabel("Graph not available. Install pyqtgraph: pip install pyqtgraph")
            error_label.setAlignment(QtCore.Qt.AlignCenter)
            if hasattr(self, 'feed_graph'):
                layout = QVBoxLayout(self.feed_graph)
                layout.addWidget(error_label)
                
    def setup_graph_screen7(self):
        """Setup graph in feed_graph_4 frame (Screen 7) - CSV data only - FIXED"""
        try:
            print("=== Setting up Screen 7 graph ===")
            
            # Get the feed_graph_4 widget
            if not hasattr(self, 'feed_graph_4'):
                print("ERROR: feed_graph_4 not found!")
                return
            
            # Clear existing layout if any
            if self.feed_graph_4.layout():
                # Clear all widgets from layout
                layout = self.feed_graph_4.layout()
                while layout.count():
                    item = layout.takeAt(0)
                    if item.widget():
                        item.widget().deleteLater()
            
            # Create new layout
            layout = QVBoxLayout(self.feed_graph_4)
            layout.setContentsMargins(0, 0, 0, 0)  # Remove margins
            self.feed_graph_4.setLayout(layout)
            
            # Create PlotWidget
            self.plot_widget_screen7 = pg.PlotWidget()
            layout.addWidget(self.plot_widget_screen7)
            
            # Configure plot for CSV data
            self.plot_widget_screen7.setBackground('w')
            self.plot_widget_screen7.setLabel('left', 'Force (mN)')
            self.plot_widget_screen7.setLabel('bottom', 'Distance (mm)')
            self.plot_widget_screen7.showGrid(x=True, y=True)
            self.plot_widget_screen7.setTitle('Process Data - Force vs Distance')
            
            # Initialize plot curve for CSV data only (BLUE)
            # Store it as an instance variable
            self.csv_plot_curve = self.plot_widget_screen7.plot([], [], pen=pg.mkPen(color='b', width=2), 
                                                            symbol='o', symbolSize=5, symbolBrush='b', 
                                                            name='CSV Data')
            
            # Add legend
            self.plot_widget_screen7.addLegend()
            
            print(f"Screen 7 graph setup complete. csv_plot_curve created: {hasattr(self, 'csv_plot_curve')}")
            
        except Exception as e:
            print(f"Graph setup error for Screen 7: {e}")
            import traceback
            traceback.print_exc()
            # Create a simple label if pyqtgraph fails
            error_label = QtWidgets.QLabel("Graph not available")
            error_label.setAlignment(Qt.AlignCenter)
            if hasattr(self, 'feed_graph_4'):
                layout = QVBoxLayout(self.feed_graph_4)
                layout.addWidget(error_label)

    def update_graph_screen5(self):
        """Update the graph on Screen 5 (Process Mode) with real-time data only"""
        if hasattr(self, 'realtime_plot_curve'):
            # Update real-time data only
            self.realtime_plot_curve.setData(self.realtime_distance, self.realtime_force)
            
            # Auto-range for real-time data
            if self.realtime_distance and self.realtime_force:
                min_dist = min(self.realtime_distance)
                max_dist = max(self.realtime_distance)
                min_force = min(self.realtime_force)
                max_force = max(self.realtime_force)
                
                # Add some padding
                dist_range = max_dist - min_dist if max_dist != min_dist else 1
                force_range = max_force - min_force if max_force != min_force else 1
                
                self.plot_widget_screen5.setXRange(min_dist - dist_range * 0.05, max_dist + dist_range * 0.05)
                self.plot_widget_screen5.setYRange(min_force - force_range * 0.05, max_force + force_range * 0.05)

    def update_graph_screen7(self):
        """Update the graph on Screen 7 (Process Logs) with CSV data only - ENHANCED"""
        try:
            if not hasattr(self, 'csv_plot_curve'):
                print("Error: csv_plot_curve not found!")
                return
                
            if len(self.csv_distance) == 0 or len(self.csv_force) == 0:
                print("Warning: No CSV data to plot")
                self.csv_plot_curve.setData([], [])
                return
            
            print(f"Updating graph with {len(self.csv_distance)} points")
            print(f"Sample data - Distance: {self.csv_distance[:5]}")
            print(f"Sample data - Force: {self.csv_force[:5]}")
            
            # Update the plot
            self.csv_plot_curve.setData(self.csv_distance, self.csv_force)
            
            # Auto-range
            if len(self.csv_distance) > 0 and len(self.csv_force) > 0:
                try:
                    min_dist = min(self.csv_distance)
                    max_dist = max(self.csv_distance)
                    min_force = min(self.csv_force)
                    max_force = max(self.csv_force)
                    
                    print(f"Data ranges - Distance: {min_dist} to {max_dist}")
                    print(f"Data ranges - Force: {min_force} to {max_force}")
                    
                    # Add 10% padding
                    dist_range = max_dist - min_dist
                    force_range = max_force - min_force
                    
                    if dist_range == 0:
                        dist_range = 1  # Avoid division by zero
                    if force_range == 0:
                        force_range = 1  # Avoid division by zero
                    
                    x_min = min_dist - dist_range * 0.1
                    x_max = max_dist + dist_range * 0.1
                    y_min = min_force - force_range * 0.1
                    y_max = max_force + force_range * 0.1
                    
                    self.plot_widget_screen7.setXRange(x_min, x_max)
                    self.plot_widget_screen7.setYRange(y_min, y_max)
                    
                    print(f"Graph ranges - X: {x_min} to {x_max}")
                    print(f"Graph ranges - Y: {y_min} to {y_max}")
                    
                except Exception as e:
                    print(f"Error in auto-range: {e}")
                    # Use auto-range as fallback
                    self.plot_widget_screen7.autoRange()
            
            # Force repaint
            self.plot_widget_screen7.repaint()
            
        except Exception as e:
            print(f"Error in update_graph_screen7: {e}")
            import traceback
            traceback.print_exc()

    def clear_graph_screen5(self):
        """Clear the real-time graph on Screen 5"""
        try:
            if hasattr(self, 'realtime_plot_curve'):
                self.realtime_plot_curve.setData([], [])
            
            # Clear real-time data arrays
            self.realtime_distance = []
            self.realtime_force = []
            
            # Reset the plot widget to auto-range
            if hasattr(self, 'plot_widget_screen5'):
                self.plot_widget_screen5.autoRange()
                self.plot_widget_screen5.enableAutoRange(axis=pg.ViewBox.XYAxes)
            
            print("📊 Real-time graph cleared on Screen 5")
            
        except Exception as e:
            print(f"Error clearing real-time graph: {e}")

    def clear_graph_screen7(self):
        """Clear the CSV graph on Screen 7"""
        try:
            if hasattr(self, 'csv_plot_curve'):
                self.csv_plot_curve.setData([], [])
            
            # Clear CSV data arrays
            self.csv_distance = []
            self.csv_force = []
            
            # Reset the plot widget to auto-range
            if hasattr(self, 'plot_widget_screen7'):
                self.plot_widget_screen7.autoRange()
                self.plot_widget_screen7.enableAutoRange(axis=pg.ViewBox.XYAxes)
            
            print("📊 CSV graph cleared on Screen 7")
            
        except Exception as e:
            print(f"Error clearing CSV graph: {e}")

    def clear_all_graphs(self):
        """Clear all graphs on both screens"""
        self.clear_graph_screen5()
        self.clear_graph_screen7()
        print("📊 All graphs cleared on both screens")

    def start_csv_logging(self):
        """Start logging data to CSV file in /logs folder automatically."""
        try:
            # Stop any existing logging
            self.stop_csv_logging()

            # Reset force accumulator for a fresh session
            self.force_log = []

            # Auto-generate filename inside logs folder
            filename = f"process_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            file_path = os.path.join(self.logs_folder, filename)

            # Create CSV file
            self.csv_file = open(file_path, 'w', newline='', encoding='utf-8')
            self.csv_writer = csv.writer(self.csv_file)
            self.csv_file_path = file_path

            # Write header
            self.csv_writer.writerow(['Timestamp', 'Distance (mm)', 'Force (mN)', 'Force (N)'])

            self.is_logging_data = True
            print(f"📁 Saving logs to: {file_path}")
            return True

        except Exception as e:
            QMessageBox.warning(self, "Error", f"Failed to start CSV logging:\n{str(e)}")
            return False

    def stop_csv_logging(self):
        """Stop logging data to CSV file"""
        if self.is_logging_data and self.csv_file:
            try:
                # --- Compute and append average force row ---
                force_data = getattr(self, 'force_log', [])
                if force_data:
                    avg_force_mn = sum(force_data) / len(force_data)
                    avg_force_n  = avg_force_mn / 1000.0

                    # Two blank separator rows for visual spacing in Excel
                    self.csv_writer.writerow([])
                    self.csv_writer.writerow([])

                    # Average row: label in Timestamp column, values in Force columns
                    self.csv_writer.writerow([
                        'Average Force',
                        '',
                        f"{avg_force_mn:.3f}",
                        f"{avg_force_n:.6f}"
                    ])
                    self.csv_file.flush()
                    print(f"📊 Average Force written — {avg_force_mn:.3f} mN / {avg_force_n:.6f} N")
                # -------------------------------------------

                self.csv_file.close()
                self.is_logging_data = False
                self.csv_file = None
                self.csv_writer = None
                print(f"📁 Stopped logging data. File saved: {self.csv_file_path}")
                
                # Show success message
                QMessageBox.information(self, "Success", f"Data saved to:\n{self.csv_file_path}")
                
            except Exception as e:
                print(f"Error stopping CSV logging: {e}")
        
        self.csv_file_path = None

    def log_data_to_csv(self, distance, force):
        """Log a single data point to CSV"""
        if self.is_logging_data and self.csv_writer:
            try:
                timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                # Convert mN to N (assuming force is in mN, adjust if needed)
                force_n = force / 1000.0 if force != 0 else 0.0
                self.csv_writer.writerow([timestamp, distance, f"{force:.3f}", f"{force_n:.6f}"])
                self.csv_file.flush()  # Ensure data is written immediately

                # Accumulate force value (mN) for end-of-session average
                if not hasattr(self, 'force_log'):
                    self.force_log = []
                self.force_log.append(force)
            except Exception as e:
                print(f"Error writing to CSV: {e}")

    def load_csv_files_to_list(self):
        """Load all CSV files from logs folder."""
        try:
            self.configlist_2.clear()

            if not os.path.exists(self.logs_folder):
                os.makedirs(self.logs_folder)

            csv_files = [f for f in os.listdir(self.logs_folder) if f.endswith(".csv")]

            # Sort newest first
            csv_files.sort(key=lambda x: os.path.getmtime(os.path.join(self.logs_folder, x)), reverse=True)

            for file in csv_files:
                file_path = os.path.join(self.logs_folder, file)

                item = QListWidgetItem(file)
                item.setData(Qt.UserRole, file_path)

                self.configlist_2.addItem(item)

        except Exception as e:
            QMessageBox.warning(self, "Error", f"Failed to load CSV files:\n{str(e)}")

    def debug_graph_widget(self):
        """Debug method to check graph widget status"""
        try:
            if hasattr(self, 'plot_widget_screen7'):
                print("=== Graph Widget Debug ===")
                print(f"Widget exists: True")
                print(f"Widget type: {type(self.plot_widget_screen7)}")
                print(f"Widget visible: {self.plot_widget_screen7.isVisible()}")
                print(f"Widget enabled: {self.plot_widget_screen7.isEnabled()}")
                
                if hasattr(self, 'csv_plot_curve'):
                    print(f"Plot curve exists: True")
                    # Get current plot data
                    x_data = self.csv_plot_curve.xData
                    y_data = self.csv_plot_curve.yData
                    if x_data is not None:
                        print(f"Current plot data points: {len(x_data)}")
                    else:
                        print(f"Current plot data points: None")
                else:
                    print(f"Plot curve exists: False")
        except Exception as e:
            print(f"Debug error: {e}")

    def on_csv_file_selected(self):
        """Handle selection of CSV file from configList"""
        print("=== on_csv_file_selected called ===")
        
        try:
            selected_items = self.configlist_2.selectedItems()
            
            if not selected_items:
                print("No items selected")
                return
            
            selected_item = selected_items[0]
            file_path = selected_item.data(Qt.UserRole)
            
            print(f"Selected file: {file_path}")
            
            if not os.path.exists(file_path):
                QMessageBox.warning(self, "File Not Found", f"File not found:\n{file_path}")
                return
            
            # Load and plot CSV data on Screen 7 only
            self.load_and_plot_csv(file_path)
            
        except Exception as e:
            print(f"Error selecting CSV file: {e}")
            import traceback
            traceback.print_exc()
            QMessageBox.warning(self, "Error", f"Failed to load CSV file: {str(e)}")

    def load_and_plot_csv(self, file_path):
        """Load CSV file and plot data on Screen 7 graph only - SIMPLIFIED"""
        print(f"\n=== load_and_plot_csv called for: {file_path} ===")
        
        try:
            # Read CSV file
            df = pd.read_csv(file_path)
            
            print(f"CSV loaded. Shape: {df.shape}")
            print(f"Columns: {list(df.columns)}")
            
            # Get column names (exact matches as in your CSV)
            distance_col = 'Distance (mm)'
            force_col = 'Force (mN)'
            
            if distance_col not in df.columns:
                print(f"Error: Column '{distance_col}' not found in CSV")
                print(f"Available columns: {list(df.columns)}")
                QMessageBox.warning(self, "Error", f"Column '{distance_col}' not found in CSV")
                return
                
            if force_col not in df.columns:
                print(f"Error: Column '{force_col}' not found in CSV")
                print(f"Available columns: {list(df.columns)}")
                QMessageBox.warning(self, "Error", f"Column '{force_col}' not found in CSV")
                return
            
            # Extract data
            distance_data = df[distance_col].values
            force_data = df[force_col].values
            
            print(f"Distance data type: {type(distance_data)}, shape: {distance_data.shape}")
            print(f"Force data type: {type(force_data)}, shape: {force_data.shape}")
            
            print(f"First 5 distance values: {distance_data[:5].tolist()}")
            print(f"First 5 force values: {force_data[:5].tolist()}")
            
            # Store data
            self.csv_distance = distance_data.tolist()
            self.csv_force = force_data.tolist()
            
            print(f"Stored {len(self.csv_distance)} data points")
            print(f"Distance range: {min(self.csv_distance)} to {max(self.csv_distance)}")
            print(f"Force range: {min(self.csv_force)} to {max(self.csv_force)}")
            
            # Plot the data
            self.plot_csv_data()
            
            # Show success message
            file_name = os.path.basename(file_path)
            QMessageBox.information(self, "Success", 
                                f"Loaded {len(self.csv_distance)} data points from {file_name}")
            
        except Exception as e:
            print(f"Error loading CSV: {str(e)}")
            import traceback
            traceback.print_exc()
            QMessageBox.warning(self, "Error", f"Failed to load CSV: {str(e)}")
    
    def plot_csv_data(self):
        """Plot the CSV data on Screen 7 graph - FIXED"""
        print("=== plot_csv_data called ===")
        
        try:
            # Check if we have data
            if not self.csv_distance or not self.csv_force:
                print("No data to plot")
                return
            
            print(f"Plotting {len(self.csv_distance)} points")
            
            # Check if plot widget exists
            if not hasattr(self, 'plot_widget_screen7'):
                print("ERROR: plot_widget_screen7 not found!")
                return
                
            if not hasattr(self, 'csv_plot_curve'):
                print("ERROR: csv_plot_curve not found! Creating new one...")
                # Create the plot curve if it doesn't exist
                self.csv_plot_curve = self.plot_widget_screen7.plot([], [], pen=pg.mkPen(color='b', width=2), 
                                                                symbol='o', symbolSize=5, symbolBrush='b', 
                                                                name='CSV Data')
            
            print(f"Before plotting - csv_plot_curve exists: {hasattr(self, 'csv_plot_curve')}")
            
            # Clear any previous data
            self.csv_plot_curve.clear()
            
            # Plot the data
            self.csv_plot_curve.setData(self.csv_distance, self.csv_force)
            
            print(f"Data plotted successfully")
            print(f"Data sample - Distance: {self.csv_distance[:5]}")
            print(f"Data sample - Force: {self.csv_force[:5]}")
            
            # Calculate ranges for auto-scaling
            if len(self.csv_distance) > 0 and len(self.csv_force) > 0:
                x_min = min(self.csv_distance)
                x_max = max(self.csv_distance)
                y_min = min(self.csv_force)
                y_max = max(self.csv_force)
                
                print(f"X range: {x_min} to {x_max}")
                print(f"Y range: {y_min} to {y_max}")
                
                # Add 10% padding
                x_range = x_max - x_min
                y_range = y_max - y_min
                
                # Handle case where all values are the same
                if x_range == 0:
                    x_range = 1
                if y_range == 0:
                    y_range = 1
                
                # Set ranges with padding
                x_padding = x_range * 0.05
                y_padding = y_range * 0.05
                
                self.plot_widget_screen7.setXRange(x_min - x_padding, x_max + x_padding)
                self.plot_widget_screen7.setYRange(y_min - y_padding, y_max + y_padding)
            
            # Force update
            self.plot_widget_screen7.repaint()
            
            # Also update the entire widget
            self.feed_graph_4.update()
            
            print("Plot update complete")
            
        except Exception as e:
            print(f"Error plotting data: {str(e)}")
            import traceback
            traceback.print_exc()

    def debug_ui_setup(self):
        """Debug UI setup"""
        print("\n=== DEBUG UI SETUP ===")
        
        # Check if feed_graph_4 exists
        if hasattr(self, 'feed_graph_4'):
            print(f"feed_graph_4 exists: True")
            print(f"feed_graph_4 type: {type(self.feed_graph_4)}")
            print(f"feed_graph_4 visible: {self.feed_graph_4.isVisible()}")
            
            # Check layout
            layout = self.feed_graph_4.layout()
            if layout:
                print(f"feed_graph_4 has layout: True")
                print(f"Layout item count: {layout.count()}")
            else:
                print(f"feed_graph_4 has layout: False")
        else:
            print(f"feed_graph_4 exists: False")
        
        # Check plot widget
        if hasattr(self, 'plot_widget_screen7'):
            print(f"plot_widget_screen7 exists: True")
            print(f"plot_widget_screen7 type: {type(self.plot_widget_screen7)}")
            print(f"plot_widget_screen7 visible: {self.plot_widget_screen7.isVisible()}")
        else:
            print(f"plot_widget_screen7 exists: False")
        
        print("=== END DEBUG ===\n")

    def debug_csv_structure(self, file_path):
        """Debug method to inspect CSV structure"""
        try:
            with open(file_path, 'r') as f:
                content = f.read()
                print("=== CSV CONTENT (First 500 chars) ===")
                print(content[:500])  # First 500 chars
                print("=====================================")
                
                # Count lines
                lines = content.split('\n')
                print(f"Total lines: {len(lines)}")
                print(f"Header line: {lines[0] if lines else 'Empty'}")
                print(f"First data line: {lines[1] if len(lines) > 1 else 'Empty'}")
                
                # Check delimiters
                if ',' in lines[0]:
                    print("Delimiter: Comma")
                elif ';' in lines[0]:
                    print("Delimiter: Semicolon")
                elif '\t' in lines[0]:
                    print("Delimiter: Tab")
        except Exception as e:
            print(f"Debug error: {e}")

    # -------------------------------
    # Screen Management
    # -------------------------------
    def handle_screen_change(self, screen_number):
        """Switch between screens"""
        # Hide all screens except screen_1 (login) which we've removed
        screens = [self.screen_2, self.screen_5, self.screen_7, self.screen_settings]
        for screen in screens:
            if hasattr(self, screen.objectName()):
                getattr(self, screen.objectName()).hide()
        
        # Show selected screen
        if screen_number == 2:  # Main Menu
            self.screen_2.show()
            self.label_A.setText("Main Menu")
            
        elif screen_number == 5:  # Process Mode
            self.screen_5.show()
            self.label_A.setText("Process Mode")
            
            # Update button states based on Modbus connection
            if self.modbus_worker.modbus_client and self.modbus_worker.modbus_client.connected:
                # First check if process is running
                if self.process_running:
                    self.button_7.setEnabled(False)   # Disable Start button when process is running
                    self.button_8.setEnabled(True)    # Enable Stop button
                else:
                    # Update Start button based on REG_Z value
                    self.update_start_button_state()
                    
                self.button_9.setEnabled(True)   # Enable Reset button
                self.button_10.setEnabled(True)  # Enable Tear button
                self.button_10.setText("Tear")   # Ensure button text is correct
            else:
                # Disable all buttons if not connected
                self.button_7.setEnabled(False)
                self.button_8.setEnabled(False)
                self.button_9.setEnabled(False)
                self.button_10.setEnabled(True)
            
        elif screen_number == 7:  # Process Logs
            self.screen_7.show()
            self.label_A.setText("Process Logs")

            # Debug UI
            print("\n=== Entering Screen 7 ===")
            self.debug_ui_setup()
            
            # Load CSV files when entering Process Logs screen
            self.load_csv_files_to_list()
            
            # Update the graph on Screen 7 if CSV data is already loaded
            if len(self.csv_distance) > 0:
                self.plot_csv_data()
                
        elif screen_number == 9:  # Settings Screen
            self.screen_settings.show()
            self.label_A.setText("Settings")

    def update_start_button_state(self):
        """Update Start button state based on REG_Z value and current process state"""
        if not self.process_running and not self.tear_active:
            if self.z_register_value == 1:
                self.button_7.setEnabled(True)   # Enable Start button
                self.button_7.setStyleSheet("")  # Reset style
            else:
                self.button_7.setEnabled(False)  # Disable Start button
                # Optional: Change style to indicate disabled state
                # self.button_7.setStyleSheet("background-color: #cccccc; color: #666666;")
        else:
            self.button_7.setEnabled(False)  # Disable when process is running or tear is active
            # self.button_7.setStyleSheet("background-color:#28a745")
    
    @pyqtSlot(int)
    def handle_z_register_update(self, z_value):
        """Handle updates from REG_Z register"""
        self.z_register_value = z_value
        
        # Only update UI if we're on the Process Mode screen
        if self.screen_5.isVisible():
            print(f"REG_Z value updated: {z_value}")
            
            # Update Start button state based on REG_Z value
            self.update_start_button_state()
            
            # Optional: Update status label to show REG_Z value
            if hasattr(self, 'label_z_status'):
                status_text = "Ready (REG_Z=1)" if z_value == 1 else "Disabled (REG_Z=0)"
                self.label_z_status.setText(status_text)

    # -------------------------------
    # Process Control Functions
    # -------------------------------
    def start_process(self):
        """Start the process - Called when Start button is pressed"""
        if not self.modbus_worker.modbus_client or not self.modbus_worker.modbus_client.connected:
            QMessageBox.warning(self, "Error", "Not connected to PLC!")
            return
        
        # Check if REG_Z is 1 (enabled)
        if self.z_register_value != 1:
            QMessageBox.warning(self, "Error", "Cannot start process: REG_Z is not 1!")
            return
        
        # Ask user for CSV save location
        if not self.start_csv_logging():
            # User cancelled or error occurred
            return
        
        # Clear previous real-time data (Screen 5 only)
        self.data_log = []
        self.realtime_distance = []
        self.realtime_force = []
        self.update_graph_screen5()
        
        # Start the process in Modbus worker
        if self.modbus_worker.start_process():
            self.process_running = True
            self.tear_active = False  # Ensure Tear is not active
            
            # Update button states
            self.button_7.setEnabled(False)   # Disable Start button
            self.button_8.setEnabled(True)    # Enable Stop button
            self.button_9.setEnabled(True)    # Enable Reset button
            self.button_10.setEnabled(True)  # Disable Tear button
            self.button_10.setText("Tear")    # Ensure button text is correct
            
            # Update labels
            self.label_57.setText("Reading...")
            self.label_41.setText("Reading...")
            
            # Stop any active tear timer
            if self.tear_timer.isActive():
                self.tear_timer.stop()
            
            print("✅ Process started - Coil M3 turned ON")
            print("📁 CSV logging started")
        else:
            QMessageBox.warning(self, "Error", "Failed to start process!")

    def stop_process(self):
        """Stop the process - Called when Stop button is pressed"""
        if self.modbus_worker.stop_process():
            self.process_running = False
            
            # Stop CSV logging
            self.stop_csv_logging()
            
            # Update button states
            self.button_7.setEnabled(False)    # Keep Start disabled initially
            self.button_8.setEnabled(False)    # Disable Stop button
            self.button_9.setEnabled(True)     # Enable Reset button
            self.button_10.setEnabled(True)   # Disable Tear button initially
            
            # Update Start button state based on REG_Z
            self.update_start_button_state()
            self.button_10.setText("Tear")     # Ensure button text is correct
            
            print("⏹ Process stopped - Coil M6 turned ON")

            # Refresh the CSV list immediately
            self.load_csv_files_to_list()
        else:
            QMessageBox.warning(self, "Error", "Failed to stop process!")

    def reset_process(self):
        """Reset process data - Called when Reset button is pressed"""
        # First stop the process if it's running
        if self.process_running:
            self.stop_process()
        
        # Also stop CSV logging if it's still active
        if self.is_logging_data:
            self.stop_csv_logging()
        
        # Call Modbus reset
        self.modbus_worker.reset_process()
        
        # Clear all data
        self.data_log = []
        self.realtime_distance = []
        self.realtime_force = []
        
        # Note: Don't clear CSV data here - only clear real-time data
        
        # Reset labels
        self.label_57.setText("0")
        self.label_41.setText("0.000")
        
        # Clear real-time graph axis and reset view (Screen 5 only)
        self.clear_graph_screen5()
        
        # Update button states
        self.button_8.setEnabled(False)   # Disable Stop button
        self.button_9.setEnabled(True)    # Enable Reset button
        self.button_10.setEnabled(True)  # Disable Tear button initially
        
        # Update Start button state based on REG_Z
        self.update_start_button_state()
        self.button_10.setText("Tear")    # Ensure button text is correct
        
        print("🔄 Process reset - Coil M4 turned ON")
        print("📊 Real-time graph cleared on Screen 5")
        # Refresh the CSV list immediately
        self.load_csv_files_to_list()

    def activate_tear(self):
        """Activate Tear (M7) coil - Single press with auto turn-off"""
        if not self.modbus_worker.modbus_client or not self.modbus_worker.modbus_client.connected:
            QMessageBox.warning(self, "Error", "Not connected to PLC!")
            return
        
        # Check if tear is already active
        if self.tear_active:
            print("⚠ Tear is already active, ignoring duplicate activation")
            return
        
        # Stop CSV logging if active
        if self.is_logging_data:
            self.stop_csv_logging()
        
        # Turn on Tear (M7)
        if self.modbus_worker.turn_on_tear():
            self.tear_active = True
            self.process_running = False  # Tear overrides normal process
            
            # Update button states
            self.button_7.setEnabled(False)   # Disable Start button
            self.button_8.setEnabled(False)   # Disable Stop button
            self.button_9.setEnabled(False)   # Disable Reset button
            self.button_10.setEnabled(False)  # Disable Tear button while active
            
            # Update button text to indicate active state
            self.button_10.setText("Tear Active...")
            
            print("✅ Tear (M7) turned ON - Timer started")
            
            # Start timer for automatic turn-off (1000ms = 1 second)
            self.tear_timer.start(1000)
            
        else:
            QMessageBox.warning(self, "Error", "Failed to turn on Tear (M7)!")

    def auto_turn_off_tear(self):
        """Automatically turn off Tear coil after 1 second"""
        if self.tear_active:
            # Turn off Tear (M7)
            if self.modbus_worker.turn_off_tear():
                self.tear_active = False
                
                # Update button states
                self.button_8.setEnabled(False)   # Disable Stop button
                self.button_9.setEnabled(True)    # Enable Reset button
                self.button_10.setEnabled(True)  # Disable Tear button initially
                
                # Update Start button state based on REG_Z
                self.update_start_button_state()
                self.button_10.setText("Tear")    # Reset button text
                
                print("⏹ Tear (M7) automatically turned OFF after 1 second")
            else:
                print("⚠ Failed to automatically turn off Tear (M7)")
                # Still re-enable the button even if turn-off failed
                self.button_10.setEnabled(True)
                self.button_10.setText("Tear")
                self.tear_active = False
        else:
            # Tear was already turned off, just ensure button is enabled
            self.button_10.setEnabled(True)
            self.button_10.setText("Tear")

    # -------------------------------
    # Data Display Functions
    # -------------------------------
    @pyqtSlot(int, float)
    def update_data_display(self, distance, force):
        """Update UI with new data from Modbus"""
        try:
            # Always update labels when connected and not taring
            if not self.tear_active:
                self.label_57.setText(str(distance))
                self.label_41.setText(f"{force:.3f}")

            # Only log data and update graph if process is running
            if self.process_running and not self.tear_active:
                # Store data for logging
                self.data_log.append((distance, force, datetime.now()))
                
                # Log data to CSV file
                self.log_data_to_csv(distance, force)
                
                # Update real-time graph data (keep last 1000 points for performance)
                self.realtime_distance.append(distance)
                self.realtime_force.append(force)
                
                # Limit data points for performance
                if len(self.realtime_distance) > 1000:
                    self.realtime_distance = self.realtime_distance[-1000:]
                    self.realtime_force = self.realtime_force[-1000:]
                
                # Update graph on Screen 5 only
                self.update_graph_screen5()
        except Exception as e:
            print(f"Error in update_data_display: {e}")

    @pyqtSlot(bool, str)
    def handle_connection_status(self, connected, message):
        """Handle Modbus connection status updates"""
        if connected:
            print(f"✅ {message}")
            
            # Update connection status button and label
            self.connect_disconnect_button.setText("Disconnect")
            self.connect_disconnect_button.setStyleSheet("""
                QPushButton {
                    font-size: 14px;
                    font-weight: bold;
                    background-color: #f44336;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    padding: 5px;
                }
                QPushButton:hover {
                    background-color: #d32f2f;
                }
            """)
            
            # Update status to just "Connected"
            self.connection_status_label.setText("Status: Connected")
            self.connection_status_label.setStyleSheet("font-size: 14px; color: #4CAF50;")
            
            # Enable process controls if we're on process screen
            if self.screen_5.isVisible():
                self.button_8.setEnabled(False)  # Disable Stop button
                self.button_9.setEnabled(True)   # Enable Reset button
                self.button_10.setEnabled(True)  # Enable Tear button
                self.button_10.setText("Tear")   # Ensure button text is correct
                
                # Update Start button state based on REG_Z value
                self.update_start_button_state()
        else:
            print(f"❌ {message}")
            
            # Update button back to Connect
            self.connect_disconnect_button.setText("Connect")
            self.connect_disconnect_button.setStyleSheet("""
                QPushButton {
                    font-size: 14px;
                    font-weight: bold;
                    background-color: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    padding: 5px;
                }
                QPushButton:hover {
                    background-color: #45a049;
                }
            """)
            
            self.connection_status_label.setText(f"Status: {message}")
            self.connection_status_label.setStyleSheet("font-size: 14px; color: #ff0000;")
            
    @pyqtSlot(str)
    def handle_error(self, error_message):
        """Handle error messages from Modbus worker"""
        print(f"⚠ {error_message}")
        
        # Update button back to Connect if there's an error
        self.connect_disconnect_button.setText("Connect")
        self.connect_disconnect_button.setStyleSheet("""
            QPushButton {
                font-size: 14px;
                font-weight: bold;
                background-color: #4CAF50;
                color: white;
                border: none;
                border-radius: 5px;
                padding: 5px;
            }
            QPushButton:hover {
                background-color: #45a049;
            }
        """)
        
        # Update connection status label
        self.connection_status_label.setText(f"Status: Error - {error_message[:50]}...")
        self.connection_status_label.setStyleSheet("font-size: 14px; color: #ff0000;")

    def save_data_to_csv(self):
        """Manual save function for existing data"""
        if not self.data_log:
            QMessageBox.information(self, "No Data", "No data to save!")
            return
        
        try:
            default_filename = f"process_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            file_path, _ = QFileDialog.getSaveFileName(
                self, 
                "Save Process Data", 
                default_filename, 
                "CSV Files (*.csv);;All Files (*)"
            )
            
            if file_path:
                with open(file_path, 'w', newline='', encoding='utf-8') as csvfile:
                    writer = csv.writer(csvfile)
                    writer.writerow(['Timestamp', 'Distance (mm)', 'Force (mN)', 'Force (N)'])
                    
                    for distance, force, timestamp in self.data_log:
                        timestamp_str = timestamp.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                        force_n = force / 1000.0 if force != 0 else 0.0
                        writer.writerow([timestamp_str, distance, f"{force:.3f}", f"{force_n:.6f}"])
                
                QMessageBox.information(self, "Success", f"Data saved to:\n{file_path}")
                print(f"📁 Data manually saved to {file_path}")
                
        except Exception as e:
            print(f"Error saving data: {e}")
            QMessageBox.warning(self, "Error", f"Failed to save data: {str(e)}")

    # -------------------------------
    # Navigation
    # -------------------------------
    def handle_back_pressed(self):
        """Handle back button press"""
        current_screen = 2
        
        # Determine current screen (excluding screen_1 which is removed)
        if self.screen_2.isVisible():
            current_screen = 2
        elif self.screen_5.isVisible():
            current_screen = 5
        elif self.screen_7.isVisible():
            current_screen = 7
        elif self.screen_settings.isVisible():
            current_screen = 9
        
        # Navigate back with proper process handling
        if current_screen == 5:
            # Stop process if running when leaving process screen
            if self.process_running:
                self.stop_process()
            
            # Turn off Tear if active and stop timer
            if self.tear_active:
                self.modbus_worker.turn_off_tear()
                self.tear_active = False
                self.button_10.setText("Tear")  # Reset button text
            
            # Stop tear timer if active
            if self.tear_timer.isActive():
                self.tear_timer.stop()
            
            # Stop CSV logging if active
            if self.is_logging_data:
                self.stop_csv_logging()
            
            self.handle_screen_change(2)
        elif current_screen == 7 or current_screen == 9:
            self.handle_screen_change(2)
        else:
            # If on main menu (screen 2), show a message or close the application
            reply = QMessageBox.question(
                self, 
                'Exit Application', 
                'Do you want to close the application?',
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.No
            )
            
            if reply == QMessageBox.Yes:
                self.close()

    # -------------------------------
    # Cleanup
    # -------------------------------
    def closeEvent(self, event):
        """Clean up resources when closing window"""
        # Stop process if running
        if self.process_running:
            self.stop_process()
        
        # Turn off Tear if active
        if self.tear_active:
            self.modbus_worker.turn_off_tear()
        
        # Stop tear timer if active
        if self.tear_timer.isActive():
            self.tear_timer.stop()
        
        # Stop CSV logging if active
        if self.is_logging_data:
            self.stop_csv_logging()
        
        # Stop and cleanup Modbus worker
        if self.modbus_worker.isRunning():
            self.modbus_worker.stop()
            self.modbus_worker.wait()
        
        # Save data log to CSV if there's data (manual backup)
        if self.data_log and not self.csv_file_path:
            reply = QMessageBox.question(
                self, 
                'Save Data', 
                'Do you want to save the collected data before closing?',
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.Yes
            )
            
            if reply == QMessageBox.Yes:
                self.save_data_to_csv()
        
        event.accept()

# -------------------------------
# Run Application
# -------------------------------
if __name__ == "__main__":
    app = QApplication(sys.argv)
    
    # Set application style
    app.setStyle("Fusion")
    
    # Create and show main window
    window = MainWindow()
    window.show()
    
    # Execute application
    sys.exit(app.exec_())