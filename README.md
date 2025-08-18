# HCx Series Assembler

## Description

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
li #label:1 ; `label:3` picks value from label[15:12], `label:2` picks from label[11:8]
li #label:0 ; `label:1` picks from label[7:4], `label:0` picks from label[3:0]
```

### Pseudo-instruction

Currently not implemented.

## Command line options

* ```-o```, ```--output``` :
  * Specifies output file.
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
