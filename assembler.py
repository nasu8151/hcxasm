import dictionaly as dict
import re
from typing import Optional
from enum import Enum, auto

class TokenType(Enum):
    """Enum for token types."""
    LABEL = auto()
    INSTRUCTION = auto()
    MACRO = auto()
    DIRECTIVE = auto()
    OPERAND = auto()
    COMMENT = auto()

class TokenObject:
    """Represents a token object with a type and value."""
    def __init__(self, toktype:TokenType, value:str, linenum:int, next:Optional['TokenObject']=None):
        self.toktype = toktype
        self.value = value
        self.linenum = linenum
        self.next = next
    def __repr__(self):
        return f"Token(type={self.toktype}, value={self.value}, linenum={self.linenum})"
    
class LinkedList:
    """A linked list to hold tokens."""
    def __init__(self):
        self.head: Optional[TokenObject] = None
        self.tail: Optional[TokenObject] = None

    def append(self, toktype:TokenType, value:str, linenum:int):
        """Append a new token to the linked list."""
        new_token = TokenObject(toktype, value, linenum)
        if self.head is None:
            self.head = new_token
            self.tail = new_token
        else:
            assert self.tail is not None  # for type checker
            self.tail.next = new_token
            self.tail = new_token
    
    def consume(self, toktype:TokenType) -> Optional[str]:
        """Consume a token of the given type and return its value, or None if the current token does not match."""
        if self.current is None:
            return None
        if self.current.toktype == toktype:
            value = self.current.value
            self.current = self.current.next
            return value
        return None
    
    def peek_head(self) -> Optional[TokenObject]:
        """Return the head token without consuming it."""
        return self.head
    
    def getline(self, linenum:int) -> list[str]:
        """Return the value of the token at the given line number."""
        current = self.head
        result = []
        while current is not None:
            if current.linenum == linenum:
                result.append(current.value)
            current = current.next
        return result
    
    def parse_label(self, labelobj:dict.LabelObject):
        current = self.head
        while current is not None:
            if current.toktype == TokenType.OPERAND:
                val = re.split(r'[#: ]*', current.value)
                if len(val) == 2:
                    label_name = val[0]
                    slice_notation = int(val[1])  # e.g., ':0' or ':2'
                    if label_name == labelobj.name:
                        current.value = str(
                            labelobj.address >> (slice_notation * 4) & 0x0F)
            current = current.next




    def assembletokens(self, architecture:str) -> list[dict.ListObject]:
        """Assemble the tokens into a list of ListObjects."""
        assembled_lines:list[dict.ListObject] = []
        current = self.head
        address_counter = 0
        while current is not None:
            line_number = current.linenum
            if current.toktype == TokenType.COMMENT:
                # Skip comments
                current = current.next
                continue
            elif current.toktype == TokenType.LABEL:
                label_name = current.value[:-1]  # Remove the colon
                label_obj = dict.LabelObject(name=label_name, line=line_number, address=address_counter)
                self.parse_label(label_obj) # Resolve label references in operands
                assembled_lines.append(dict.ListObject(
                    label=label_obj,
                    address=address_counter,
                    machinecode=None,
                    linenum=line_number,
                    source=self.getline(line_number),
                    error=None
                ))
                current = current.next
            elif current.toktype == TokenType.INSTRUCTION:
                instruction = current.value
                opcode = dict.AssemblyDictionary(architecture).get_instruction(instruction.upper())
                


    def __repr__(self):
        tokens = []
        current = self.head
        while current is not None:
            tokens.append(repr(current))
            current = current.next
        return " -> ".join(tokens)

    def __iter__(self):
        current = self.head
        while current is not None:
            yield current
            current = current.next

def tokenize_lines(lines:list[str], architecture:str) -> LinkedList:
    head = LinkedList()
    for i in range(len(lines)):
        line_num = i + 1
        elements = lines[i].strip().split()
        for j in range(len(elements)):
            elem = elements[j]
            if re.match(dict.LABEL_PATTERN, elem):
                head.append(TokenType.LABEL, elem, line_num)
            elif elem.upper() in dict.AssemblyDictionary(architecture).instructions:
                head.append(TokenType.INSTRUCTION, elem, line_num)
            elif elem.startswith(';') or elem.startswith('//'):
                head.append(TokenType.COMMENT, " ".join(elements[j:]), line_num)
                break  # Rest of the line is comment
            elif elem.upper() == '.MACRO':
                head.append(TokenType.MACRO, elem, line_num)
            elif elem.startswith('.'):
                head.append(TokenType.DIRECTIVE, elem, line_num)
            else:
                head.append(TokenType.OPERAND, elem, line_num)
    return head

def assembleline(line:str, line_number:int, architecture:str = "HC4") -> dict.ListObject:
    # Remove comments first
    line = re.sub(dict.COMMENT_PATTERN, '', line).strip()
    
    # Check for label
    label_obj = None
    label_match = re.match(dict.LABEL_PATTERN, line)
    if label_match:
        label_name = label_match.group(1)
        label_obj = dict.LabelObject(name=label_name, line=line_number, address=0)  # Address will be set later
        # Remove label from line
        line = re.sub(dict.LABEL_PATTERN, '', line).strip()
    
    # Split the line into parts
    parts = line.split()
    
    # If the line is empty after removing comments and labels, return an empty ListObject
    if not parts:       
        return dict.ListObject(
            label=label_obj,
            address=None,
            machinecode=None,
            linenum=line_number,
            source=[],
            error=None
        )
    
    asm = dict.AssemblyDictionary(architecture)

    # Check for label reference in immediate values
    processed_parts:list[str] = []
    for part in parts:
        if part.startswith('#') and ':' in part:
            # This is a label reference with slice notation
            processed_parts.append(part)  # Keep as is for now, will be resolved in linking phase
        else:
            processed_parts.append(part)
    
    opc = asm.get_instruction(processed_parts[0].upper())  # Get the first part as the opcode
    if opc is None:
        return dict.ListObject(
            label=label_obj,
            address=None,
            machinecode=None,
            source=processed_parts,
            error=ValueError(f"Unknown instruction: {processed_parts[0]}")
        )
    
    # Check if the instruction has the correct type of arguments
    opr = parse_oprand(processed_parts[0], processed_parts[1:])  # Parse the rest of the parts as operands
    if isinstance(opr, ValueError):
        return dict.ListObject(
            label=label_obj,
            address=None,
            machinecode=None,
            linenum=line_number,
            source=processed_parts,
            error=opr
        )

    return dict.ListObject(
        label=label_obj,
        address=None,  # Address will be set during linking
        machinecode=opc | opr,
        linenum=line_number,
        source=processed_parts
    )


def parse_oprand(opcode:str, parts:list[str]) -> int|ValueError:
    """Check if the arguments of the instruction match the expected types."""
    ARG_TYPE = {
        "SM": dict.InstructionType.STACK_INDIRECT, "SC": dict.InstructionType.REGISTER, "SU": dict.InstructionType.REGISTER, "AD": dict.InstructionType.REGISTER, "XR": dict.InstructionType.REGISTER, "OR": dict.InstructionType.REGISTER, "AN": dict.InstructionType.REGISTER, "SA": dict.InstructionType.REGISTER,
        "LM": dict.InstructionType.STACK_INDIRECT, "LD": dict.InstructionType.REGISTER, "LI": dict.InstructionType.IMMEDIATE, "LS": dict.InstructionType.IMMEDIATE, "JP": dict.InstructionType.JUMP, "NP": dict.InstructionType.INHERENT
    }

    JUMP_CONDITION = {
        "" : 0b0000, "N": 0b0001, "C": 0b0010, "NC": 0b0011, "Z": 0b0100, "NZ": 0b0101, "T": 0b0110, "NT": 0b0111,
    }

    REGISTER_PATTERN = r"^[rR](1[0-5]|[0-9])$"  # R0 to R15 (大文字小文字両方)
    IMMEDIATE_PATTERN = r"^#([0-9]+|0[xX][0-9A-Fa-f]+|0[bB][01]+)$"

    # ARG_TYPE にない命令はopc=Noneとなりすでにエラーを返しているのでここではチェックしない

    expected_type = ARG_TYPE[opcode.upper()]

    if expected_type == dict.InstructionType.JUMP:
        condition = parts[0].upper() if len(parts) > 0 else ""
        if condition not in JUMP_CONDITION:
            return ValueError(f"Invalid jump condition: {condition}")
        return JUMP_CONDITION[condition]
    elif expected_type == dict.InstructionType.STACK_INDIRECT:
        if len(parts) > 1:
            return ValueError("Too many arguments for stack indirect instruction")
        else:
            return 0b0000 # Stack indirect has no operand
    elif expected_type == dict.InstructionType.REGISTER:
        if len(parts) != 1:
            return ValueError("Expected one argument for register instruction")
        reg = parts[0].upper()
        if not re.match(REGISTER_PATTERN, reg):
            return ValueError(f"Invalid register format: {reg}")
        try:
            reg_num = int(parts[0][1:])  # Remove the 'R'/'r' prefix and parse as decimal
            if reg_num < 0 or reg_num > 15:
                return ValueError(f"Register value out of range: {reg_num}")
            return reg_num
        except (ValueError, IndexError):
            return ValueError(f"Invalid register value: {parts[0]}")
    elif expected_type == dict.InstructionType.IMMEDIATE:
        if len(parts) != 1:
            return ValueError("Expected one argument for immediate instruction")
        
        # Check for label reference
        if parts[0].startswith('#') and ':' in parts[0]:
            # This is a label reference, return placeholder for now
            return 0  # Will be resolved during linking
        
        if not re.match(IMMEDIATE_PATTERN, parts[0]):
            return ValueError(f"Invalid immediate value: {parts[0]}")
        else:
            try:
                imm_val = int(parts[0][1:], 0)  # Remove the '#' prefix
                if imm_val < 0 or imm_val > 15:
                    return ValueError(f"Immediate value out of range: {imm_val}")
                return imm_val
            except ValueError:
                return ValueError(f"Invalid immediate value: {parts[0]}")
    elif expected_type == dict.InstructionType.INHERENT:
        if len(parts) > 0:
            return ValueError("Inherent instruction should not have arguments")
        return 0b0000
    return ValueError(f"Unknown instruction type: {expected_type}")

if __name__ == "__main__":
    # Example usage
    line = "AD R1 ; A + B -> R1"
    line_number = 1
    architecture = "HC4"
    
    result = tokenize_lines([line], architecture)
    print(result)  # Should print the linked list of tokens
