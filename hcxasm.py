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
from pathlib import Path
import py.assembler as assembler
import py.dictionaly as dictionaly


def parse_arguments():
    """コマンドライン引数の解析"""
    parser = argparse.ArgumentParser(
        description='HCx(HC4/8) series Assembler',
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
                        help='入力アセンブリファイル (.asm)')
    
    parser.add_argument('-o', '--output',
                        help='出力ファイル名 (デフォルト: 入力ファイル名.bin)')
    
    parser.add_argument('-a', '--architecture',
                        choices=['HC4', 'HC4E'],
                        default='HC4',
                        help='ターゲットアーキテクチャ (デフォルト: HC4)')
    
    parser.add_argument('-f', '--format',
                        choices=['binary', 'hex', 'ihex', 'vhex', 'text'],
                        default='binary',
                        help='出力形式 (デフォルト: binary)')
    
    parser.add_argument('-v', '--verbose',
                        action='store_true',
                        help='詳細出力を有効にする')
    
    return parser.parse_args()


def read_asm_file(filename:str):
    """アセンブリファイルを読み込む"""
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        return [line.rstrip('\n\r') for line in lines]
    except FileNotFoundError:
        print(f"エラー: ファイル '{filename}' が見つかりません。", file=sys.stderr)
        sys.exit(1)
    except UnicodeDecodeError:
        print(f"エラー: ファイル '{filename}' の文字エンコーディングが無効です。", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"エラー: ファイル '{filename}' の読み込み中にエラーが発生しました: {e}", file=sys.stderr)
        sys.exit(1)


def assemble_file(lines: list[str], architecture: str, verbose: bool = False):
    """ファイル全体をアセンブル"""
    assembled_lines:list[dictionaly.ListObject] = []
    errors:list[str] = []
    warnings:list[str] = []
    
    if verbose:
        print(f"アーキテクチャ: {architecture}")
        print(f"アセンブル開始...")
        print("-" * 50)
    
    # First pass: assemble all lines and collect labels
    labels:dict[str, int] = {}  # label_name -> address
    address = 0
    
    for line_num, line in enumerate(lines, 1):
        if verbose:
            print(f"行 {line_num:3d}: {line}")
        
        result = assembler.assembleline(line, line_num, architecture)
        result.address = address  # Set the current address
        assembled_lines.append(result)
        
        if result.error:
            errors.append(f"行 {line_num}: {result.error}")
            if verbose:
                print(f"         エラー: {result.error}")
        elif result.machinecode is not None:
            if verbose:
                print(f"         機械語: 0x{result.machinecode:02X} @ 0x{address:04X}")
            address += 1  # Increment address for machine code instructions
        else:
            if verbose and line.strip():
                print(f"         空行/コメント")
        
        # Collect labels
        if result.label:
            if result.label.name in labels:
                errors.append(f"行 {line_num}: ラベル '{result.label.name}' が重複しています")
            else:
                labels[result.label.name] = address
                result.label.address = address
                if verbose:
                    print(f"         ラベル: {result.label.name} = 0x{address:04X}")
    
    # Second pass: resolve label references
    for result in assembled_lines:
        # Check instruction that requires label resolution
        if result.machinecode is not None and (result.source[0].upper() == 'LI' or result.source[0].upper() == 'LS'):
            # Check if the second part is a label reference
            part = result.source[1]  # Second part is the oprand
            if part.startswith('#') and ':' in part:
                # Parse label reference: #label:slice
                try:
                    ref_part = part[1:]  # Remove '#'
                    label_name, slice_str = ref_part.split(':', 1)
                    slice_index = int(slice_str)
                    
                    if label_name not in labels:
                        errors.append(f"行 {result.linenum}: 未定義のラベル '{label_name}'")
                        continue
                    
                    label_address = labels[label_name]
                    
                    # Extract the specified slice (nibble)
                    if slice_index == 3:
                        nibble = (label_address >> 12) & 0xF  # bits [15:12]
                    elif slice_index == 2:
                        nibble = (label_address >> 8) & 0xF   # bits [11:8]
                    elif slice_index == 1:
                        nibble = (label_address >> 4) & 0xF   # bits [7:4]
                    elif slice_index == 0:
                        nibble = label_address & 0xF          # bits [3:0]
                    else:
                        errors.append(f"行 {result.linenum}: 無効なスライス '{slice_index}' (0-3の範囲である必要があります)")
                        continue
                    
                    # Update the machine code with the resolved address
                    # Extract the opcode and replace the operand
                    opcode = result.machinecode & 0xF0
                    result.machinecode = opcode | nibble
                    
                    if verbose:
                        print(f"         ラベル解決: {part} -> {label_name}[{slice_index}] = 0x{nibble:X}")
                    
                except (ValueError, IndexError) as e:
                    errors.append(f"行 {result.linenum}: ラベル参照の解析エラー '{part}': {e}")
    
    if verbose:
        print("-" * 50)
    
    return assembled_lines, errors, warnings


def generate_machine_code(assembled_lines: list[dictionaly.ListObject]):
    """機械語コードのバイト列を生成"""
    machine_code: list[int] = []
    for result in assembled_lines:
        if result.machinecode is not None:
            machine_code.append(result.machinecode)
    return machine_code


def write_binary_output(filename:str, machine_code:list[int]):
    """バイナリ形式で出力"""
    try:
        with open(filename, 'wb') as f:
            f.write(bytes(machine_code))
        return True
    except Exception as e:
        print(f"エラー: バイナリファイル '{filename}' の書き込み中にエラーが発生しました: {e}", file=sys.stderr)
        return False
    
def write_verilog_hex_output(filename:str, machine_code:list[int]):
    """verilogのHEX形式で出力"""
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            for i in machine_code:
                f.write(f"{i:02X}\n")
        return True
    except Exception as e:
        print(f"エラー: HEXファイル '{filename}' の書き込み中にエラーが発生しました: {e}", file=sys.stderr)
        return False


def write_intel_hex_output(filename:str, machine_code:list[int]):
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
                for byte_val in chunk:
                    checksum += byte_val
                checksum = (~checksum + 1) & 0xFF
                
                # Intel HEX行の生成
                hex_line = f":{data_len:02X}{address:04X}00"
                for byte_val in chunk:
                    hex_line += f"{byte_val:02X}"
                hex_line += f"{checksum:02X}"
                
                f.write(hex_line + '\n')
                address += data_len
            
            # EOF レコード
            f.write(":00000001FF\n")
        return True
    except Exception as e:
        print(f"エラー: HEXファイル '{filename}' の書き込み中にエラーが発生しました: {e}", file=sys.stderr)
        return False


def write_text_output(filename:str, machine_code:list[int], assembled_lines:list[dictionaly.ListObject]):
    """テキスト形式で出力"""
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            f.write("HCX アセンブル結果\n")
            f.write("=" * 50 + "\n\n")
            
            # 機械語とソースコードの対応表
            f.write("アドレス  機械語  ソースコード\n")
            f.write("-" * 50 + "\n")
            
            address = 0
            for result in assembled_lines:
                if result.machinecode is not None:
                    source_line = " ".join(result.source) if result.source else ""
                    f.write(f"{address:04X}     {result.machinecode:02X}     {source_line}\n")
                    address += 1
                elif result.source:  # コメントや空行でもソースがある場合
                    source_line = " ".join(result.source)
                    f.write(f"         --     {source_line}\n")
            
            f.write("\n" + "-" * 50 + "\n")
            f.write(f"生成された機械語: {len(machine_code)} バイト\n\n")
            
            # 16進ダンプ
            f.write("16進ダンプ:\n")
            for i in range(0, len(machine_code), 16):
                chunk = machine_code[i:i+16]
                hex_str = " ".join(f"{byte_val:02X}" for byte_val in chunk)
                f.write(f"{i:04X}: {hex_str:<47}\n")
                
        return True
    except Exception as e:
        print(f"エラー: テキストファイル '{filename}' の書き込み中にエラーが発生しました: {e}", file=sys.stderr)
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
        'text': '.txt'
    }
    
    return base_name + extensions[format_type]


def print_summary(assembled_lines: list[dictionaly.ListObject], errors: list[str], warnings: list[str], machine_code: list[int], verbose: bool = False):
    """アセンブル結果のサマリーを表示"""
    total_lines = len(assembled_lines)
    code_lines = sum(1 for result in assembled_lines if result.machinecode is not None)
    empty_lines = sum(1 for result in assembled_lines if result.machinecode is None and not result.source)
    comment_lines = sum(1 for result in assembled_lines if result.machinecode is None and result.source)
    
    print(f"\nアセンブル完了:")
    print(f"  総行数:       {total_lines}")
    print(f"  コード行:     {code_lines}")
    print(f"  コメント行:   {comment_lines}")
    print(f"  空行:         {empty_lines}")
    print(f"  生成バイト数: {len(machine_code)}")
    
    if errors:
        print(f"  エラー数:     {len(errors)}")
    if warnings:
        print(f"  警告数:       {len(warnings)}")
    
    if verbose and machine_code:
        print(f"\n生成された機械語:")
        for i in range(0, len(machine_code), 8):
            chunk = machine_code[i:i+8]
            hex_str = " ".join(f"{byte_val:02X}" for byte_val in chunk)
            print(f"  {i:04X}: {hex_str}")


def main():
    """メイン関数"""
    args = parse_arguments()
    
    # 入力ファイルの存在確認
    if not os.path.exists(args.input_file):
        print(f"エラー: 入力ファイル '{args.input_file}' が存在しません。", file=sys.stderr)
        sys.exit(1)
    
    # 出力ファイル名の決定
    output_filename = determine_output_filename(args.input_file, args.output, args.format)
    
    if args.verbose:
        print(f"HCX アセンブラ")
        print(f"入力ファイル: {args.input_file}")
        print(f"出力ファイル: {output_filename}")
        print(f"出力形式:     {args.format}")
        print()
    
    # アセンブリファイルの読み込み
    lines = read_asm_file(args.input_file)
    
    # アセンブル実行
    assembled_lines, errors, warnings = assemble_file(lines, args.architecture, args.verbose)
    
    # エラーチェック
    if errors:
        print("アセンブルエラーが発生しました:", file=sys.stderr)
        for error in errors:
            print(f"  {error}", file=sys.stderr)
        sys.exit(1)
    
    # 機械語コード生成
    machine_code = generate_machine_code(assembled_lines)
    
    # 出力ファイル書き込み
    success = False
    if args.format == 'binary':
        success = write_binary_output(output_filename, machine_code)
    elif args.format == 'ihex':
        success = write_intel_hex_output(output_filename, machine_code)
    elif args.format == 'hex' or args.format == 'vhex':
        success = write_verilog_hex_output(output_filename, machine_code)
    elif args.format == 'text':
        success = write_text_output(output_filename, machine_code, assembled_lines)
    
    if not success:
        sys.exit(1)
    
    # 結果サマリー表示
    print_summary(assembled_lines, errors, warnings, machine_code, args.verbose)
    
    if args.verbose or not errors:
        print(f"出力ファイル '{output_filename}' を生成しました。")


if __name__ == "__main__":
    main()
