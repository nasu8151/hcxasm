import serial
import sys
import argparse
import time

def arg_parse():
    parser = argparse.ArgumentParser(description="Load binary data to HC4e via serial port.")
    parser.add_argument("file", help="Path to the binary file to load.")
    parser.add_argument("--port", required=True, help="Serial port to use (e.g., COM3 or /dev/ttyUSB0).")
    parser.add_argument("--baudrate", type=int, default=115200, help="Baud rate for serial communication.")
    return parser.parse_args()

def main():
    args = arg_parse()
    
    try:
        with open(args.file, "rb") as f:
            hex_data = f.read()
    except FileNotFoundError:
        print(f"Error: File '{args.file}' not found.")
        sys.exit(1)
    
    try:
        with serial.Serial(args.port, args.baudrate, timeout=1) as ser:
            print(f"Loading data to HC4e via {args.port} at {args.baudrate} baud...")
            ser.write(b'l\n')  # Command to initiate loading
            time.sleep(0.5)  # Wait for device to be ready
            ser.write(hex_data)
            result = b""
            while ser.in_waiting:
                result += ser.read(ser.in_waiting)
                time.sleep(0.1)
            if b'[OK]' in result:
                print("Data loaded successfully.")
            else:
                print("Error: Failed to load data.")
                print(f"Device response: {result.decode(errors='ignore')}")
                sys.exit(1)
    except serial.SerialException as e:
        print(f"Serial communication error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()