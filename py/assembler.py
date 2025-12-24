import py.dictionaly as dict
import re

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
        "SM": dict.inst_type.STACK_INDIRECT, "SC": dict.inst_type.REGISTER, "SU": dict.inst_type.REGISTER, "AD": dict.inst_type.REGISTER, "XR": dict.inst_type.REGISTER, "OR": dict.inst_type.REGISTER, "AN": dict.inst_type.REGISTER, "SA": dict.inst_type.REGISTER,
        "LM": dict.inst_type.STACK_INDIRECT, "LD": dict.inst_type.REGISTER, "LI": dict.inst_type.IMMEDIATE, "LS": dict.inst_type.IMMEDIATE, "JP": dict.inst_type.JUMP, "NP": dict.inst_type.INHERENT
    }

    JUMP_CONDITION = {
        "" : 0b0000, "N": 0b0001, "C": 0b0010, "NC": 0b0011, "Z": 0b0100, "NZ": 0b0101, "T": 0b0110, "NT": 0b0111,
    }

    REGISTER_PATTERN = r"^[rR](1[0-5]|[0-9])$"  # R0 to R15 (大文字小文字両方)
    IMMEDIATE_PATTERN = r"^#([0-9]+|0[xX][0-9A-Fa-f]+|0[bB][01]+)$"

    # ARG_TYPE にない命令はopc=Noneとなりすでにエラーを返しているのでここではチェックしない

    expected_type = ARG_TYPE[opcode.upper()]

    if expected_type == dict.inst_type.JUMP:
        condition = parts[0].upper() if len(parts) > 0 else ""
        if condition not in JUMP_CONDITION:
            return ValueError(f"Invalid jump condition: {condition}")
        return JUMP_CONDITION[condition]
    elif expected_type == dict.inst_type.STACK_INDIRECT:
        if len(parts) > 1:
            return ValueError("Too many arguments for stack indirect instruction")
        else:
            return 0b0000 # Stack indirect has no operand
    elif expected_type == dict.inst_type.REGISTER:
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
    elif expected_type == dict.inst_type.IMMEDIATE:
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
    elif expected_type == dict.inst_type.INHERENT:
        if len(parts) > 0:
            return ValueError("Inherent instruction should not have arguments")
        return 0b0000
    return ValueError(f"Unknown instruction type: {expected_type}")

if __name__ == "__main__":
    # Example usage
    line = "AD R1"
    line_number = 1
    architecture = "HC4"
    
    result = assembleline(line, line_number, architecture)
    print(result)  # Should print the ListObject with the assembled instruction
