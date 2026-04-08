# HCx Assembler / Visual Assembler

[English README](README_EN.md)

- [HCx Assembler / Visual Assembler](#hcx-assembler--visual-assembler)
  - [概要](#概要)
  - [クイックスタート](#クイックスタート)
    - [1. CLIアセンブラを使う](#1-cliアセンブラを使う)
    - [2. Visual Assembler (vasm) を使う](#2-visual-assembler-vasm-を使う)
    - [3. パッケージビルド (Docker)](#3-パッケージビルド-docker)
  - [CLIリファレンス (hcxasm.py)](#cliリファレンス-hcxasmpy)
  - [アセンブリ記法の要点](#アセンブリ記法の要点)
  - [vasm (Visual Assembler) の位置づけ](#vasm-visual-assembler-の位置づけ)
  - [HC4E ローダー / デバッグ (load4e.py)](#hc4e-ローダー--デバッグ-load4epy)
  - [テスト](#テスト)
    - [統合テスト (推奨)](#統合テスト-推奨)
  - [プロジェクト構成](#プロジェクト構成)
  - [よくある注意点](#よくある注意点)
  - [関連ドキュメント](#関連ドキュメント)
  - [ライセンス](#ライセンス)

[HCxシリーズ](https://github.com/nasu8151/HC4)向けのアセンブラ開発環境です。以下の2つを1つのリポジトリで提供します。

- hcxasm: Python製のCLIアセンブラ
- vasm: Electron + Blockly製のVisual Assembler

本READMEは、開発者および外部利用者が「セットアップ -> 実行 -> 検証 -> 拡張」まで到達できることを目的にしています。

## 概要

- 対象CPU: HC4 / HC4E
- 入力: `.asm`ファイル、またはBlocklyブロック
- 出力: `binary` / `hex` / `vhex` / `ihex` / `text` / `list`
- 補助機能: HC4E向けシリアルローダー (`load4e.py`)

注: リポジトリ内にHC8の命令資料はありますが、現行CLI (`hcxasm.py`) のターゲット選択は `HC4` と `HC4E` です。

## クイックスタート

### 1. CLIアセンブラを使う

前提:

- Python 3.x

基本実行:

```bash
python hcxasm.py test/sample.asm
```

主な使用例:

```bash
# 出力ファイルを指定
python hcxasm.py test/sample.asm -o sample.bin

# Intel HEXで出力
python hcxasm.py py/test_files/dice4e.asm -a HC4E -f ihex -o dice4e.hex

# リスト出力 (ソース対応付き)
python hcxasm.py test/sample.asm -f list -o sample.lst -v

# .INCLUDE検索パスを追加
python hcxasm.py test/sample.asm -L ./include
```

### 2. Visual Assembler (vasm) を使う

前提:

- Node.js + npm

起動:

```bash
npm install
npm start
```

開発ログ付き起動:

```bash
npm run dev
```

起動後の基本フロー:

1. ブロックを配置して命令列を作成
2. ラベルを定義してJP/GOTO系ブロックに割り当て
3. 生成されたアセンブリを保存
4. 必要に応じて `hcxasm.py` で再アセンブル

### 3. パッケージビルド (Docker)

Windows向け配布物をDocker上で作成できます。

```powershell
docker compose build
npm run build:win:docker
```

詳細は [BUILD.md](BUILD.md) を参照してください。

## CLIリファレンス (hcxasm.py)

```text
python hcxasm.py <input.asm> [options]

Options:
  -o, --output <file>          出力ファイル名
  -a, --architecture <arch>    HC4 | HC4E (default: HC4)
  -f, --format <fmt>           binary | hex | ihex | vhex | text | list
  -v, --verbose                詳細ログを表示
  -q, --quiet                  出力メッセージを抑制
  -L, --include-path <path>    .INCLUDE 検索パスを追加 (複数指定可)
```

## アセンブリ記法の要点

コメント:

- `;` 以降はコメントとして扱われます
- `//` 形式のコメントも利用できます

オペランド:

- `r0` - `r15`: 4bitレジスタ
- `#i`: 即値 (`#12`, `#0xC`, `#0b1100` など)
- `JP` 条件: `C`, `NC`, `Z`, `NZ` など

ラベル指定:

```assembly
loop:
  li #loop:1
  li #loop:0
  jp
```

疑似命令/ディレクティブ:

```assembly
.DEFINE FROM TO
.MACRO NAME ARG1 ARG2 ...
  ; body
.ENDM
.INCLUDE /path/to/file
.EQU NAME VALUE
```

- `.DEFINE`, `.DEF`
  - 引数 : `FROM`, `TO`
  - `FROM`の名前を持つシンボルを作成し、それを`TO`に機械的に置き換えます。C言語の`#define`に近い効果を持ちます。
- `.MACRO`
  - 引数 : `NAME`, `ARG1`, `ARG2`, ...
  - `NAME`の名前を持つマクロを作成し、それ以降のコードにある`NAME`をマクロの中身で置き換えます。
  - また、`ARG1`, `ARG2`, ...はマクロの内部で同じ名前のシンボルとして、マクロ呼び出し時の値に定義され、`.DEFINE`で作成されたシンボルと同様にふるまいます。
  - 必ずマクロ定義の末尾に`.ENDM`, `.ENDMACRO`を置いてください。
- `.ENDM`
  - 引数 : なし
  - マクロ定義を終了します。
  - マクロ外に置いた時の動作は未定義です。
- `.INCLUDE`, `.INC`
  - 引数 : `/path/to/file`
  - `/path/to/file`をアセンブル時に結合します

## vasm (Visual Assembler) の位置づけ

vasmは、Blockly上で命令ブロックを組み立てて `.asm` を生成するフロントエンドです。

- GUIで作成 -> テキスト `.asm` を生成
- 生成した `.asm` はCLI (`hcxasm.py`) でそのまま利用可能
- 代表マクロは [include/vasm.inc](include/vasm.inc) に定義
  - vasm内で対応した名前のマクロブロックとして使用可
- HC4<sub>E</sub>の場合、load4e.pyによるHC4<sub>E</sub>への書き込みまで一貫して行える

例: `GOTO` 相当マクロ (抜粋)

```assembly
.MACRO GOTO label
    LI #label:1
    LI #label:0
    JP
.ENDMACRO
```

## HC4E ローダー / デバッグ (load4e.py)

`load4e.py` はシリアル経由でHC4Eへロード・レジスタ確認・トレースを行います。

前提:

- `pyserial` が必要

```bash
python -m pip install pyserial
```

使用例:

```bash
# Intel HEXをロード
python load4e.py load --file dice4e.hex --port COM3 --baudrate 115200

# レジスタ確認
python load4e.py register --port COM3

# JSON形式
python load4e.py --json register --port COM3

# 実行トレース
python load4e.py trace --port COM3
```

## テスト

### 統合テスト (推奨)

```bash
python py/test.py
```

このスクリプトは、複数のサンプルASMをアセンブルし、期待HEXとの差分検証を行います。
またそれぞれのPythonスクリプトのセルフテストも実行します。

## プロジェクト構成

- `hcxasm.py`: CLIエントリポイント
- `py/assembler.py`: コアアセンブラ
- `include/vasm.inc`: vasm向けマクロ群
- `load4e.py`: HC4Eシリアルローダー
- `main.js`: Electronメインプロセス
- `index.html`, `js/`: vasm UI実装
- `BUILD.md`: Dockerビルド手順

## よくある注意点

- `HC4E` は命令セットが制限されます。`HC4` 用コードがそのまま通らない場合があります。
- `.INCLUDE` の参照先が見つからない場合は `-L` を追加してください。
- `list/text` 出力を使う場合は `-o` 指定を推奨します。
- シリアル通信は使用ポート名とボーレート設定を確認してください。

## 関連ドキュメント

- [InstructionList.md](InstructionList.md): 命令表と仕様
- [BUILD.md](BUILD.md): Dockerビルド
- `py/test_files/*.asm`: テスト用サンプル
- `test/*.asm`: 追加サンプル

## ライセンス

MIT License。詳細は `LICENCE` を参照してください。


