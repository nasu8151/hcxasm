from typing import Optional
from enum import Enum, auto

COMMENT_PATTERN = r"\s*(;|//).*$"
LABEL_PATTERN = r"^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:.*$"

class LabelObject:
    """Represents a label object with a name, line and address."""
    def __init__(self, name:str, line:int, address:int):
        self.name = name
        self.line = line
        self.address = address
    def __repr__(self):
        return f"Label(name={self.name}, line={self.line}, address={self.address})"
    
class ConstantObject():
    """Represents a constant object with a name, value, and line number."""
    def __init__(self, name:str, value:int, linenum:int):
        self.name = name
        self.value = value
        self.linenum = linenum

    def __repr__(self):
        return f"Constant(name={self.name}, value={self.value}, linenum={self.linenum})"

class ListObject:
    """Represents a list object with a label and a list of instructions."""
    def __init__(self, label:Optional[LabelObject]=None, address:Optional[int]=None, machinecode:Optional[int]=None, linenum:int=0, source:list[str]=[], error:Optional[Exception]=None):
        self.label = label
        self.address = address
        self.machinecode = machinecode
        self.linenum = linenum
        self.source = source
        self.error = error

    def __repr__(self):
        return f"Instruction(label={self.label}, code={self.machinecode:02x}, linenum={self.linenum}, source={self.source}, error={self.error})"


class AssemblyDictionary:

    """A dictionary to hold assembly instructions and their corresponding machine codes."""
    HAVE_OPERAND = ["SC", "SU", "AD", "XR", "OR", "AN", "LD", "LI", "JP"]

    def __init__(self, architecture:str = "HC4"):
        self.architecture = architecture
        # Define argument types for instructions
        # 0 - Jump, 1 - Stack Direct, 2 - Register, 3 - Immediate, 4 - Inherent

        # Define machine codes for HC4 and HC4E architectures
        DICTHC4 =  {"SM" : 0b0000_0000, "SC" : 0b0001_0000, "SU" : 0b0010_0000, "AD" : 0b0011_0000, 
                    "XR" : 0b0100_0000, "OR" : 0b0101_0000, "AN" : 0b0110_0000, "SA" : 0b0111_0000,
                    "LM" : 0b1000_0000, "LD" : 0b1001_0000, "LI" : 0b1010_0000, 
                                                            "JP" : 0b1110_0000, 
                                                            "NP" : 0b1110_0001,                     }


        DICTHC4E = {                                                            "AD" : 0b0011_0000, 
                    "XR" : 0b0100_0000,                                         "SA" : 0b0111_0000,
                                        "LD" : 0b1001_0000, "LI" : 0b1010_0000, 
                                                            "JP" : 0b1110_0000, 
                                                            "NP" : 0b1110_0001,                     }

        if architecture == "HC4":
            self.instructions = DICTHC4.copy()
        elif architecture == "HC4E":
            self.instructions = DICTHC4E.copy()
        else:
            raise ValueError(f"Unsupported architecture: {architecture}")
    
    def get_instruction(self, name:str) -> Optional[int]:
        """Retrieves the machine code for a given instruction name."""
        return self.instructions.get(name, None)
    
    def has_operand(self, name:str) -> bool:
        """Checks if the instruction requires an operand."""
        return name in self.HAVE_OPERAND

    def __repr__(self):
        return f"AssemblyDictionary(architecture={self.architecture}, instructions={self.instructions})"
    
    def __str__(self) -> str:
        """Returns a string representation of the assembly dictionary."""
        return f"Assembly Dictionary for {self.architecture}:\n" + "\n".join(f"{k}: {v:08b}" for k, v in self.instructions.items())
    

class InstructionType(Enum):
    """Enum for instruction types."""
    JUMP = auto()
    STACK_INDIRECT = auto()
    REGISTER = auto()
    IMMEDIATE = auto()
    INHERENT = auto()

