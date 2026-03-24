import re
from typing import Optional
from typing import Sequence
import testfuncs
from enum import Enum, auto
from pathlib import Path

class insttype(Enum):
    INHERENT = auto()
    REGISTER = auto()
    IMMEDIATE = auto()
    JUMP = auto()

DIRECTIVES = {
    ".DEF"     : 1,
    ".DEFINE"  : 1,
    ".MACRO"   : 2,
    ".ENDMACRO": 3,
    ".ENDM"    : 3,
    ".INCLUDE" : 4,
    ".INC"     : 4,
    ".EQU"     : 101,
}

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

class Defines:
    def __init__(self, initial_defs:Optional[dict[str, str]]=None):
        self.defines: list[dict[str, str]] = [{}]
        if initial_defs is not None:
            self.defines[0] = initial_defs
        self.level = 0
    
    def add_def(self, key:str, value:str):
        if key in self.defines[self.level]:
            raise ValueError(f"[Error] Duplicate define: {key}")
        self.defines[self.level][key] = value
    
    def get_def(self, key:str) -> Optional[str]:
        for level in reversed(range(self.level + 1)):
            if key in self.defines[level]:
                return self.defines[level][key]
        return None
    
    def new_scope(self):
        self.level += 1
        if len(self.defines) <= self.level:
            self.defines.append({})
    
    def end_scope(self):
        if self.level == 0:
            raise ValueError("[Error] No scope to end.")
        self.defines.pop()
        self.level -= 1

    def items(self):
        result = {}
        for level in reversed(range(self.level + 1)):
            result.update(self.defines[level])
        return result.items()

class Macros:
    def __init__(self, initial_macros:Optional[dict[str, tuple[list[str], list[str]]]]=None):
        self.macros: dict[str, tuple[list[str], list[str]]] = initial_macros if initial_macros is not None else {}
    
    def add_macro(self, name:str, lines:list[str], params:list[str]):
        if name in self.macros:
            raise ValueError(f"[Error] Duplicate macro definition: {name}")
        self.macros[name] = (lines, params)
    
    def get_macro(self, name:str) -> Optional[tuple[list[str], list[str]]]:
        return self.macros.get(name, None)

def assemble(code:Sequence[tuple[str, int]], ls:LinkState, arch:str) -> dict[int, tuple[int, int]]:
    """
    Assemble HC4 assembly code into machine code.\n
    Input: list of tuples (line:str, lineno:int)\n
    Output: list of tuples (machine_code:int, lineno:int)
    """
    global INST_DICT_M
    global INST_TYPES
    JMP_FLAGS = {"C" : 0x02, "NC" : 0x03, "Z" : 0x04, "NZ" : 0x05, }

    INST_DICT = INST_DICT_M.get(arch)
    if INST_DICT is None:
        raise KeyError(f"[Error] Unsupported architecture: {arch}")
    
    # (address : (code, linenum))
    machine_code: dict[int, tuple[int, int]] = {}
    
    address = 0
    for line, lineno in code:
        if line.strip() == "":
            continue
        tok = line.strip().split(" ")

        if tok[0].upper().endswith(":"):
            label = tok[0].upper()[:-1]
            tok.pop(0)
            ls.add_label(label, len(machine_code))
            if len(tok) == 0:
                continue

        opcode = INST_DICT.get(tok[0].upper())
        if opcode is None:
            raise KeyError(f"[Error] Invalid instruction: {tok[0]} in line {lineno}")

        # assemble lines
        match INST_TYPES.get(tok[0].upper()):
            case None:
                raise KeyError(f"[Error] Oops! : {tok[0]} is found in INST_DICT but not in INST_TYPES")
            case insttype.INHERENT:
                machine_code[address] = ((opcode, lineno))
                address += 1
            case insttype.REGISTER:
                oprand = int(re.findall(r"[rR]([0-9]*)", tok[1])[0])
                if oprand > 15:
                    raise ValueError(f"Too big register designator : {oprand} in line {lineno}")
                machine_code[address] = ((opcode + oprand, lineno))
                address += 1
            case insttype.IMMEDIATE:
                label = re.findall(r"#([A-Za-z_][A-Za-z0-9_]*:[0-3])", tok[1])
                if label:
                    ls.add_unresolved(label[0], len(machine_code))
                    machine_code[address] = ((opcode, lineno))
                    address += 1
                    continue
                try:
                    # print(tok[1])
                    # print(re.findall(r"#((0x|0b)?[0-9a-fA-F]+)", tok[1])[0][0])
                    oprand = int(re.findall(r"#((0x|0b)?[0-9a-fA-F]+)", tok[1])[0][0], 0)
                except ValueError:
                    raise ValueError(f"Invalid immediate value : {tok[1]} in line {lineno}")
                if oprand > 15:
                    raise ValueError(f"Too big immediate value : {oprand} in line {lineno}")
                if oprand < 0:
                    raise ValueError(f"Negative immediate value : {oprand} in line {lineno}")
                machine_code[address] = ((opcode + oprand, lineno))
                address += 1
            case insttype.JUMP:
                if len(tok) == 1:
                    machine_code[address] = ((opcode, lineno))
                    address += 1
                else:
                    flag = tok[1].upper()
                    if flag not in JMP_FLAGS:
                        raise ValueError(f"Invalid jump flag : {flag} in line {lineno}")
                    machine_code[address] = ((opcode + JMP_FLAGS[flag], lineno))
                    address += 1

    # print(ls)

    for addr, label in ls.unresolved.items():
        value = ls.parse_label(label)
        if value is None:
            raise KeyError(f"[Error] Undefined label: {label}")
        machine_code[addr] = (machine_code[addr][0] + value, machine_code[addr][1])
    return machine_code

address = 0

def preprocess(lines:Sequence[str], child:bool, lineno_start:int, include_pathes:list[str], defines:Defines=Defines(), macros:Macros=Macros()) -> list[tuple[str, int, str, int]]:
    """
    preprocessor for assembly code: remove comments and empty lines
    Input: list of lines (str)
    Output: list of tuples (line:str, lineno:int, unprocessed_line:str, address:int)
    """
    global DIRECTIVES
    global INST_TYPES
    global address
    # (line:str, lineno:int, unprocessed_line:str, address:int)
    processed: list[tuple[str, int, str, int]] = []
    i = 0
    lineno = lineno_start
    # print(address)
    while i < len(lines):
        i += 1
        line = lines[i - 1].strip()
        if not child:
            lineno = i
        # remove comments
        unprocessed_line = line
        line = re.sub(r";.*$", "", line)
        tok = line.strip().split(" ")
        directive = DIRECTIVES.get(tok[0].upper(), None)
        if directive == 1:  # .DEF or .DEFINE
            if len(tok) < 3:
                raise ValueError(f"[Error] Invalid .DEF or .DEFINE directive at line {lineno}")
            defines.add_def(tok[1], " ".join(tok[2:]))
            processed.append(("", lineno, unprocessed_line, address))
            continue
        elif directive == 2:  # .MACRO
            if child:
                raise ValueError(f"[Error] Nested macros are not supported (line {lineno})")
            if len(tok) < 2:
                raise ValueError(f"[Error] Invalid .MACRO directive at line {lineno}")
            macro_name = tok[1].upper()
            params = tok[2:] if len(tok) > 2 else []
            macro_lines: list[str] = []
            processed.append(("", lineno, unprocessed_line, address))
            for macro_lineno, macro_line in enumerate(lines[i:], start=i + 1):
                macro_line_clean = re.sub(r";.*$", "", macro_line)
                macro_line = macro_line.strip()
                macro_lines.append(macro_line)
                processed.append(("", macro_lineno, macro_line, address))
                if macro_line_clean.strip().upper().startswith((".ENDMACRO", ".ENDM")):
                    break
            else:
                raise ValueError(f"[Error] Missing .ENDMACRO directive for macro {macro_name}")
            macros.add_macro(macro_name, macro_lines, params)
            i = macro_lineno
            continue
        elif directive == 3 and child:  # .ENDMACRO or .ENDM
            return processed
        elif directive == 4:  # .INCLUDE or .INC
            processed.append(("", lineno, line, address))
            if len(tok) < 2:
                raise ValueError(f"[Error] Invalid .INCLUDE or .INC directive at line {lineno}")
            include_filename = tok[1].strip('"')
            for path in include_pathes:
                potential_path = Path(path) / include_filename
                if potential_path.exists():
                    include_filename = str(potential_path)
                    break
            try:
                with open(include_filename, 'r', encoding='utf-8') as f:
                    include_lines = f.readlines()
                res = preprocess(include_lines, child, 0, include_pathes, defines, macros)
                processed.extend(res)
            except FileNotFoundError:
                raise FileNotFoundError(f"[Error] Included file not found: {include_filename} (line {lineno})")
            continue
        
        line = line.replace("\t", " ").strip()
        for def_key, def_value in defines.items():
            line = re.sub(rf"\b{re.escape(def_key)}\b", def_value, line)
        # replace defines

        if tok and macros.get_macro(tok[0].upper()) is not None and not child:
            macro_name = tok[0].upper()
            macro_args = tok[1:] if len(tok) > 1 else []
            macro_def = macros.get_macro(macro_name)
            if macro_def is None:
                raise KeyError(f"[Error] Macro {macro_name} not found (line {lineno})")
            macro_lines, params = macro_def
            processed.append(("", lineno, "; " + unprocessed_line + " [MACRO]", address))
            if len(macro_args) != len(params):
                raise ValueError(f"[Error] Macro {macro_name} expects {len(params)} arguments, got {len(macro_args)} (line {lineno})")
            defines.new_scope()
            for p, a in zip(params, macro_args):
                defines.add_def(p, a)
            res = preprocess(macro_lines, True, i, include_pathes, defines, macros)
            processed.extend(res)
            defines.end_scope()
            continue


        processed.append((line, lineno, unprocessed_line, address))
        if tok[0].upper() in INST_TYPES:
            address += 1

    return processed

def adrlist2bitstream(adrlist:dict[int, tuple[int, int]], filler:int=255) -> list[int]:
    t1 = [code for addr, (code, lineno) in adrlist.items()]
    if len(t1) == 0:
        return []
    max_addr = max(adrlist.keys())
    bitstream = [filler] * (max_addr + 1)
    for addr, (code, lineno) in adrlist.items():
        bitstream[addr] = code
    return bitstream

def self_test():
    testfuncs.expect({0:(0x00, 1), 1:(0x1A, 2), 2:(0x2F, 3), 3:(0xA5, 4), 4:(0xE3, 5), 5:(0xE0, 6)}, assemble, [
        ("SM", 1), ("SC r10", 2), ("SU r15", 3), ("LI #5", 4), ("JP NC", 5), ("JP", 6)], LinkState(), "HC4"
    )
    testfuncs.expect({0:(0xE1, 1), 1:(0x00, 2), 2:(0x1C, 3), 3:(0x20, 4), 4:(0xA1, 5), 5:(0xA0, 6), 6:(0xE4, 7), 7:(0xE0, 8)}, assemble, [
        ("NP", 1), ("LOOP: SM", 2), ("SC r12", 3), ("SU r0", 4), ("LI #LOOP:0", 5), ("LI #LOOP:1", 6), ("JP Z", 7), ("JP", 8)], LinkState(), "HC4"
    )
    testfuncs.expect({0:(0x90, 2), 1:(0xA0, 3), 2:(0xE0, 4)}, assemble, tuple((pl[0], pl[1]) for pl in preprocess(
        """; This is a comment line
        LD r0      ; Load to register 0
        LI #0      ; Load immediate 0
        JP         ; Jump
        """.splitlines(), False, 0, [])
    ), LinkState(), "HC4")
    testfuncs.expect({0:(0x41, 3), 1:(0x52, 4), 2:(0x63, 5), 3:(0x74, 6)}, assemble, tuple((pl[0], pl[1]) for pl in preprocess(
        """.DEF REG1 r1
        .DEF REG2 r2
        XR REG1
        OR REG2
        AN r3
        SA r4
        """.splitlines(), False, 0, [])
    ), LinkState(), "HC4")
    processed = tuple((pl[0], pl[1]) for pl in preprocess(
        """.MACRO ADD_REGS REG_A REG_B
        LD REG_A
        LD REG_B
        AD REG_A
        .ENDM
        ADD_REGS r1 r2
        JP
        """.splitlines(), False, 0, [])
    )
    print(processed)
    testfuncs.expect({0:(0x91, 6), 1:(0x92, 6), 2:(0x31, 6), 3:(0xE0, 7)}, assemble, processed, LinkState(), "HC4")
    testfuncs.expect_raises(KeyError, assemble, [("XX r1", 1)], LinkState(), "HC4")
    testfuncs.expect_raises(ValueError, assemble, [("SC r16", 1)], LinkState(), "HC4")
    testfuncs.expect_raises(ValueError, assemble, [("LI #16", 1)], LinkState(), "HC4")

    print("[OK] assembler.py : All tests passed.")

if __name__ == "__main__":
    self_test()
