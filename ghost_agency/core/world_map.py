from dataclasses import dataclass, field
from typing import Dict, List, Tuple
import random
import pygame
from .config import config
from ..entities.mission import Mission

@dataclass
class Region:
    name: str
    map_pos: Tuple[int, int] = field(default_factory=lambda: (
        random.randint(150, 650),
        random.randint(150, 450)
    ))
    missions: List[Mission] = field(default_factory=list)
    modifiers: Dict[str, float] = field(default_factory=dict)
    
    def __post_init__(self):
        if not self.modifiers:
            self.modifiers = {
                'fear_mult': random.uniform(1.0, 1.5),
                'visibility_penalty': random.uniform(0, 0.2),
                'combat_penalty': random.uniform(0, 0.2),
                'willpower_bonus': random.randint(0, 2)
            }
    
    def generate_mission(self, difficulty: int):
        """Generate a new mission for this region."""
        self.missions = [Mission.generate(self.name, difficulty)]
    
    def get_modifier(self, key: str) -> float:
        """Get a specific modifier value."""
        return self.modifiers.get(key, 1.0)

@dataclass
class WorldMap:
    regions: List[Region] = field(default_factory=list)
    
    def __post_init__(self):
        if not self.regions:
            self.regions = [Region(loc) for loc in config.LOCATIONS]
            self.generate_missions()
    
    def generate_missions(self):
        """Generate missions for all regions."""
        for region in self.regions:
            difficulty = random.choice(list(config.DIFFICULTY_VALUES.values()))
            region.generate_mission(difficulty)
    
    def get_region_at(self, x: int, y: int) -> Region:
        """Get the region at the given coordinates."""
        for region in self.regions:
            rx, ry = region.map_pos
            if (x - rx) ** 2 + (y - ry) ** 2 <= 25 ** 2:
                return region
        return None
    
    def draw(self, screen, font):
        """Draw the world map on the given surface."""
        screen.fill((50, 50, 80))
        for region in self.regions:
            x, y = region.map_pos
            # Draw region circle
            pygame.draw.circle(screen, (100, 200, 100), (x, y), 25)
            # Draw region name
            screen.blit(font.render(region.name, True, (255, 255, 255)), (x - 40, y + 30))
            # Draw difficulty level
            level = region.missions[0].difficulty if region.missions else 1
            screen.blit(font.render(f"Lv{level}", True, (255, 255, 0)), (x - 10, y - 10))
            # Draw fear multiplier
            screen.blit(
                font.render(f"F*{region.modifiers['fear_mult']:.1f}", True, (255, 200, 200)),
                (x + 15, y - 20)
            ) 