import re
import testfuncs
from enum import Enum, auto

class insttype(Enum):
    INHERENT = auto()
    REGISTER = auto()
    IMMEDIATE = auto()
    JUMP = auto()

def assemble(code:str):
    INST_DICT = {
        "SM" : 0x00,    "SC" : 0x10, "SU" : 0x20, "AD" : 0x30, 
        "XR" : 0x40,    "OR" : 0x50, "AN" : 0x60, "SA" : 0x70,
        "LM" : 0x80,    "LD" : 0x90, "LI" : 0xA0, 
                        "JP" : 0xE0, "NP" : 0xE1
    }
    INST_TYPES = {
        "SM" : insttype.INHERENT,   "SC" : insttype.REGISTER, "SU" : insttype.REGISTER, "AD" : insttype.REGISTER, 
        "XR" : insttype.REGISTER,   "OR" : insttype.REGISTER, "AN" : insttype.REGISTER, "SA" : insttype.REGISTER,
        "LM" : insttype.INHERENT,   "LD" : insttype.REGISTER, "LI" : insttype.IMMEDIATE, 
                                    "JP" : insttype.JUMP, "NP" : insttype.INHERENT
    }
    
    tok = code.strip().split(" ")

    opcode = INST_DICT[tok[0]]

    match INST_TYPES[tok[0]]:
        case insttype.INHERENT:
            return opcode
        case insttype.REGISTER:
            oprand = int(re.findall(r"r([0-9]*)", tok[1])[0])
            if oprand > 15:
                raise ValueError(f"Too big register designator : {oprand}")
            return opcode + oprand
        case insttype.IMMEDIATE:
            oprand = int(re.findall(r"#([0-9]*)", tok[1])[0])
            if oprand > 15:
                raise ValueError(f"Too big immediate value : {oprand}")
            return opcode + oprand
def self_test():
    testfuncs.expect(0x00, assemble, "SM")
    testfuncs.expect(0x1A, assemble, "SC r10")
    testfuncs.expect(0x2F, assemble, "SU r15")
    testfuncs.expect(0xA5, assemble, "LI #5")
    testfuncs.expect_raises(KeyError, assemble, "XX r1")
    testfuncs.expect_raises(ValueError, assemble, "SC r16")
    print("[OK] assembler.py : All tests passed.")

if __name__ == "__main__":
    self_test()
