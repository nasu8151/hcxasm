import serial
import sys
import argparse
import time
import json

def arg_parse():
    parser = argparse.ArgumentParser(description="Load binary data to HC4e via serial port.")
    parser.add_argument("command", help="Command to execute ('load', 'register' | 'reg', 'trace').")
    parser.add_argument("--file", help="Path to the intelhex file to load.")
    parser.add_argument("--port", required=True, help="Serial port to use (e.g., COM3 or /dev/ttyUSB0).")
    parser.add_argument("--baudrate", type=int, default=115200, help="Baud rate for serial communication.")
    return parser.parse_args()

def main():
    args = arg_parse()
    if args.command == "load":
        load(args)
    elif args.command == "register" or args.command == "reg":
        register(args)
    elif args.command == "trace":
        trace(args)
    else:
        print(f"Unknown command: {args.command}")
        sys.exit(1)

def load(args):
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

def register(args):
    try:
        with serial.Serial(args.port, args.baudrate, timeout=1) as ser:
            print(f"Reading registers from HC4e via {args.port} at {args.baudrate} baud...")
            ser.write(b'rc\n')  # Command to read registers
            ser.readline()  # Discard the first line (header)
            res = ser.readline()
            regs = list(map(int, res.decode().strip().split(',')))
            print(json.dumps({"regs": regs[0:15], "pc": regs[16], "inst": regs[17]}, indent=2))
    except serial.SerialException as e:
        print(f"Serial communication error: {e}")
        sys.exit(1)

def trace(args):
    try:
        with serial.Serial(args.port, args.baudrate, timeout=1) as ser:
            print(f"Tracing execution on HC4e via {args.port} at {args.baudrate} baud...")
            ser.write(b't\n')  # Command to trace execution
            try:
                while True:
                    line = ser.readline()
                    if not line:
                        continue
                    print(line.decode().strip())
                    time.sleep(0.1)
            except KeyboardInterrupt:
                print("Trace interrupted by user.")
            ser.write(b'\x03')  # Send Ctrl-C to stop tracing
            time.sleep(0.5)
    except serial.SerialException as e:
        print(f"Serial communication error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()