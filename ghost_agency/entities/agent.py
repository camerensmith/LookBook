from dataclasses import dataclass, field
from typing import Dict, List, Optional
import random
from ..core.config import config, Status
from .equipment import Equipment, EquipmentType
from .agent_class import AgentClass, get_class_specialization

@dataclass
class Agent:
    name: str
    level: int = 1
    experience: int = 0
    money: int = 0
    status: Status = Status.AVAILABLE
    stats: Dict[str, int] = field(default_factory=dict)
    inventory: List[Equipment] = field(default_factory=list)
    equipped: Dict[EquipmentType, Optional[Equipment]] = field(default_factory=dict)
    agent_class: Optional[AgentClass] = None
    stress: int = 0
    injury_days_left: Optional[int] = None
    
    def __post_init__(self):
        # Initialize base stats
        self.stats = {stat: 1 for stat in config.STAT_NAMES}
        # Initialize equipped slots
        self.equipped = {type_: None for type_ in EquipmentType}
    
    def add_experience(self, amount: int) -> bool:
        """Add experience and level up if threshold reached."""
        self.experience += amount
        if self.experience >= self.get_level_threshold():
            self.level_up()
            return True
        return False
    
    def get_level_threshold(self) -> int:
        """Calculate experience needed for next level."""
        return self.level * 100
    
    def level_up(self):
        """Increase level and improve stats."""
        self.level += 1
        for stat in self.stats:
            self.stats[stat] += 1
    
    def assign_class(self, agent_class: AgentClass) -> bool:
        """Assign a class to the agent if they meet the level requirement."""
        if self.level < 3:
            return False
        
        specialization = get_class_specialization(agent_class)
        if not specialization:
            return False
        
        self.agent_class = agent_class
        # Apply class stat bonuses
        for stat, bonus in specialization.stat_bonus.items():
            self.stats[stat] = self.stats.get(stat, 0) + bonus
        
        return True
    
    def get_class_bonus(self, equipment_type: str) -> float:
        """Get equipment effectiveness bonus from class."""
        if not self.agent_class:
            return 1.0
        
        specialization = get_class_specialization(self.agent_class)
        if not specialization:
            return 1.0
        
        return specialization.equipment_bonus.get(equipment_type, 1.0)
    
    def get_mission_bonus(self, mission_type: str) -> float:
        """Get mission success bonus from class."""
        if not self.agent_class:
            return 1.0
        
        specialization = get_class_specialization(self.agent_class)
        if not specialization:
            return 1.0
        
        return specialization.mission_bonus.get(mission_type, 1.0)
    
    def has_class_ability(self, ability: str) -> bool:
        """Check if agent has a class ability."""
        if not self.agent_class:
            return False
        
        specialization = get_class_specialization(self.agent_class)
        if not specialization:
            return False
        
        return ability in specialization.abilities
    
    def add_money(self, amount: int):
        """Add money to agent's balance."""
        self.money += amount
    
    def spend_money(self, amount: int) -> bool:
        """Attempt to spend money. Returns True if successful."""
        if self.money >= amount:
            self.money -= amount
            return True
        return False
    
    def add_to_inventory(self, equipment: Equipment):
        """Add equipment to inventory."""
        self.inventory.append(equipment)
    
    def remove_from_inventory(self, equipment: Equipment):
        """Remove equipment from inventory."""
        if equipment in self.inventory:
            self.inventory.remove(equipment)
    
    def equip_item(self, equipment: Equipment) -> bool:
        """Attempt to equip an item. Returns True if successful."""
        if equipment in self.inventory:
            # Unequip current item of same type if any
            current = self.equipped[equipment.type]
            if current:
                self.inventory.append(current)
            
            self.equipped[equipment.type] = equipment
            self.inventory.remove(equipment)
            return True
        return False
    
    def unequip_item(self, equipment_type: EquipmentType) -> Optional[Equipment]:
        """Unequip an item and return it to inventory."""
        item = self.equipped[equipment_type]
        if item:
            self.inventory.append(item)
            self.equipped[equipment_type] = None
        return item
    
    def get_equipped_stats(self) -> Dict[str, int]:
        """Calculate total stats including equipped items."""
        total_stats = self.stats.copy()
        for equipment in self.equipped.values():
            if equipment:
                total_stats = equipment.apply_stats(total_stats)
        return total_stats
    
    def has_ability(self, ability: str) -> bool:
        """Check if agent has an ability from equipped items."""
        return any(
            equipment.has_ability(ability)
            for equipment in self.equipped.values()
            if equipment
        )
    
    def apply_stress(self, amount: int):
        """Apply stress to the agent and handle stress breakdown."""
        self.stress = min(100, self.stress + amount)
        if self.stress >= 100:
            self._handle_stress_breakdown()
    
    def _handle_stress_breakdown(self):
        """Handle what happens when an agent reaches maximum stress."""
        if random.random() < 0.5:
            self.status = Status.DECEASED
        else:
            self.status = Status.RESTING
            self.stress = 80
    
    def gain_experience(self, amount: int):
        self.experience += amount
        if self.experience >= self.get_next_level_xp():
            self.level_up()
    
    def get_total_stats(self) -> int:
        """Get total stats including equipment bonuses."""
        total = sum(self.stats.values())
        for equipment in self.equipped.values():
            if equipment:
                total += sum(equipment.stats.values())
        return total
    
    def get_next_level_xp(self) -> int:
        return self.level * 100
    
    def is_available(self) -> bool:
        """Check if agent is available for missions."""
        return self.status == Status.AVAILABLE
    
    def recover_stress(self, amount: int):
        """Recover from stress while resting."""
        self.stress = max(0, self.stress - amount)
        if self.stress == 0 and self.status == Status.RESTING:
            self.status = Status.AVAILABLE
    
    def heal_injury(self):
        """Heal from injury over time."""
        if self.injury_days_left is not None:
            self.injury_days_left -= 1
            if self.injury_days_left <= 0:
                self.injury_days_left = None
                self.status = Status.AVAILABLE
    
    def use_equipment_ability(self, item_type: EquipmentType, ability: str) -> bool:
        """Use an ability from equipped item."""
        if item_type in self.equipped and self.equipped[item_type]:
            return self.equipped[item_type].use_ability(ability)
        return False
    
    def repair_equipment(self, item_type: EquipmentType, amount: int) -> int:
        """Repair equipped item and return cost."""
        if item_type in self.equipped and self.equipped[item_type]:
            return self.equipped[item_type].repair(amount)
        return 0
    
    @classmethod
    def random(cls, name: str) -> 'Agent':
        """Create a random agent with randomized stats."""
        stats = {
            stat: random.randint(config.MIN_STAT, config.MAX_STAT)
            for stat in config.STAT_NAMES
        }
        return cls(
            name=name,
            stats=stats,
            level=1,
            experience=0,
            money=0,
            status=Status.AVAILABLE
        ) 