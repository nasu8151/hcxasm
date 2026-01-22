import re
from typing import Optional
from typing import Sequence
import testfuncs
from enum import Enum, auto

class insttype(Enum):
    INHERENT = auto()
    REGISTER = auto()
    IMMEDIATE = auto()
    JUMP = auto()

class LinkState:
    def __init__(self):
        # label -> address
        self.labels: dict[str, int] = {}
        # address -> label
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
        addr = self.labels.get(sliced[0].upper(), None)
        if addr is not None:
            return (addr >> (int(sliced[1]) * 4)) & 0x0F
        return None

def assemble(code:Sequence[tuple[str, int]], ls:LinkState, arch:str) -> list[tuple[int, int]]:
    """
    Assemble HC4 assembly code into machine code.\n
    Input: list of tuples (line:str, lineno:int)\n
    Output: list of tuples (machine_code:int, lineno:int)
    """

    INST_DICT_M = {"HC4": {
        "SM" : 0x00,    "SC" : 0x10, "SU" : 0x20, "AD" : 0x30, 
        "XR" : 0x40,    "OR" : 0x50, "AN" : 0x60, "SA" : 0x70,
        "LM" : 0x80,    "LD" : 0x90, "LI" : 0xA0, 
                        "JP" : 0xE0, "NP" : 0xE1
    }, 
    "HC4E": {
                                                "AD" : 0x30, 
        "XR" : 0x40,                            "SA" : 0x70,
        "LD" : 0x90,    "LI" : 0xA0,
                        "JP" : 0xE0, "NP" : 0xE1
    }}
    INST_TYPES = {
        "SM" : insttype.INHERENT,   "SC" : insttype.REGISTER, "SU" : insttype.REGISTER, "AD" : insttype.REGISTER, 
        "XR" : insttype.REGISTER,   "OR" : insttype.REGISTER, "AN" : insttype.REGISTER, "SA" : insttype.REGISTER,
        "LM" : insttype.INHERENT,   "LD" : insttype.REGISTER, "LI" : insttype.IMMEDIATE, 
                                    "JP" : insttype.JUMP, "NP" : insttype.INHERENT
    }
    JMP_FLAGS = {"C" : 0x02, "NC" : 0x03, "Z" : 0x04, "NZ" : 0x05, }

    INST_DICT = INST_DICT_M.get(arch)
    if INST_DICT is None:
        raise KeyError(f"[Error] Unsupported architecture: {arch}")

    machine_code: list[tuple[int, int]] = []

    for line, lineno in code:
        tok = line.strip().split(" ")

        if tok[0].upper().endswith(":"):
            label = tok[0].upper()[:-1]
            tok.pop(0)
            ls.add_label(label, len(machine_code))
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
                machine_code.append((opcode, lineno))
            case insttype.REGISTER:
                oprand = int(re.findall(r"r([0-9]*)", tok[1])[0])
                if oprand > 15:
                    raise ValueError(f"Too big register designator : {oprand}")
                machine_code.append((opcode + oprand, lineno))
            case insttype.IMMEDIATE:
                label = re.findall(r"#([A-Za-z_][A-Za-z0-9_]*:[0-3])", tok[1])
                if label:
                    ls.add_unresolved(label[0], len(machine_code))
                    machine_code.append((opcode, lineno))
                    continue
                oprand = int(re.findall(r"#([0-9]*)", tok[1])[0])
                if oprand > 15:
                    raise ValueError(f"Too big immediate value : {oprand}")
                machine_code.append((opcode + oprand, lineno))
            case insttype.JUMP:
                if len(tok) == 1:
                    machine_code.append((opcode, lineno))
                else:
                    flag = tok[1].upper()
                    if flag not in JMP_FLAGS:
                        raise ValueError(f"Invalid jump flag : {flag}")
                    machine_code.append((opcode + JMP_FLAGS[flag], lineno))

    print(ls)

    for addr, label in ls.unresolved.items():
        value = ls.parse_label(label)
        if value is None:
            raise KeyError(f"[Error] Undefined label: {label}")
        machine_code[addr] = (machine_code[addr][0] + value, machine_code[addr][1])
    return machine_code

def preprocess(lines:Sequence[str]) -> list[tuple[str, int]]:
    """preprocessor for assembly code: remove comments and empty lines"""
    processed: list[tuple[str, int]] = []
    for lineno, line in enumerate(lines, start=1):
        # remove comments
        line = re.sub(r";.*$", "", line)
        # skip empty lines
        if line.strip() == "":
            continue
        processed.append((line, lineno))
    return processed

def self_test():
    testfuncs.expect([(0x00, 1), (0x1A, 2), (0x2F, 3), (0xA5, 4), (0xE3, 5), (0xE0, 6)], assemble, [
        ("SM", 1), ("SC r10", 2), ("SU r15", 3), ("LI #5", 4), ("JP NC", 5), ("JP", 6)
    ])
    testfuncs.expect([(0xE1, 1), (0x00, 2), (0x1C, 3), (0x20, 4), (0xA1, 5), (0xA0, 6), (0xE4, 7), (0xE0, 8)], assemble, [
        ("NP", 1), ("LOOP: SM", 2), ("SC r12", 3), ("SU r0", 4), ("LI #LOOP:0", 5), ("LI #LOOP:1", 6), ("JP Z", 7), ("JP", 8)
    ])
    testfuncs.expect([(0x90, 2), (0xA0, 3), (0xE0, 4)], assemble, preprocess(
        """; This is a comment line
        LD r0      ; Load to register 0
        LI #0      ; Load immediate 0
        JP         ; Jump
        """.splitlines()
    ))
    testfuncs.expect_raises(KeyError, assemble, [("XX r1", 1)])
    testfuncs.expect_raises(ValueError, assemble, [("SC r16", 1)])
    testfuncs.expect_raises(ValueError, assemble, [("LI #16", 1)])

    print("[OK] assembler.py : All tests passed.")

if __name__ == "__main__":
    self_test()
