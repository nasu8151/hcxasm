import re
from typing import Optional
import testfuncs
from enum import Enum, auto

class insttype(Enum):
    INHERENT = auto()
    REGISTER = auto()
    IMMEDIATE = auto()
    JUMP = auto()

class LinkState:
    def __init__(self):
        self.labels: dict[str, int] = {}
        self.unresolved: dict[int, str] = {}

    def __repr__(self) -> str:
        return f"LinkState(labels={self.labels}, unresolved={self.unresolved})"
    
    def add_label(self, label:str, address:int):
        if label in self.labels:
            raise ValueError(f"[Error] Duplicate label definition: {label}")
        self.labels[label] = address
    
    def add_unresolved(self, label:str, address:int):
        self.unresolved[address] = label

    def parse_label(self, label:str) -> Optional[int]:
        sliced = (label.split(":"))[:2]
        # print(sliced)
        addr = self.labels.get(sliced[0], None)
        if addr is not None:
            return (addr >> (int(sliced[1]) * 4)) & 0x0F
        return None

def assemble(code:list[str]) -> list[int]:
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
    JMP_FLAGS = {"C" : 0x02, "NC" : 0x03, "Z" : 0x04, "NZ" : 0x05, }

    machine_code = []
    link_state = LinkState()

    for line in code:
        tok = line.strip().split(" ")

        if tok[0].upper().endswith(":"):
            label = tok[0].upper()[:-1]
            tok.pop(0)
            link_state.add_label(label, len(machine_code))
            if len(tok) == 0:
                continue

        opcode = INST_DICT.get(tok[0].upper())
        if opcode is None:
            raise KeyError(f"[Error] Invalid instruction: {tok[0]}")

        # assemble lines
        match INST_TYPES.get(tok[0].upper()):
            case None:
                raise KeyError(f"[Error] Oops! : {tok[0]} is found in INST_DICT but not in INST_TYPES")
            case insttype.INHERENT:
                machine_code.append(opcode)
            case insttype.REGISTER:
                oprand = int(re.findall(r"r([0-9]*)", tok[1])[0])
                if oprand > 15:
                    raise ValueError(f"Too big register designator : {oprand}")
                machine_code.append(opcode + oprand)
            case insttype.IMMEDIATE:
                label = re.findall(r"#([A-Za-z_][A-Za-z0-9_]*:[0-3])", tok[1])
                if label:
                    link_state.add_unresolved(label[0], len(machine_code))
                    machine_code.append(opcode)
                    continue
                oprand = int(re.findall(r"#([0-9]*)", tok[1])[0])
                if oprand > 15:
                    raise ValueError(f"Too big immediate value : {oprand}")
                machine_code.append(opcode + oprand)
            case insttype.JUMP:
                if len(tok) == 1:
                    machine_code.append(opcode)
                else:
                    flag = tok[1].upper()
                    if flag not in JMP_FLAGS:
                        raise ValueError(f"Invalid jump flag : {flag}")
                    machine_code.append(opcode + JMP_FLAGS[flag])

    # print(link_state)

    for addr, label in link_state.unresolved.items():
        value = link_state.parse_label(label)
        if value is None:
            raise KeyError(f"[Error] Undefined label: {label}")
        machine_code[addr] += value
    return machine_code

def self_test():
    testfuncs.expect([0x00, 0x1A, 0x2F, 0xA5, 0xE3, 0xE0], assemble, [
        "SM", "SC r10", "SU r15", "LI #5", "JP NC", "JP"
    ])
    testfuncs.expect([0xE1, 0x00, 0x1C, 0x20, 0xA1, 0xA0, 0xE4, 0xE0], assemble, [
        "NP", "LOOP: SM", "SC r12", "SU r0", "LI #LOOP:0", "LI #LOOP:1", "JP Z", "JP"
    ])
    testfuncs.expect_raises(KeyError, assemble, ["XX r1"])
    testfuncs.expect_raises(ValueError, assemble, ["SC r16"])
    testfuncs.expect_raises(ValueError, assemble, ["LI #16"])
    print("[OK] assembler.py : All tests passed.")

if __name__ == "__main__":
    self_test()
