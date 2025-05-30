from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional

class AgentClass(Enum):
    # Combat Specialists
    GHOST_HUNTER = "Ghost Hunter"
    SPIRIT_WARRIOR = "Spirit Warrior"
    ECTO_SLAYER = "Ecto Slayer"
    PHANTOM_FIGHTER = "Phantom Fighter"
    
    # Technical Specialists
    TECH_EXORCIST = "Tech Exorcist"
    GHOST_ENGINEER = "Ghost Engineer"
    SPIRIT_ANALYST = "Spirit Analyst"
    ECTO_TECHNICIAN = "Ecto Technician"
    
    # Support Specialists
    SPIRIT_HEALER = "Spirit Healer"
    GHOST_MEDIC = "Ghost Medic"
    ECTO_SUPPORT = "Ecto Support"
    PHANTOM_MENTOR = "Phantom Mentor"
    
    # Research Specialists
    GHOST_RESEARCHER = "Ghost Researcher"
    SPIRIT_SCIENTIST = "Spirit Scientist"
    ECTO_ARCHIVIST = "Ecto Archivist"
    PHANTOM_THEORIST = "Phantom Theorist"
    
    # Special Operations
    GHOST_OPERATIVE = "Ghost Operative"
    SPIRIT_INFILTRATOR = "Spirit Infiltrator"
    ECTO_SPECIALIST = "Ecto Specialist"
    PHANTOM_AGENT = "Phantom Agent"

@dataclass
class ClassSpecialization:
    name: AgentClass
    description: str
    stat_bonus: Dict[str, int]  # Bonus stats when assigned this class
    abilities: List[str]        # Special abilities gained
    equipment_bonus: Dict[str, float]  # Bonus effectiveness with certain equipment types
    mission_bonus: Dict[str, float]    # Bonus success chance for certain mission types

# Define specializations for each class
CLASS_SPECIALIZATIONS = {
    AgentClass.GHOST_HUNTER: ClassSpecialization(
        name=AgentClass.GHOST_HUNTER,
        description="Expert in direct ghost combat and elimination",
        stat_bonus={"combat": 3, "will": 2},
        abilities=["ghost_sight", "spirit_weapon"],
        equipment_bonus={"weapon": 1.2},
        mission_bonus={"elimination": 1.2}
    ),
    
    AgentClass.SPIRIT_WARRIOR: ClassSpecialization(
        name=AgentClass.SPIRIT_WARRIOR,
        description="Master of spiritual combat and protection",
        stat_bonus={"combat": 2, "will": 3},
        abilities=["spirit_shield", "holy_aura"],
        equipment_bonus={"armor": 1.2},
        mission_bonus={"protection": 1.2}
    ),
    
    AgentClass.TECH_EXORCIST: ClassSpecialization(
        name=AgentClass.TECH_EXORCIST,
        description="Combines technology with spiritual practices",
        stat_bonus={"tech": 3, "will": 2},
        abilities=["tech_enhance", "spirit_scan"],
        equipment_bonus={"tool": 1.2},
        mission_bonus={"investigation": 1.2}
    ),
    
    AgentClass.SPIRIT_HEALER: ClassSpecialization(
        name=AgentClass.SPIRIT_HEALER,
        description="Specializes in healing spiritual wounds",
        stat_bonus={"will": 3, "tech": 1},
        abilities=["spirit_heal", "purify"],
        equipment_bonus={"trinket": 1.2},
        mission_bonus={"rescue": 1.2}
    ),
    
    AgentClass.GHOST_RESEARCHER: ClassSpecialization(
        name=AgentClass.GHOST_RESEARCHER,
        description="Studies and documents paranormal phenomena",
        stat_bonus={"tech": 3, "will": 1},
        abilities=["analyze", "document"],
        equipment_bonus={"tool": 1.2},
        mission_bonus={"research": 1.2}
    ),
    
    AgentClass.GHOST_OPERATIVE: ClassSpecialization(
        name=AgentClass.GHOST_OPERATIVE,
        description="Covert operations specialist",
        stat_bonus={"combat": 2, "tech": 2, "will": 1},
        abilities=["stealth", "infiltrate"],
        equipment_bonus={"weapon": 1.1, "tool": 1.1},
        mission_bonus={"infiltration": 1.2}
    ),
    
    # Add more specializations for other classes...
}

def get_available_classes(agent_level: int) -> List[AgentClass]:
    """Get list of classes available at the given agent level."""
    if agent_level < 3:
        return []
    return list(AgentClass)

def get_class_specialization(agent_class: AgentClass) -> Optional[ClassSpecialization]:
    """Get the specialization details for a given class."""
    return CLASS_SPECIALIZATIONS.get(agent_class) 