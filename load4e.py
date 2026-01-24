import serial
import sys
import argparse
import time
import json
import threading
import queue

def arg_parse():
    parser = argparse.ArgumentParser(description="Load binary data to HC4e via serial port.")
    parser.add_argument("command", help="Command to execute ('load', 'register' | 'reg', 'trace').")
    parser.add_argument("--file", help="Path to the intelhex file to load.")
    parser.add_argument("--port", required=True, help="Serial port to use (e.g., COM3 or /dev/ttyUSB0).")
    parser.add_argument("--baudrate", type=int, default=115200, help="Baud rate for serial communication.")
    parser.add_argument("-j", "--json", action="store_true", help="Output in JSON format where applicable.")
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
            ser.write(b'rc\n')  # Command to read registers
            ser.readline()  # Discard the first line (header)
            res = ser.readline()
            regs = list(map(int, res.decode().strip().split(',')))
            if args.json:
                print(json.dumps({"regs": regs[0:16], "pc": regs[16], "inst": regs[17]}))
            else:
                print("Registers:")
                for i in range(16):
                    print(f"R{i}: {regs[i]}", end='  ')
                print()
                print(f"PC: {regs[16]}, INST: {regs[17]}")
    except serial.SerialException as e:
        print(f"Serial communication error: {e}")
        sys.exit(1)

def trace(args):
    try:
        with serial.Serial(args.port, args.baudrate, timeout=1) as ser:
            if not args.json:
                print(f"Tracing execution on HC4e via {args.port} at {args.baudrate} baud...")
            ser.write(b't\n')  # Command to trace execution
            ser.readline()  # Discard the first line (header)
            ser.readline()  # Discard the second line (header)
            # 士郎、僕はね、ノンブロッキングな標準入力が欲しかったんだよ
            q = queue.Queue()
            worker = threading.Thread(target=tracewk, args=(args.json, ser, q))
            worker.start()
            try:
                while worker.is_alive():
                    com = input()
                    if com:
                        q.put(com)
                    if com.strip().lower() == 'q':
                        break
            except KeyboardInterrupt:
                print("Trace interrupted by user.")
                q.put('q')
            worker.join()
    except serial.SerialException as e:
        print(f"Serial communication error: {e}")
        sys.exit(1)

def tracewk(jso:bool, ser:serial.Serial, q:queue.Queue):
    try:
        while True:
            res = ser.readline()
            if not q.empty():
                com = q.get()
                ser.write(com.encode() + b'\n')
                if com.strip().lower() == 'q':
                    break
            
            if not res:
                continue
            regs = list(map(int, res.decode().strip().split(',')))
            if jso:
                print(json.dumps({"regs": regs[0:16], "pc": regs[16], "inst": regs[17]}))
            else:
                for i in range(16):
                    print(f"R{i}: {regs[i]}", end='  ')
                print()
                print(f"PC: {regs[16]}, INST: {regs[17]}")
        ser.write(b'\x03\n')  # Send Ctrl-C to stop tracing
    except serial.SerialException as e:
        print(f"Serial communication error during tracing: {e}")


if __name__ == "__main__":
    main()