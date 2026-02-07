.DEFINE OUTA r14
.DEFINE OUTB r15
.DEFINE INA  r14

.MACRO ADD dst src1 src2
    LD src1
    LD src2
    AD dst
.ENDMACRO

.MACRO ADDI dst src1 imm
    LD src1
    LI imm
    AD dst
.ENDMACRO

.MACRO MOV dst src
    LD src
    SA dst
.ENDMACRO

.MACRO MOVI dst imm
    LI imm
    SA dst
.ENDMACRO

.MACRO GOTO label
    LI #label:1
    LI #label:0
    JP
.ENDMACRO

.MACRO GOTO_IF cond label
    LI #label:1
    LI #label:0
    JP cond
.ENDMACRO
