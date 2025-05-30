from dataclasses import dataclass, field
from typing import Dict, List
from .config import config

@dataclass
class Room:
    name: str
    room_type: str
    level: int = 1
    capacity: int = config.DEFAULT_ROOM_CAPACITY
    maintenance_cost: int = config.DEFAULT_MAINTENANCE_COST
    upgrades: List[str] = field(default_factory=list)
    
    def upgrade(self) -> bool:
        if self.level >= config.MAX_ROOM_LEVEL:
            return False
        
        self.level += 1
        self.capacity += config.ROOM_CAPACITY_INCREASE
        self.maintenance_cost += config.MAINTENANCE_COST_INCREASE
        return True
    
    def add_upgrade(self, upgrade: str) -> bool:
        if upgrade in self.upgrades:
            return False
        self.upgrades.append(upgrade)
        return True
    
    def remove_upgrade(self, upgrade: str) -> bool:
        if upgrade in self.upgrades:
            self.upgrades.remove(upgrade)
            return True
        return False
    
    def get_total_maintenance_cost(self) -> int:
        base_cost = self.maintenance_cost
        upgrade_cost = len(self.upgrades) * config.UPGRADE_MAINTENANCE_COST
        return base_cost + upgrade_cost
    
    def construct(self) -> bool:
        """Advances construction by one day. Returns True if construction completed."""
        if not self.built:
            self.progress += 1
            if self.progress >= self.build_time:
                self.built = True
                return True
        return False
    
    def get_bonus(self, stat: str) -> float:
        """Returns the bonus multiplier for a given stat."""
        return self.bonuses.get(stat, 1.0) if self.built else 1.0
    
    @classmethod
    def create_training_room(cls) -> 'Room':
        return cls(
            name="Training Room",
            room_type="Training",
            bonuses={
                "will": 1.2,
                "combat": 1.2,
                "tech": 1.2
            }
        )
    
    @classmethod
    def create_lab(cls) -> 'Room':
        return cls(
            name="Research Lab",
            room_type="Research",
            bonuses={
                "tech": 1.3,
                "fear_resist": 1.2
            }
        )
    
    @classmethod
    def create_med_bay(cls) -> 'Room':
        return cls(
            name="Medical Bay",
            room_type="Medical",
            bonuses={
                "stress_recovery": 1.5,
                "injury_recovery": 1.5
            }
        ) 