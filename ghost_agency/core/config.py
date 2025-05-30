from dataclasses import dataclass, field
from typing import Dict, List
from enum import Enum

class Status(Enum):
    AVAILABLE = 1
    ON_MISSION = 2
    RESTING = 3
    INJURED = 4
    DECEASED = 5
    IN_PROGRESS = 6
    COMPLETED = 7
    FAILED = 8

@dataclass
class GameConfig:
    # Window settings
    WINDOW_WIDTH: int = 800
    WINDOW_HEIGHT: int = 600
    FPS: int = 60
    
    # Game constants
    STAT_NAMES: List[str] = field(default_factory=lambda: ['will', 'tech', 'combat', 'fear_resist', 'charisma'])
    AGENT_CLASSES: List[str] = field(default_factory=lambda: ['Field', 'Tech', 'Support', 'Combat'])
    MIN_STAT: int = 1
    MAX_STAT: int = 10
    MAX_AGENTS: int = 8
    MAX_AGENTS_PER_MISSION: int = 4
    HIRING_COST: int = 1000
    DAILY_SALARY_PER_AGENT: int = 10
    EVENT_CHANCE: float = 0.1
    
    # Locations and types
    LOCATIONS: List[str] = field(default_factory=lambda: [
        'Coastal Ruins', 'Abandoned Asylum', 'Foggy Woods',
        'Haunted Suburbs', 'Ancient Graveyard'
    ])
    GHOST_TYPES: List[str] = field(default_factory=lambda: ['Poltergeist', 'Specter', 'Wraith', 'Phantom', 'Shade'])
    GHOST_ABILITIES: List[str] = field(default_factory=lambda: [
        'Possession', 'Telekinesis', 'Invisibility',
        'Mind Control', 'Reality Warp', 'Fear Aura'
    ])
    GHOST_WEAKNESSES: List[str] = field(default_factory=lambda: [
        'Salt', 'Iron', 'Holy Water',
        'Light', 'Sound', 'Cold'
    ])
    BEHAVIOR_PATTERNS: List[str] = field(default_factory=lambda: ['Aggressive', 'Shy', 'Curious', 'Malevolent'])
    DIFFICULTY_LEVELS: List[str] = field(default_factory=lambda: ['Easy', 'Medium', 'Hard', 'Nightmare'])
    DIFFICULTY_VALUES: Dict[str, int] = field(default_factory=lambda: {
        'Easy': 1, 'Medium': 2, 'Hard': 3, 'Nightmare': 4
    })
    
    # Starting values
    STARTING_FUNDS: int = 5000
    STARTING_REPUTATION: int = 50
    
    # Mission rewards
    BASE_MISSION_REWARD: int = 1000
    
    # Room settings
    DEFAULT_ROOM_CAPACITY: int = 4
    DEFAULT_MAINTENANCE_COST: int = 50
    MAX_ROOM_LEVEL: int = 3
    MAX_ROOMS: int = 5
    ROOM_CAPACITY_INCREASE: int = 2
    MAINTENANCE_COST_INCREASE: int = 25
    UPGRADE_MAINTENANCE_COST: int = 10
    
    # Research settings
    RESEARCH_PROJECT_COST: int = 100
    RESEARCH_PROJECTS: List[str] = field(default_factory=lambda: [
        'Basic Equipment',
        'Advanced Sensors',
        'Ghost Containment',
        'Psychic Training',
        'Advanced Containment'
    ])

# Create a global instance
config = GameConfig() 