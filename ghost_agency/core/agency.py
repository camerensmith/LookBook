from dataclasses import dataclass, field
from typing import Dict, List
import random
from ..entities.agent import Agent
from .config import config, Status
from .research import Research

@dataclass
class Agency:
    funds: int = config.STARTING_FUNDS
    reputation: int = config.STARTING_REPUTATION
    roster: List[Agent] = field(default_factory=list)
    mission_log: List[str] = field(default_factory=list)
    utilities: Dict[str, int] = field(default_factory=dict)
    rooms: List['Room'] = field(default_factory=list)
    research: Research = field(default_factory=Research)
    
    def __post_init__(self):
        if not self.utilities:
            self.utilities = {
                "Electricity": 50,
                "Water": 30,
                "Internet": 40,
                "Maintenance": 20
            }
    
    def hire_random_agent(self) -> bool:
        """Hire a random agent if there's space in the roster."""
        if len(self.roster) >= config.MAX_AGENTS:
            return False
        
        name = f"Agent {len(self.roster) + 1}"
        agent = Agent.random(name)
        self.roster.append(agent)
        self.mission_log.append(f"Hired {name} (Level {agent.level})")
        return True
    
    def pay_salaries(self):
        total = len(self.roster) * config.DAILY_SALARY_PER_AGENT
        self.funds -= total
        self.mission_log.append(f"Paid salaries: ${total}")
    
    def add_funds(self, amount: int):
        self.funds += amount
        self.mission_log.append(f"Added funds: ${amount}")
    
    def update_reputation(self, amount: int):
        self.reputation = max(0, min(100, self.reputation + amount))
        self.mission_log.append(f"Reputation changed: {amount:+d}")
    
    def get_available_agents(self) -> List[Agent]:
        return [agent for agent in self.roster if agent.status == Status.AVAILABLE] 