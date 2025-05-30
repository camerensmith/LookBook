from dataclasses import dataclass, field
from typing import Dict, List
import random
from ..core.config import config

@dataclass
class Ghost:
    name: str
    ghost_type: str
    difficulty: int
    abilities: List[str] = field(default_factory=list)
    weaknesses: List[str] = field(default_factory=list)
    location: str = ""
    
    @classmethod
    def random(cls, difficulty: int) -> 'Ghost':
        ghost_type = random.choice(config.GHOST_TYPES)
        name = f"{ghost_type} {random.randint(1, 999)}"
        
        # Generate abilities based on difficulty
        num_abilities = min(3, difficulty // 2)
        abilities = random.sample(config.GHOST_ABILITIES, num_abilities)
        
        # Generate weaknesses based on difficulty
        num_weaknesses = max(1, 3 - (difficulty // 2))
        weaknesses = random.sample(config.GHOST_WEAKNESSES, num_weaknesses)
        
        return cls(
            name=name,
            ghost_type=ghost_type,
            difficulty=difficulty,
            abilities=abilities,
            weaknesses=weaknesses
        )
    
    def get_difficulty_multiplier(self) -> float:
        return 1.0 + (self.difficulty * 0.1)
    
    def get_reward(self) -> int:
        base_reward = config.BASE_MISSION_REWARD
        return int(base_reward * self.get_difficulty_multiplier())
    
    def is_weak_to(self, weakness: str) -> bool:
        return weakness in self.weaknesses 