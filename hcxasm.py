#!/usr/bin/env python3
"""
HCX アセンブラ - .asmファイルをアセンブルして機械語コードを出力

使用方法:
    python hcxasm.py input.asm [-o output.bin] [-a architecture] [-f format]

引数:
    input.asm           : 入力アセンブリファイル
    -o, --output        : 出力ファイル名 (デフォルト: input.bin)
    -a, --architecture  : アーキテクチャ (HC4 または HC4E, デフォルト: HC4)
    -f, --format        : 出力形式 (binary, hex, text, デフォルト: binary)
    -v, --verbose       : 詳細出力
    -h, --help          : ヘルプ表示
"""

import argparse
import sys
import os
from typing import Optional, Sequence
from pathlib import Path

sys.path.append(os.path.join(os.path.dirname(__file__), './py'))

import py.assembler as assembler


def parse_arguments():
    """コマンドライン引数の解析"""
    parser = argparse.ArgumentParser(
        description='HCx(HC4/4e/8) series Assembler',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
出力形式:
    binary  : バイナリファイル (.bin)
    hex     : Intel HEXファイル (.hex)  
    text    : テキストファイル (.txt) - 16進数表記

例:
    python hcxasm.py program.asm
    python hcxasm.py program.asm -o output.bin
    python hcxasm.py program.asm -a HC4E -f hex
    python hcxasm.py program.asm -o program.hex -f hex -v
        """
    )
    
    parser.add_argument('input_file', 
                        help='Input assembly file (.asm)')
    
    parser.add_argument('-o', '--output',
                        help='Output file name (default: input file name with .bin extension)')
    
    parser.add_argument('-a', '--architecture',
                        choices=['HC4', 'HC4E'],
                        default='HC4',
                        help='Target architecture (default: HC4)')
    
    parser.add_argument('-f', '--format',
                        choices=['binary', 'hex', 'ihex', 'vhex', 'text', 'list'],
                        default='binary',
                        help='Output format (default: binary)')
    
    parser.add_argument('-v', '--verbose',
                        action='store_true',
                        help='Enable verbose output messages')
    
    parser.add_argument('-q', '--quiet',
                        action='store_true',
                        help='Suppress output messages')
    
    return parser.parse_args()


def read_asm_file(filename:str):
    """アセンブリファイルを読み込む"""
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            lines = f.read()
        return lines.splitlines()
    except FileNotFoundError:
        print(f"[Error]: File '{filename}' not found.", file=sys.stderr)
        sys.exit(1)
    except UnicodeDecodeError:
        print(f"[Error]: Invalid character encoding in file '{filename}'.", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"[Error]: An error occurred while reading the file '{filename}': {e}", file=sys.stderr)
        sys.exit(1)

def write_binary_output(filename:str, machine_code:list[tuple[int, int]]):
    """バイナリ形式で出力"""
    try:
        with open(filename, 'wb') as f:
            f.write(bytes([byte for byte, _ in machine_code]))
        return True
    except Exception as e:
        print(f"[Error]: An error occurred while writing the binary file '{filename}': {e}", file=sys.stderr)
        return False
    
def write_verilog_hex_output(filename:str, machine_code:list[tuple[int, int]]):
    """verilogのHEX形式で出力"""
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            for i, _ in machine_code:
                f.write(f"{i:02X}\n")
        return True
    except Exception as e:
        print(f"[Error]: An error occurred while writing the HEX file '{filename}': {e}", file=sys.stderr)
        return False


def write_intel_hex_output(filename:str, machine_code:list[tuple[int, int]]):
    """Intel HEX形式で出力"""
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            # Intel HEX形式のヘッダー
            address = 0
            for i in range(0, len(machine_code), 16):
                chunk = machine_code[i:i+16]
                data_len = len(chunk)
                
                # チェックサムの計算
                checksum = data_len + (address >> 8) + (address & 0xFF)
                for byte_val, _ in chunk:
                    checksum += byte_val
                checksum = (~checksum + 1) & 0xFF
                
                # Intel HEX行の生成
                hex_line = f":{data_len:02X}{address:04X}00"
                for byte_val, _ in chunk:
                    hex_line += f"{byte_val:02X}"
                hex_line += f"{checksum:02X}"
                
                f.write(hex_line + '\n')
                address += data_len
            
            # EOF レコード
            f.write(":00000001FF\n")
        return True
    except Exception as e:
        print(f"[Error]: An error occurred while writing the HEX file '{filename}': {e}", file=sys.stderr)
        return False


def write_list_output(filename:str, lines:Sequence[tuple[str, int, str]], machine_code: Sequence[tuple[int, int]], ls:assembler.LinkState):
    """
    Write output in text format with machine code and source code correspondence.
    Args:
        filename (str): Output text file name.
        lines (Sequence[tuple[str, int, str]]): List of tuple(line:str, lineno:int, unprocessed_line:str).
        machine_code (Sequence[tuple[int, int]]): List of assembled lines with machine code and line numbers.
    Returns:
        bool: True if writing is successful, False otherwise.
    """
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            f.write("HCX Assemble Results\n")
            f.write("=" * 50 + "\n\n")
            
            f.write("Labels and Symbols:\n")
            for label, address in ls.labels.items():
                f.write(f"{label}: {address:04X}\n")
            
            # Machine code and source code correspondence table
            f.write("line  address  machine code  source code\n")
            f.write("-" * 50 + "\n")
            
            address = 0
            for result in lines:
                source_line, line_num, unprocessed_line = result
                if address < len(machine_code) and machine_code[address][1] == line_num:
                    byte_val, _ = machine_code[address]
                    f.write(f"{line_num:4d}  {address:04X}     {byte_val:02X}            {unprocessed_line}\n")
                    address += 1
                else:
                    f.write(f"{line_num:4d}  {address:04X}                   {unprocessed_line}\n")

            
            f.write("\n" + "-" * 50 + "\n")
            f.write(f"Generated machine code: {len(machine_code)} bytes\n\n")
            
            # Hex dump
            f.write("Hex dump:\n")
            for i in range(0, len(machine_code), 16):
                chunk = machine_code[i:i+16]
                hex_str = " ".join(f"{byte_val:02X}" for byte_val, _ in chunk)
                f.write(f"{i:04X}: {hex_str:<47}\n")
                
        return True
    except Exception as e:
        print(f"[Error]: An error occurred while writing the list file '{filename}': {e}", file=sys.stderr)
        return False


def determine_output_filename(input_file:str, output_file:str, format_type:str):
    """出力ファイル名を決定"""
    if output_file:
        return output_file
    
    # 入力ファイル名から拡張子を除去
    input_path = Path(input_file)
    base_name = input_path.stem
    
    # 形式に応じた拡張子を決定
    extensions = {
        'binary': '.bin',
        'hex': '.hex',
        'ihex': '.hex',
        'vhex': '.hex',
        'text': '.lst'
    }
    
    return base_name + extensions[format_type]


def main(args):
    """Main function"""
    
    # Check if input file exists
    if not os.path.exists(args.input_file):
        print(f"[Error] Input file '{args.input_file}' does not exist.", file=sys.stderr)
        sys.exit(1)
    
    # Determine output file name
    output_filename = determine_output_filename(args.input_file, args.output, args.format)
    
    if args.verbose:
        print(f"HCX Assembler")
        print(f"Input file: {args.input_file}")
        print(f"Output file: {output_filename}")
        print(f"Output format: {args.format}")
        print()
    
    # Read assembly file
    lines = read_asm_file(args.input_file)
    # Write output file
    processed_lines = assembler.preprocess(lines)
    ls = assembler.LinkState()
    
    machine_code = assembler.assemble(tuple((pl[0], pl[1]) for pl in processed_lines), ls, args.architecture)

    success = False
    if args.format == 'binary':
        success = write_binary_output(output_filename, machine_code)
    elif args.format == 'ihex':
        success = write_intel_hex_output(output_filename, machine_code)
    elif args.format == 'hex' or args.format == 'vhex':
        success = write_verilog_hex_output(output_filename, machine_code)
    elif args.format == 'list' or args.format == 'text':
        success = write_list_output(output_filename, processed_lines, machine_code, ls)
    
    if not success:
        sys.exit(1)

    print(f"[Info] Assembled {machine_code[-1][1]} lines into {len(machine_code)} bytes.")
    if args.verbose:
        print(f"[Info] Architecture: {args.architecture}")
        print(f"[Info] Output format: {args.format}")
        print(f"[Info] Defined labels: ")
        for label, address in ls.labels.items():
            print(f"       {label}: {address:04X}")
    print(f"[OK] Done. Output written to '{output_filename}'.")

if __name__ == "__main__":
    args = parse_arguments()
    main(args)