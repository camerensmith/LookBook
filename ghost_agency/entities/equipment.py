from dataclasses import dataclass
from enum import Enum
from typing import Dict, List
from ..core.config import config

class EquipmentType(Enum):
    WEAPON = "weapon"
    ARMOR = "armor"
    TOOL = "tool"
    TRINKET = "trinket"

@dataclass
class Equipment:
    name: str
    type: EquipmentType
    stats: Dict[str, int]  # e.g., {"attack": 5, "defense": 3}
    abilities: List[str]   # e.g., ["ghost_sight", "spirit_ward"]
    cost: int
    level_requirement: int
    
    def apply_stats(self, agent_stats: Dict[str, int]) -> Dict[str, int]:
        """Apply equipment stats to agent stats."""
        return {stat: agent_stats.get(stat, 0) + value 
                for stat, value in self.stats.items()}
    
    def has_ability(self, ability: str) -> bool:
        """Check if equipment has a specific ability."""
        return ability in self.abilities
    
    def get_description(self) -> str:
        """Get a formatted description of the equipment."""
        desc = [
            f"{self.name} (Level {self.level_requirement})",
            f"Type: {self.type.value.title()}",
            f"Stats: {', '.join(f'{k}: +{v}' for k, v in self.stats.items())}",
            f"Abilities: {', '.join(self.abilities)}"
        ]
        return "\n".join(desc)
    
    def use_ability(self, ability: str) -> bool:
        """Use an equipment ability if available."""
        if ability in self.abilities and self.durability > 0:
            self.durability -= 10
            return True
        return False
    
    def repair(self, amount: int) -> int:
        """Repair equipment and return cost."""
        if self.durability < self.max_durability:
            repair_amount = min(amount, self.max_durability - self.durability)
            self.durability += repair_amount
            return repair_amount * 5  # Cost per durability point
        return 0
    
    @classmethod
    def create_ghost_gun(cls) -> 'Equipment':
        """Create a basic ghost gun."""
        return cls(
            name="Ghost Gun",
            type=EquipmentType.WEAPON,
            stats={"combat": 2, "tech": 1},
            abilities=["shoot", "stun"],
            cost=1000,
            level_requirement=1
        )
    
    @classmethod
    def create_ecto_armor(cls) -> 'Equipment':
        """Create basic ecto armor."""
        return cls(
            name="Ecto Armor",
            type=EquipmentType.ARMOR,
            stats={"will": 2, "fear_resist": 1},
            abilities=["shield"],
            cost=1500,
            level_requirement=2
        )
    
    @classmethod
    def create_ghost_scanner(cls) -> 'Equipment':
        """Create a ghost scanning device."""
        return cls(
            name="Ghost Scanner",
            type=EquipmentType.TOOL,
            stats={"tech": 2},
            abilities=["scan", "analyze"],
            cost=800,
            level_requirement=1
        ) 