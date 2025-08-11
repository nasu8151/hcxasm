# How to read these tables

Instruction of these CPUs are 8-bit wide.   
```r``` means a 4-bit wide register. In the program, it is represented by ```r0``` to ```r15``` in program.    
```#i``` means a 4-bit wide immediate data.    
```[AB]``` means indirect addressing of stack level A and B. MSB is level B.   
```[ABC]``` means indirect addressing of stack level A, B and C. MSB is level C.    
"PC" means Program Counter.

# Instruction table

Do not include any instructions marked as (Reserved) in the program.
These instrucitons may not work correctly. 

## HC4

| bit 7-6<br>5-4 | 00            | 01         | 10                       | 11         |
| -------------- | ------------- | ---------- | ------------------------ | ---------- |
| 00             | ```SM [AB]``` | ```SC r``` | ```SU r```               | ```AD r``` |
| 01             | ```XR r```    | ```OR r``` | ```AN r```               | ```SA r``` |
| 10             | ```LM [AB]``` | ```LD r``` | ```LI #```               | (Reserved) |
| 11             | (Reserved)    | (Reserved) | ```JP [ABC]```, ```NP``` | (Reserved) |

## HC4<sub>E</sub>

| bit 7-6<br>5-4 | 00         | 01         | 10                       | 11         |
| -------------- | ---------- | ---------- | ------------------------ | ---------- |
| 00             | (Reserved) | (Reserved) | (Reserved)               | ```AD r``` |
| 01             | ```XR r``` | (Reserved) | (Reserved)               | ```SA r``` |
| 10             | (Reserved) | ```LD r``` | ```LI #```               | (Reserved) |
| 11             | (Reserved) | (Reserved) | ```JP [ABC]```, ```NP``` | (Reserved) |

## HC8

| bit 5-4\7-6 | 00            | 01         | 10            | 11                      |
| ----------- | ------------- | ---------- | ------------- | ----------------------- |
| 00          | ```SC [AB]``` | ```XR r``` | ```LD [AB]``` | ```LS #i```             |
| 01          | ```SC r```    | ```OR r``` | ```LD r```    | (Reserved)              |
| 10          | ```SU r```    | ```AN r``` | ```li #```    | ```JP [AB]```, ```NP``` |
| 11          | ```AD r```    | ```SA r``` | (Reserved)    | ```JL [AB]```, ```LP``` |

# Instruction List

## Logical and alithmetic instructions

| Name       | Opc  | Opr | Flag changes | Function   |                            |
| ---------- | ---- | --- | ------------ | ---------- | -------------------------- |
| ```SU r``` | 0010 | r   | C, Z         | r <= A-B   | SUbtract and store in r    |
| ```AD r``` | 0011 | r   | C, Z         | r <= A+B   | ADd and store in r         |
| ```XR r``` | 0100 | r   | Z            | r <= A^B   | bitwise XoR and store in r |
| ```OR r``` | 0101 | r   | Z            | r <= A\|B  | bitwise OR and store in r  |
| ```AN r``` | 0110 | r   | Z            | r <= A&B   | bitwise ANd and store in r |

## Register and memory access instructions

| Name            | Opc  | Opr  | Flag changes |                            |
| --------------- | ---- | ---- | ------------ | -------------------------- |
| \*```SC [AB]``` | 0000 | 0000 | Z            | Store C in [AB]            |
| ```SC r```      | 0001 | r    | Z            | Store C in r               |
| ```SA r```      | 0111 | r    | Z            | Store A in r               |
| \*```LD [AB]``` | 1000 | 0000 |              | LoaD from [AB]             |
| ```LD r```      | 1001 | r    |              | LoaD form r                |
| ```li #i```     | 1010 | i    |              | LoaD immediate             |
| \*\*```LS #i``` | 1100 | i    |              | Load immediate and Shift A |

Note:    
\* Can be omitted addressing.   
\*\* Only for HC8.

## System control instructions

| Name                | Opc  | Opr  |                               |
| ------------------- | ---- | ---- | ----------------------------- |
| \*```JP [ABC]```    | 1110 | 0000 | JumP [ABC]                    |
| \*```JP C [ABC]```  | 1110 | 0010 | Jump if Carry flag is set     |
| \*```JP NC [ABC]``` | 1110 | 0011 | Jump if Carry flag is Not set |
| \*```JP Z [ABC]```  | 1110 | 0100 | Jump if Zero flag is set      |
| \*```JP NZ [ABC]``` | 1110 | 0101 | Jump if Zero flag is Not set  |
| ```NP```            | 1110 | 0001 | No oPlation                   |

Note:    
\* Can be omitted addressing.

## Pseudo-Instructions

| ---------------------- | --- |
| ```.equ name: value``` |     |
| ```.org address```     |     |


# Instruction manual
## Logical and alithmetic instructions

These instructions are executed for stack levels A and B, and store the results in registers which specified ```r```.

## Register and memory access instructions

Store instructions store value of stack level A or C in registers or memory area. ```SA r``` instruction refers stack level A, and ```SC r``` and ```SC [AB]``` instructions refer stack level C.   
Load instructions, ```LD```,  load stack level A from register or memory area. When a value is loaded into stack level A, the previous value of level A moves to level B, and the value of level B moves to level C. ```LD r``` refers register ```r```, ```li #i``` loads immediate data and ```LD [AB]``` refers memory address specified level A and B.   
Load and shift instruction, ```LS #i```, used to load an 8-bit wide data onto the stack.
For the ```LS #``` and ```li #``` instructions, binary(```0b1010```) and hexadecimal(```0xA```) literals can be used.

## System control instructions

```NP``` does nothing. This is equivalent to ```NOP```.   
```JP``` instructions change conditionally PC.

## Pseudo instructions

```.equ``` defines a label with the value specified by the operand, similar to ```#define``` in C.

## HC4<sub>E</sub>

In HC4<sub>E</sub>, only stack levels A and B are valid.
It has 16 nibbles of address space and only register addressing mode(```r```).
I/O Registers are placed ```r14``` and ```r15```.