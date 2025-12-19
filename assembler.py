import dictionaly as dict
import re
from typing import Optional, Sequence
from enum import Enum, auto

class TokenType(Enum):
    """Enum for token types."""
    LABEL = auto()
    INSTRUCTION = auto()
    MACRO = auto()
    DIRECTIVE = auto()
    OPERAND = auto()
    COMMENT = auto()
    EOF = auto()

class TokenObject:
    """Represents a token object with a type and value."""
    def __init__(self, toktype:TokenType, value:str, linenum:int, next:Optional['TokenObject']=None):
        self.toktype = toktype
        self.value = value
        self.linenum = linenum
    def __repr__(self):
        return f"Token(type={self.toktype}, value={self.value}, linenum={self.linenum})"

class TokenList(list[TokenObject]):
    """A list to hold token objects."""

    def __init__(self, tokens:Optional[Sequence[TokenObject]]=None):
        super().__init__(tokens if tokens is not None else [])
    def __repr__(self):
        return f"TokenList({super().__repr__()})"
    def consume(self, expected_type:TokenType, value:Optional[str]=None) -> Optional[TokenObject]:
        if self and self[0].toktype == expected_type:
            if value is None or self[0].value == value:
                return self.pop(0)
        return None

def tokenize_lines(lines:str) -> TokenList:
    tokens: TokenList = TokenList()
    line_number = 0
    for line in lines.splitlines():
        line_number += 1
        # Remove comments
        line = re.sub(dict.COMMENT_PATTERN, '', line).strip()
        if not line:
            continue  # Skip empty lines
        
        # Check for label
        label_match = re.match(dict.LABEL_PATTERN, line)
        if label_match:
            label_name = label_match.group(1)
            tokens.append(TokenObject(TokenType.LABEL, label_name, line_number))
            # Remove label from line
            line = re.sub(dict.LABEL_PATTERN, '', line).strip()
            if not line:
                continue  # If only label was present, skip to next line
        
        # Split the rest of the line into parts
        parts = line.split()
        if parts:
            # First part is instruction or directive
            first_part = parts[0]
            if first_part.startswith('.'):
                tokens.append(TokenObject(TokenType.DIRECTIVE, first_part, line_number))
            else:
                tokens.append(TokenObject(TokenType.INSTRUCTION, first_part, line_number))
            
            # The rest are operands
            for operand in parts[1:]:
                tokens.append(TokenObject(TokenType.OPERAND, operand, line_number))
    return tokens

def assemble_tokens(tokens:TokenList, assembly_dict:dict.AssemblyDictionary, constants:list[dict.ConstantObject]) -> list[dict.ListObject]:
    """Two-pass assemble: pass1 collects labels/constants and addresses; pass2 emits machine code."""
    assembly_list:list[dict.ListObject] = []
    # Create working copies to avoid consuming original during pass1
    pass1_tokens: TokenList = TokenList(tokens.copy())
    labels: list[dict.LabelObject] = []
    consts: list[dict.ConstantObject] = list(constants) if constants else []

    address = 0
    # Pass 1: determine addresses and collect labels/constants
    while pass1_tokens:
        tok = pass1_tokens.pop(0)
        if tok.toktype == TokenType.LABEL:
            # Record label at current address
            labels.append(dict.LabelObject(tok.value, tok.linenum, address))
            continue
        if tok.toktype == TokenType.DIRECTIVE:
            dir_name = tok.value.lower()
            # .equ name:value  or  .equ name value
            if dir_name == '.equ' or dir_name == '.def':
                value = pass1_tokens.consume(TokenType.OPERAND)
                if value:
                    try:
                        val_int = int(value.value, 0)
                        consts.append(dict.ConstantObject(name=tok.value[1:], value=val_int, linenum=tok.linenum))
                    except ValueError:
                        assembly_list.append(dict.ListObject(linenum=tok.linenum, source=[tok.value, value.value], error=Exception("Invalid constant value")))
                else:
                    assembly_list.append(dict.ListObject(linenum=tok.linenum, source=[tok.value], error=Exception("Missing constant value")))
                continue
        if tok.toktype == TokenType.INSTRUCTION:
            # Count instruction as one byte
            address += 1


    # Pass 2: generate machine code using labels/constants
    address = 0
    work: TokenList = TokenList(tokens.copy())
    while work:
        token = work.pop(0)
        if token.toktype == TokenType.LABEL:
            # labels already handled; skip in pass2
            continue
        if token.toktype == TokenType.DIRECTIVE:
            dir_name = token.value.lower()
            if dir_name == '.equ' or dir_name == '.def':
                # Already processed in pass1; skip
                # Optionally validate
                if not (len(consts) >= 1):
                    assembly_list.append(dict.ListObject(linenum=token.linenum, source=[token.value], error=None))
                continue
        if token.toktype == TokenType.INSTRUCTION:
            instruction = token.value.upper()
            if instruction in assembly_dict.instructions:
                machine_code = assembly_dict.instructions[instruction]
                if instruction in assembly_dict.HAVE_OPERAND:
                    oprand = work.consume(TokenType.OPERAND)
                    # Resolve operand via labels/constants or immediate
                    if oprand is None:
                        assembly_list.append(dict.ListObject(linenum=token.linenum, source=[instruction], error=Exception("Missing operand")))
                        continue
                    resolved = parse_oprand(oprand.value, labels, consts)
                    if resolved is None:
                        assembly_list.append(dict.ListObject(linenum=token.linenum, source=[instruction, oprand.value], error=Exception(f"Unresolved operand: {oprand.value}")))
                        continue
                    if resolved < 0 or resolved > 15:
                        assembly_list.append(dict.ListObject(linenum=token.linenum, source=[instruction, oprand.value], error=Exception(f"Operand out of range: {resolved}")))
                        continue
                    machine_code |= resolved
                    asm_src = [instruction, oprand.value]
                else:
                    asm_src = [instruction]
                assembly_list.append(dict.ListObject(address=address, machinecode=machine_code, linenum=token.linenum, source=asm_src))
                address += 1
            else:
                assembly_list.append(dict.ListObject(linenum=token.linenum, source=[instruction], error=Exception(f"Unknown instruction: {instruction}")))
    return assembly_list

def parse_oprand(operand:str, labels:list[dict.LabelObject], constants:list[dict.ConstantObject]) -> Optional[int]:
    """Resolve operand: supports labels, constants, label slicing NAME:n, registers r0..r15, and numeric literals (decimal/0x/0b). Returns 4-bit value (0..15) or None."""
    # JP condition aliases
    cond_map = {
        'C': 0x2,
        'NC': 0x3,
        'Z': 0x4,
        'NZ': 0x5,
        '': 0x0,
    }
    up = operand.upper()
    if up in cond_map:
        return cond_map[up]

    # Register r0..r15
    if re.match(r"^r([0-9]|1[0-5])$", up):
        try:
            return int(up[1:])
        except ValueError:
            return None

    # Constant by name
    for constant in constants:
        if constant.name == operand:
            val = constant.value & 0xF
            return val

    # Label direct or slice NAME:idx (idx selects nibble index)
    name = operand
    idx: Optional[int] = None
    if ':' in operand:
        parts = operand.split(':', 1)
        name = parts[0]
        try:
            idx = int(parts[1], 0)
        except ValueError:
            idx = None
    for label in labels:
        if label.name == name:
            addr = label.address
            if idx is None:
                # Direct use (take low nibble)
                return addr & 0xF
            # Slice rule: nibble index -> bits [4*idx+3 : 4*idx]
            shift = 4*idx
            return (addr >> shift) & 0xF

    # Numeric literals: support 0x.., 0b.., decimal
    try:
        val = int(operand, 0)
        if 0 <= val <= 15:
            return val
        else:
            return val & 0xF
    except ValueError:
        return None


if __name__ == "__main__":
    # Example usage
    lines = "LI 1\nLI 2\nAD 1\nJP NZ\nLI LABEL1:2 ; Inline-comment\nLABEL1:\n SM\n; Full line comment\n.MACRO MYMACRO PRM1 PRM2\n.ENDM"
    
    result = tokenize_lines(lines)
    print(result)  # Should print the linked list of tokens
    assembly_dict = dict.AssemblyDictionary(architecture="HC4")
    assembled = assemble_tokens(result, assembly_dict, [])
    for item in assembled:
        print(item)  # Should print the assembled instructions with machine codes
