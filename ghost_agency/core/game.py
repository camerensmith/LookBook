import pygame
from typing import Dict, List, Optional
from .game_state import GameState
from .config import GameConfig

class Game:
    def __init__(self, config: GameConfig = GameConfig()):
        self.config = config
        self._init_pygame()
        self._init_game_state()
        self._init_systems()
        self._init_screens()
        
    def _init_pygame(self):
        pygame.init()
        self.screen = pygame.display.set_mode(
            (self.config.WINDOW_WIDTH, self.config.WINDOW_HEIGHT)
        )
        pygame.display.set_caption("Ghost Agency")
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont(None, 24)
        
    def _init_game_state(self):
        self.state = GameState.MAIN_MENU
        self.hour, self.minute = 8, 0
        self.tick_counter = 0
        self.day = 1
        
    def _init_systems(self):
        # These will be implemented in their respective modules
        self.economy = None  # Economy(self.config.STARTING_FUNDS, self.config.STARTING_REPUTATION)
        self.research = None  # Research()
        self.world_map = None  # WorldMap()
        
    def _init_screens(self):
        # These will be implemented in their respective modules
        self.screens = {
            GameState.MAIN_MENU: None,  # MainMenuScreen(self)
            GameState.AGENCY: None,     # AgencyScreen(self)
            GameState.HQ: None,         # HqScreen(self)
            GameState.ROSTER: None,     # RosterScreen(self)
            GameState.RESEARCH: None,   # ResearchScreen(self)
            GameState.LOG: None         # LogScreen(self)
        }
        
    def run(self):
        while True:
            self.handle_events()
            self.update()
            self.render()
            self.clock.tick(self.config.FPS)
            
    def handle_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.quit()
            if self.screens[self.state]:
                self.screens[self.state].handle_event(event)
            
    def update(self):
        self.tick_counter = (self.tick_counter + 1) % 60
        if self.tick_counter == 0:
            self.minute += 1
            if self.minute >= 60:
                self.minute = 0
                self.hour = (self.hour + 1) % 24
        if self.screens[self.state]:
            self.screens[self.state].update()
        
    def render(self):
        self.screen.fill((30, 30, 30))
        if self.screens[self.state]:
            self.screens[self.state].render(self.screen)
        pygame.display.flip()
        
    def change_state(self, new_state: GameState):
        self.state = new_state
        
    def daily_update(self):
        if self.economy:
            self.economy.process_daily_expenses()
        if self.research:
            self.research.update_progress()
        if self.world_map:
            self.world_map.regenerate_missions()
        self.day += 1
        
    def quit(self):
        pygame.quit()
        raise SystemExit 