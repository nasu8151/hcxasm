# HCx Assembler / Visual Assembler

[日本語 README](README.md)

[HCx Series](https://github.com/nasu8151/HC4) target assembler environment with two interfaces:

- [HCx Assembler / Visual Assembler](#hcx-assembler--visual-assembler)
  - [Overview](#overview)
  - [Quick Start](#quick-start)
    - [1. Use the CLI assembler](#1-use-the-cli-assembler)
    - [2. Use Visual Assembler (vasm)](#2-use-visual-assembler-vasm)
    - [3. Build distributables with Docker](#3-build-distributables-with-docker)
  - [CLI Reference (hcxasm.py)](#cli-reference-hcxasmpy)
  - [Assembly Syntax Essentials](#assembly-syntax-essentials)
  - [How vasm Fits](#how-vasm-fits)
  - [HC4E Loader / Debugging (load4e.py)](#hc4e-loader--debugging-load4epy)
  - [Tests](#tests)
    - [Integrated test script (recommended)](#integrated-test-script-recommended)
  - [Project Layout](#project-layout)
  - [Common Pitfalls](#common-pitfalls)
  - [Related Documents](#related-documents)
  - [License](#license)


This repository provides an assembler toolchain with two interfaces:

- hcxasm: Python CLI assembler
- vasm: Electron + Blockly visual assembler

This README is aimed at developers and external users who need a reproducible path from setup to execution, verification, and extension.

## Overview

- Target CPUs: HC4 / HC4E
- Input: `.asm` files or Blockly blocks
- Output: `binary` / `hex` / `vhex` / `ihex` / `text` / `list`
- Utility: HC4E serial loader (`load4e.py`)

Note: The repository includes HC8 instruction documentation, but the current CLI target selector in `hcxasm.py` supports `HC4` and `HC4E`.

## Quick Start

### 1. Use the CLI assembler

Prerequisites:

- Python 3.x

Basic run:

```bash
python hcxasm.py test/sample.asm
```

Common examples:

```bash
# Specify output file
python hcxasm.py test/sample.asm -o sample.bin

# Output Intel HEX
python hcxasm.py py/test_files/dice4e.asm -a HC4E -f ihex -o dice4e.hex

# List output (with source mapping)
python hcxasm.py test/sample.asm -f list -o sample.lst -v

# Add include search path
python hcxasm.py test/sample.asm -L ./include
```

### 2. Use Visual Assembler (vasm)

Prerequisites:

- Node.js + npm

Run:

```bash
npm install
npm start
```

Run with development logging:

```bash
npm run dev
```

Typical flow:

1. Place instruction blocks
2. Define labels and attach them to JP/GOTO blocks
3. Save generated assembly code
4. Assemble again with `hcxasm.py` if needed

### 3. Build distributables with Docker

You can build Windows artifacts in Docker.

```powershell
docker compose build
npm run build:win:docker
```

See [BUILD.md](BUILD.md) for details.

## CLI Reference (hcxasm.py)

```text
python hcxasm.py <input.asm> [options]

Options:
  -o, --output <file>          Output file name
  -a, --architecture <arch>    HC4 | HC4E (default: HC4)
  -f, --format <fmt>           binary | hex | ihex | vhex | text | list
  -v, --verbose                Enable verbose logs
  -q, --quiet                  Suppress output messages
  -L, --include-path <path>    Add .INCLUDE search path (repeatable)
```

## Assembly Syntax Essentials

Comments:

- `;` starts a comment
- `//` comments are also supported

Operands:

- `r0` to `r15`: 4-bit registers
- `#i`: immediate values (`#12`, `#0xC`, `#0b1100`)
- `JP` conditions: `C`, `NC`, `Z`, `NZ`, etc.

Label usage:

```assembly
loop:
  li #loop:1
  li #loop:0
  jp
```

Pseudo instructions / directives:

```assembly
.DEFINE FROM TO
.MACRO NAME ARG1 ARG2 ...
  ; body
.ENDM
.INCLUDE /path/to/file
.EQU NAME VALUE
```

- `.DEFINE`, `.DEF`
  - Args: `FROM`, `TO`
  - Creates a symbol named `FROM` and mechanically replaces it with `TO`. This is conceptually similar to `#define` in C.
- `.MACRO`
  - Args: `NAME`, `ARG1`, `ARG2`, ...
  - Defines a macro named `NAME`; subsequent occurrences of `NAME` are expanded with the macro body.
  - `ARG1`, `ARG2`, ... are also defined as symbols inside the macro, bound to call-site values, and behave similarly to symbols created by `.DEFINE`.
  - Always terminate macro definitions with `.ENDM` or `.ENDMACRO`.
- `.ENDM`
  - Args: none
  - Ends a macro definition.
  - Behavior is undefined when placed outside a macro definition.
- `.INCLUDE`, `.INC`
  - Args: `/path/to/file`
  - Includes and assembles `/path/to/file` as part of the current source.

For the full ISA details, see [InstructionList.md](InstructionList.md).

## How vasm Fits

vasm is a front-end that builds `.asm` code by combining Blockly blocks.

- Build in GUI -> generate text `.asm`
- Generated `.asm` is directly consumable by CLI (`hcxasm.py`)
- Common helper macros are in [include/vasm.inc](include/vasm.inc)
  - These can be used as corresponding macro blocks inside vasm
- For HC4<sub>E</sub>, the flow can be end-to-end up to writing to HC4<sub>E</sub> via `load4e.py`

Example GOTO macro (excerpt):

```assembly
.MACRO GOTO label
    LI #label:1
    LI #label:0
    JP
.ENDMACRO
```

## HC4E Loader / Debugging (load4e.py)

`load4e.py` supports serial load, register read, and trace operations for HC4E.

Prerequisite:

- `pyserial`

```bash
python -m pip install pyserial
```

Examples:

```bash
# Load Intel HEX
python load4e.py load --file dice4e.hex --port COM3 --baudrate 115200

# Read registers
python load4e.py register --port COM3

# JSON output
python load4e.py --json register --port COM3

# Execution trace
python load4e.py trace --port COM3
```

## Tests

### Integrated test script (recommended)

```bash
python py/test.py
```

This script assembles multiple sample programs and validates outputs against expected hex files.
It also runs self-tests for each Python script.

## Project Layout

- `hcxasm.py`: CLI entry point
- `py/assembler.py`: core assembler
- `include/vasm.inc`: helper macros for vasm workflows
- `load4e.py`: HC4E serial loader
- `main.js`: Electron main process
- `index.html`, `js/`: vasm UI implementation
- `BUILD.md`: Docker build instructions

## Common Pitfalls

- `HC4E` has a restricted instruction set; some `HC4` code will fail on `HC4E`.
- If `.INCLUDE` fails, add include directories with `-L`.
- For `list/text` output, explicitly setting `-o` is recommended.
- For serial operations, verify port name and baud rate.

## Related Documents

- [InstructionList.md](InstructionList.md): instruction tables and semantics
- [BUILD.md](BUILD.md): Docker build workflow
- `py/test_files/*.asm`: sample programs for tests
- `test/*.asm`: additional assembly examples

## License

MIT License. See `LICENCE` for details.