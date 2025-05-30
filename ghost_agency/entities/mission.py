from dataclasses import dataclass, field
from typing import Dict, List
import random
from ..core.config import config, Status
from .ghost import Ghost

@dataclass
class Mission:
    name: str
    description: str
    location: str
    difficulty: int
    ghost: Ghost
    reward: int
    status: Status = Status.AVAILABLE
    assigned_agents: List[str] = field(default_factory=list)
    
    @classmethod
    def generate(cls, location: str, difficulty: int) -> 'Mission':
        ghost = Ghost.random(difficulty)
        name = f"Investigate {ghost.ghost_type} Activity"
        description = f"Reports of {ghost.ghost_type} activity in {location}. " \
                     f"Difficulty level: {difficulty}"
        reward = ghost.get_reward()
        
        return cls(
            name=name,
            description=description,
            location=location,
            difficulty=difficulty,
            ghost=ghost,
            reward=reward
        )
    
    def assign_agent(self, agent_name: str) -> bool:
        if len(self.assigned_agents) >= config.MAX_AGENTS_PER_MISSION:
            return False
        self.assigned_agents.append(agent_name)
        return True
    
    def remove_agent(self, agent_name: str) -> bool:
        if agent_name in self.assigned_agents:
            self.assigned_agents.remove(agent_name)
            return True
        return False
    
    def is_available(self) -> bool:
        return self.status == Status.AVAILABLE
    
    def start(self):
        self.status = Status.IN_PROGRESS
    
    def complete(self, success: bool):
        self.status = Status.COMPLETED if success else Status.FAILED 