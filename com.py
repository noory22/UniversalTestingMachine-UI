from pymodbus.client import ModbusSerialClient
import serial.tools.list_ports

# Auto-detect USB-RS232 converter
def auto_detect_serial_port():
    ports = serial.tools.list_ports.comports()
    for port in ports:
        desc = port.description.lower()
        if ("ch340" in desc or "usb" in desc or "serial" in desc or "ftdi" in desc or "prolific" in desc):
            try:
                ser = serial.Serial(port.device, 9600, timeout=1)
                ser.close()
                return port.device
            except:
                pass
    return None

# MODBUS TEST
def test_plc_modbus():
    com_port = auto_detect_serial_port()
                        
    if com_port is None:
        print("❌ No usable COM port detected.")
        return

    print(f"🔌 Using detected COM port: {com_port}")

    client = ModbusSerialClient(
        port=com_port,
        baudrate=9600,
        parity='E',
        stopbits=1,
        bytesize=8,
        timeout=1
    )

    print("🔍 Testing communication with PLC...")

    if not client.connect():
        print("❌ Cannot connect to PLC. Check wiring/baudrate.")
        return

    try:
        # Try reading R0 → Modbus holding register address 0 (pymodbus 3.x uses device_id)
        response = client.read_holding_registers(address=0, count=1, device_id=1)

        if response.isError():
            print("⚠ PLC responded with error:", response)
        else:
            print("🎉 PLC RESPONSE RECEIVED!")
            print("📘 Register Value (R0):", response.registers[0])

    except Exception as e:
        print("❌ Communication failed:", e)

    finally:
        client.close()


if __name__ == "__main__":
    test_plc_modbus()
