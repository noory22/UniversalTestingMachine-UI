use serialport::SerialPort;
use std::io::{Read, Write};
use std::time::Duration;

pub fn calc_crc(data: &[u8]) -> u16 {
    let mut crc = 0xFFFFu16;
    for &byte in data {
        crc ^= byte as u16;
        for _ in 0..8 {
            if (crc & 1) != 0 {
                crc = (crc >> 1) ^ 0xA001;
            } else {
                crc >>= 1;
            }
        }
    }
    crc
}

pub struct ModbusClient {
    port: Box<dyn SerialPort>,
    slave_id: u8,
}

impl ModbusClient {
    pub fn new(port: Box<dyn SerialPort>, slave_id: u8) -> Self {
        Self { port, slave_id }
    }

    fn read_exact_with_timeout(&mut self, buf: &mut [u8], timeout: Duration) -> Result<(), String> {
        let mut total_read = 0;
        let start = std::time::Instant::now();

        while total_read < buf.len() {
            if start.elapsed() > timeout {
                return Err("Timeout reading from serial port".to_string());
            }

            match self.port.read(&mut buf[total_read..]) {
                Ok(0) => {
                    std::thread::sleep(Duration::from_millis(1));
                }
                Ok(n) => {
                    total_read += n;
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    std::thread::sleep(Duration::from_millis(1));
                }
                Err(e) => return Err(format!("Serial read error: {}", e)),
            }
        }
        Ok(())
    }

    /// Flushes any pending unread bytes instantly via OS driver PurgeComm (0ms)
    fn clear_buffers(&mut self) {
        let _ = self.port.clear(serialport::ClearBuffer::Input);
    }

    pub fn read_holding_registers(&mut self, start_addr: u16, count: u16) -> Result<Vec<u16>, String> {
        self.clear_buffers();

        let mut frame = vec![
            self.slave_id,
            0x03,
            (start_addr >> 8) as u8,
            (start_addr & 0xFF) as u8,
            (count >> 8) as u8,
            (count & 0xFF) as u8,
        ];
        let crc = calc_crc(&frame);
        frame.push((crc & 0xFF) as u8);
        frame.push((crc >> 8) as u8);

        self.port
            .write_all(&frame)
            .map_err(|e| format!("Failed to write Modbus request: {}", e))?;
        self.port.flush().map_err(|e| e.to_string())?;

        let expected_len = 3 + (count as usize * 2) + 2;
        let mut header = [0u8; 3];
        self.read_exact_with_timeout(&mut header, Duration::from_millis(120))?;

        if header[0] != self.slave_id {
            return Err(format!("Mismatched slave ID in response: got {}, expected {}", header[0], self.slave_id));
        }

        if header[1] == (0x03 | 0x80) {
            let mut err_tail = [0u8; 2]; // exception code + crc
            let _ = self.port.read_exact(&mut err_tail);
            return Err(format!("Modbus Exception code: {}", header[2]));
        }

        if header[1] != 0x03 {
            return Err(format!("Unexpected function code: {}", header[1]));
        }

        let byte_count = header[2] as usize;
        if byte_count != count as usize * 2 {
            return Err(format!("Unexpected byte count: {}", byte_count));
        }

        let mut data_and_crc = vec![0u8; byte_count + 2];
        self.read_exact_with_timeout(&mut data_and_crc, Duration::from_millis(120))?;

        let mut full_resp = Vec::with_capacity(expected_len);
        full_resp.extend_from_slice(&header);
        full_resp.extend_from_slice(&data_and_crc);

        let body_len = full_resp.len() - 2;
        let received_crc = (full_resp[body_len] as u16) | ((full_resp[body_len + 1] as u16) << 8);
        let calculated_crc = calc_crc(&full_resp[..body_len]);

        if received_crc != calculated_crc {
            return Err("CRC check failed".to_string());
        }

        let mut registers = Vec::with_capacity(count as usize);
        for i in 0..count as usize {
            let high = data_and_crc[i * 2] as u16;
            let low = data_and_crc[i * 2 + 1] as u16;
            registers.push((high << 8) | low);
        }

        Ok(registers)
    }

    pub fn read_discrete_inputs(&mut self, start_addr: u16, count: u16) -> Result<Vec<bool>, String> {
        self.clear_buffers();

        let mut frame = vec![
            self.slave_id,
            0x02,
            (start_addr >> 8) as u8,
            (start_addr & 0xFF) as u8,
            (count >> 8) as u8,
            (count & 0xFF) as u8,
        ];
        let crc = calc_crc(&frame);
        frame.push((crc & 0xFF) as u8);
        frame.push((crc >> 8) as u8);

        self.port
            .write_all(&frame)
            .map_err(|e| format!("Failed to write Modbus request: {}", e))?;
        self.port.flush().map_err(|e| e.to_string())?;

        let expected_bytes = ((count + 7) / 8) as usize;
        let mut header = [0u8; 3];
        self.read_exact_with_timeout(&mut header, Duration::from_millis(120))?;

        if header[0] != self.slave_id {
            return Err("Mismatched slave ID in response".to_string());
        }
        if header[1] == (0x02 | 0x80) {
            return Err(format!("Modbus Exception code: {}", header[2]));
        }
        if header[1] != 0x02 {
            return Err(format!("Unexpected function code: {}", header[1]));
        }

        let byte_count = header[2] as usize;
        let mut data_and_crc = vec![0u8; byte_count + 2];
        self.read_exact_with_timeout(&mut data_and_crc, Duration::from_millis(120))?;

        let mut full_resp = Vec::with_capacity(3 + byte_count + 2);
        full_resp.extend_from_slice(&header);
        full_resp.extend_from_slice(&data_and_crc);

        let body_len = full_resp.len() - 2;
        let received_crc = (full_resp[body_len] as u16) | ((full_resp[body_len + 1] as u16) << 8);
        let calculated_crc = calc_crc(&full_resp[..body_len]);

        if received_crc != calculated_crc {
            return Err("CRC check failed".to_string());
        }

        let mut results = Vec::with_capacity(count as usize);
        for i in 0..count as usize {
            let byte_idx = i / 8;
            let bit_idx = i % 8;
            if byte_idx < byte_count {
                let bit = (data_and_crc[byte_idx] >> bit_idx) & 1;
                results.push(bit == 1);
            } else {
                results.push(false);
            }
        }

        Ok(results)
    }

    pub fn read_coils(&mut self, start_addr: u16, count: u16) -> Result<Vec<bool>, String> {
        self.clear_buffers();

        let mut frame = vec![
            self.slave_id,
            0x01,
            (start_addr >> 8) as u8,
            (start_addr & 0xFF) as u8,
            (count >> 8) as u8,
            (count & 0xFF) as u8,
        ];
        let crc = calc_crc(&frame);
        frame.push((crc & 0xFF) as u8);
        frame.push((crc >> 8) as u8);

        self.port
            .write_all(&frame)
            .map_err(|e| format!("Failed to write Modbus request: {}", e))?;
        self.port.flush().map_err(|e| e.to_string())?;

        let mut header = [0u8; 3];
        self.read_exact_with_timeout(&mut header, Duration::from_millis(120))?;

        if header[0] != self.slave_id {
            return Err("Mismatched slave ID in response".to_string());
        }
        if header[1] == (0x01 | 0x80) {
            return Err(format!("Modbus Exception code: {}", header[2]));
        }
        if header[1] != 0x01 {
            return Err(format!("Unexpected function code: {}", header[1]));
        }

        let byte_count = header[2] as usize;
        let mut data_and_crc = vec![0u8; byte_count + 2];
        self.read_exact_with_timeout(&mut data_and_crc, Duration::from_millis(120))?;

        let mut full_resp = Vec::with_capacity(3 + byte_count + 2);
        full_resp.extend_from_slice(&header);
        full_resp.extend_from_slice(&data_and_crc);

        let body_len = full_resp.len() - 2;
        let received_crc = (full_resp[body_len] as u16) | ((full_resp[body_len + 1] as u16) << 8);
        let calculated_crc = calc_crc(&full_resp[..body_len]);

        if received_crc != calculated_crc {
            return Err("CRC check failed".to_string());
        }

        let mut results = Vec::with_capacity(count as usize);
        for i in 0..count as usize {
            let byte_idx = i / 8;
            let bit_idx = i % 8;
            if byte_idx < byte_count {
                let bit = (data_and_crc[byte_idx] >> bit_idx) & 1;
                results.push(bit == 1);
            } else {
                results.push(false);
            }
        }

        Ok(results)
    }

    pub fn write_single_coil(&mut self, coil_addr: u16, value: bool) -> Result<(), String> {
        self.clear_buffers();

        let val = if value { 0xFF00u16 } else { 0x0000u16 };
        let mut frame = vec![
            self.slave_id,
            0x05,
            (coil_addr >> 8) as u8,
            (coil_addr & 0xFF) as u8,
            (val >> 8) as u8,
            (val & 0xFF) as u8,
        ];
        let crc = calc_crc(&frame);
        frame.push((crc & 0xFF) as u8);
        frame.push((crc >> 8) as u8);

        self.port
            .write_all(&frame)
            .map_err(|e| format!("Failed to write Modbus request: {}", e))?;
        self.port.flush().map_err(|e| e.to_string())?;

        let mut response = [0u8; 8];
        self.read_exact_with_timeout(&mut response, Duration::from_millis(120))?;

        let received_crc = (response[6] as u16) | ((response[7] as u16) << 8);
        let calculated_crc = calc_crc(&response[..6]);

        if received_crc != calculated_crc {
            return Err("CRC check failed on coil write response".to_string());
        }

        if response[1] == (0x05 | 0x80) {
            return Err(format!("Modbus Exception code: {}", response[2]));
        }

        Ok(())
    }

    pub fn write_single_register(&mut self, reg_addr: u16, value: u16) -> Result<(), String> {
        self.clear_buffers();

        let mut frame = vec![
            self.slave_id,
            0x06,
            (reg_addr >> 8) as u8,
            (reg_addr & 0xFF) as u8,
            (value >> 8) as u8,
            (value & 0xFF) as u8,
        ];
        let crc = calc_crc(&frame);
        frame.push((crc & 0xFF) as u8);
        frame.push((crc >> 8) as u8);

        self.port
            .write_all(&frame)
            .map_err(|e| format!("Failed to write Modbus request: {}", e))?;
        self.port.flush().map_err(|e| e.to_string())?;

        let mut response = [0u8; 8];
        self.read_exact_with_timeout(&mut response, Duration::from_millis(120))?;

        let received_crc = (response[6] as u16) | ((response[7] as u16) << 8);
        let calculated_crc = calc_crc(&response[..6]);

        if received_crc != calculated_crc {
            return Err("CRC check failed on register write response".to_string());
        }

        if response[1] == (0x06 | 0x80) {
            return Err(format!("Modbus Exception code: {}", response[2]));
        }

        Ok(())
    }

    pub fn write_multiple_registers(&mut self, start_addr: u16, values: &[u16]) -> Result<(), String> {
        self.clear_buffers();

        let count = values.len() as u16;
        let byte_count = (count * 2) as u8;
        let mut frame = vec![
            self.slave_id,
            0x10,
            (start_addr >> 8) as u8,
            (start_addr & 0xFF) as u8,
            (count >> 8) as u8,
            (count & 0xFF) as u8,
            byte_count,
        ];

        for &val in values {
            frame.push((val >> 8) as u8);
            frame.push((val & 0xFF) as u8);
        }

        let crc = calc_crc(&frame);
        frame.push((crc & 0xFF) as u8);
        frame.push((crc >> 8) as u8);

        self.port
            .write_all(&frame)
            .map_err(|e| format!("Failed to write Modbus request: {}", e))?;
        self.port.flush().map_err(|e| e.to_string())?;

        let mut response = [0u8; 8];
        self.read_exact_with_timeout(&mut response, Duration::from_millis(120))?;

        let received_crc = (response[6] as u16) | ((response[7] as u16) << 8);
        let calculated_crc = calc_crc(&response[..6]);

        if received_crc != calculated_crc {
            return Err("CRC check failed on multiple registers write response".to_string());
        }

        if response[1] == (0x10 | 0x80) {
            return Err(format!("Modbus Exception code: {}", response[2]));
        }

        Ok(())
    }
}
