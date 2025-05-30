from enum import Enum, auto

class GameState(Enum):
    MAIN_MENU = auto()
    AGENCY = auto()
    HQ = auto()
    ROSTER = auto()
    RESEARCH = auto()
    LOG = auto()

class Status(Enum):
    AVAILABLE = auto()
    ON_MISSION = auto()
    RESTING = auto()
    INJURED = auto()
    DECEASED = auto() 