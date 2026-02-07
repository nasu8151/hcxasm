.inc "vasm.inc"

START:
    ADD R0 R1 R2
    MOVI R3 #10
    MOV OUTA R3
    GOTO START
    GOTO_IF C END
END:
    GOTO END