# HCx Series Assembler

## Description : hcxasm

This is an assembler for HC4/HC4<sub>E</sub>/HC8 CPU.


## Syntax
### Basic syntax

Let's get right to the explanation, but first, we tell you one.
On HC4 assembler, comments are represented by `;`. characters on the line after `;` are ignored during assembly.
```
<Instruction>
<Instruction> <reg> ;reg means a 4-bit wide register. In the program, it is represented by r0 to r15 in program.
<Instruction> <imm> ;imm means 4 bits wide immediate data. In a program, it is represented as literal such as #12, #0xC or #0b1100.
<Instruction> <flg> ;flg means flags. There are two types of flags: C and Z. The C flag is the carry flag, and the Z flag is the zero flag. 

;Addressing option is represented [AB] for SC or [ABC] for JP.
;[AB] means indirect addressing of stack level A and B. MSB is level B.
;[ABC] means indirect addressing of stack level A, B and C. MSB is level C.
<Instruction>             ; for load and store instructions
<Instruction> <flg>       ; for jump instructions
```

### Labels

Labels are used to simplify address specification in programs.
```assembly
label: ; Define a label
li #label:2 ; parse label into immediate value
li #label:1 ; `label:3` picks value from label[15:12], `label:2` picks from label[11:8].
li #label:0 ; `label:1` picks from label[7:4], `label:0` picks from label[3:0].
```

### Pseudo-instruction

Currently not implemented.

## Command line options

* ```-o```, ```--output``` :
  * Specifies output file name.
  * Default : ```<input_file_name>.bin```
* ```-a```, ```--architecture``` :
  * Select your target architecture from ```HC4``` and ```HC4E```
  * Default : ```HC4```
* ```-f```, ```-format``` : 
  * Select your file output format.
  * ```binary``` : binary file (Default)
  * ```hex``` and ```vhex``` : hexadecimal file format for verilog simulation.
  * ```ihex``` : intel hex
  * ```text``` : list file
* ```-v```, ```--verbose``` : 
  * Enable the verbose output

## ビジュアルアセンブラ（Visual Assembler, vasm）

### 概要

ビジュアルアセンブラ（vasm）は、Blocklyベースのビジュアルプログラミング環境で、HC4/HC8 CPUアーキテクチャ向けのアセンブリプログラムを直感的に作成できます。ドラッグ&ドロップで命令やラベルを組み合わせ、即座にアセンブリコードを生成・保存できます。

### 主な特徴

- HC4/HC8命令セット（DICTHC4）に完全対応
- ラベル定義・ジャンプ命令（JP/GOTO）・即値・レジスタ選択などをブロックで表現
- Blocklyによる視覚的なプログラミング
- Electronアプリとしてオフライン動作
- アセンブリファイルのエクスポート機能
- Scratch風のラベル管理（新規作成・選択・自動反映）

### 使い方

1. `index.html`をElectronアプリとして起動（またはWebサーバで開く）
2. 左側のツールボックスから命令やラベルブロックをドラッグ＆ドロップ
3. ブロックを組み合わせてプログラムを作成
4. 下部に生成されるアセンブリコードを確認
5. 「保存」ボタンでアセンブリファイル（.asm）としてエクスポート

### ブロックの種類

- **命令ブロック**: SM, SC, SU, AD, XR, OR, AN, SA, LM, LD, LI, JP, NP
- **ラベル定義ブロック**: 任意のラベル名を定義し、ジャンプ先として利用可能
- **GOTOブロック**: ラベル名を指定してジャンプ（LI+JP命令列を自動生成）
- **JPブロック**: フラグ条件ジャンプ

### ラベル管理

- ラベルは「ラベル」ブロックで定義
- JPやGOTOブロックのドロップダウンから既存ラベルを選択、または新規作成
- 新規ラベル作成時はダイアログで名前を入力
- すべてのラベル関連ブロックに即時反映

### ファイル構成

- `index.html` : メインUI・Blockly定義・コード生成
- `main.js` : Electronメインプロセス
- `preload.js` : ElectronセキュアAPIブリッジ
- `package.json` : Electronアプリ設定

### ライセンス

本ツールはMITライセンスです。


