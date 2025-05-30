import pygame
import sys
import random
from enum import Enum, auto
from ghost_agency.core.agency import Agency
from ghost_agency.core.world_map import WorldMap
from ghost_agency.core.config import config, Status
from ghost_agency.core.room import Room
from ghost_agency.core.store import Store
from ghost_agency.entities.agent import Agent
from ghost_agency.entities.equipment import EquipmentType
from ghost_agency.entities.agent_class import get_available_classes, get_class_specialization
from ghost_agency.ui.button import Button
from ghost_agency.ui.panel import Panel

class GameState(Enum):
    MAIN_MENU = auto()
    AGENCY = auto()
    HQ = auto()
    ROSTER = auto()
    RESEARCH = auto()
    LOG = auto()

class Game:
    def __init__(self, width=config.WINDOW_WIDTH, height=config.WINDOW_HEIGHT):
        pygame.init()
        self.screen = pygame.display.set_mode((width, height))
        pygame.display.set_caption("Ghost Agency")
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont(None, 24)
        self.title_font = pygame.font.SysFont(None, 32, bold=True)

        # Game state
        self.state = GameState.MAIN_MENU
        self.hour, self.minute = 8, 0
        self.tick_counter = 0
        self.day = 1

        # Core components
        self.agency = Agency()
        self.world_map = WorldMap()
        self.store = Store()

        # UI Panels
        self.sidebar_panel = Panel((0, 0, 180, height), title="Menu")
        self.map_panel = Panel((190, 20, 500, 360), title="World Map")
        self.agent_panel = Panel((700, 20, 280, 360), title="Agents")
        self.info_panel = Panel((190, 400, 790, 180), title="Mission Info")

        # Sidebar buttons
        self.sidebar_buttons = []
        sidebar_options = [
            ("Agency", self.show_agency),
            ("Map", self.show_map),
            ("Store", self.show_store),
            ("Research", self.show_research),
            ("Log", self.show_log),
            ("Next Day", self.daily_update),
            ("Exit", self.quit)
        ]
        for i, (label, callback) in enumerate(sidebar_options):
            btn = Button((20, 60 + i*50, 140, 40), label, self.font, callback)
            self.sidebar_buttons.append(btn)

        # Game state
        self.current_screen = "map"  # map, agency, store, research, log
        self.selected_agent: Agent = None
        self.selected_region = None
        self.selected_mission = None
        self.selected_item = None
        self.store_category = None

    def show_agency(self):
        self.current_screen = "agency"
    def show_map(self):
        self.current_screen = "map"
    def show_store(self):
        self.current_screen = "store"
    def show_research(self):
        self.current_screen = "research"
    def show_log(self):
        self.current_screen = "log"

    def run(self):
        while True:
            self.handle_events()
            self.update()
            self.render()
            self.clock.tick(config.FPS)

    def handle_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.quit()
            for btn in self.sidebar_buttons:
                btn.handle_event(event)
            
            # Handle map clicks
            if event.type == pygame.MOUSEBUTTONDOWN and self.current_screen == "map":
                map_rect = self.map_panel.rect.inflate(-20, -40)
                if map_rect.collidepoint(event.pos):
                    # Calculate which region was clicked
                    region_width = map_rect.width // 3
                    region_height = map_rect.height // 2
                    col = (event.pos[0] - map_rect.left) // region_width
                    row = (event.pos[1] - map_rect.top) // region_height
                    region_index = row * 3 + col
                    
                    if 0 <= region_index < len(self.world_map.regions):
                        self.selected_region = self.world_map.regions[region_index]
                        if self.selected_region.missions:
                            self.selected_mission = self.selected_region.missions[0]
                            self.run_mission(self.selected_region)

    def update(self):
        self.tick_counter = (self.tick_counter + 1) % 60
        if self.tick_counter == 0:
            self.minute += 1
            if self.minute >= 60:
                self.minute = 0
                self.hour = (self.hour + 1) % 24

    def render(self):
        self.screen.fill((30, 30, 40))
        self.sidebar_panel.draw(self.screen, self.title_font)
        for btn in self.sidebar_buttons:
            btn.draw(self.screen)
        if self.current_screen == "map":
            self.map_panel.draw(self.screen, self.title_font)
            self.draw_map_content()
            self.agent_panel.draw(self.screen, self.title_font)
            self.draw_agent_panel()
            self.info_panel.draw(self.screen, self.title_font)
            self.draw_info_panel()
        elif self.current_screen == "agency":
            self.agent_panel.draw(self.screen, self.title_font)
            self.draw_agent_panel()
        # Add rendering for store, research, log as needed
        pygame.display.flip()

    def draw_map_content(self):
        # Draw the world map inside the map panel
        map_rect = self.map_panel.rect.inflate(-20, -40)
        pygame.draw.rect(self.screen, (60, 80, 120), map_rect, border_radius=8)
        
        # Calculate region sizes and positions
        num_regions = len(self.world_map.regions)
        region_width = map_rect.width // 3
        region_height = map_rect.height // 2
        
        # Draw regions
        for i, region in enumerate(self.world_map.regions):
            # Calculate region position
            row = i // 3
            col = i % 3
            x = map_rect.left + (col * region_width)
            y = map_rect.top + (row * region_height)
            region_rect = pygame.Rect(x + 5, y + 5, region_width - 10, region_height - 10)
            
            # Draw region background
            color = (80, 100, 140) if region == self.selected_region else (70, 90, 130)
            pygame.draw.rect(self.screen, color, region_rect, border_radius=6)
            pygame.draw.rect(self.screen, (120, 140, 180), region_rect, 2, border_radius=6)
            
            # Draw region name
            name_text = self.font.render(region.name, True, (255, 255, 255))
            name_rect = name_text.get_rect(centerx=region_rect.centerx, top=region_rect.top + 5)
            self.screen.blit(name_text, name_rect)
            
            # Draw mission info if any
            if region.missions:
                mission = region.missions[0]  # Show first mission
                diff_text = self.font.render(f"Difficulty: {mission.difficulty}", True, (200, 200, 200))
                reward_text = self.font.render(f"Reward: ${mission.reward}", True, (200, 200, 200))
                self.screen.blit(diff_text, (region_rect.left + 5, region_rect.top + 30))
                self.screen.blit(reward_text, (region_rect.left + 5, region_rect.top + 50))
                
                # Draw mission status
                status_color = (100, 200, 100) if mission.status == Status.AVAILABLE else (200, 100, 100)
                status_text = self.font.render(str(mission.status.name).title(), True, status_color)
                self.screen.blit(status_text, (region_rect.left + 5, region_rect.top + 70))
            
            # Draw region modifiers
            mod_text = self.font.render(f"Fear: {region.modifiers['fear_mult']:.1f}x", True, (180, 180, 200))
            self.screen.blit(mod_text, (region_rect.left + 5, region_rect.bottom - 25))

    def draw_agent_panel(self):
        # Draw agent cards in the agent panel
        y = self.agent_panel.rect.top + 40
        for agent in self.agency.roster:
            card_rect = pygame.Rect(self.agent_panel.rect.left + 10, y, self.agent_panel.rect.width - 20, 60)
            pygame.draw.rect(self.screen, (50, 60, 90), card_rect, border_radius=6)
            pygame.draw.rect(self.screen, (120, 120, 180), card_rect, 2, border_radius=6)
            info = f"{agent.name} L{agent.level}"
            if agent.agent_class:
                info += f" [{agent.agent_class.value}]"
            text = self.font.render(info, True, (255, 255, 255))
            self.screen.blit(text, (card_rect.left + 10, card_rect.top + 8))
            stats = " ".join(f"{stat}:{val}" for stat, val in agent.stats.items())
            self.screen.blit(self.font.render(stats, True, (200, 200, 200)), (card_rect.left + 10, card_rect.top + 30))
            y += 70

    def draw_info_panel(self):
        # Draw mission/region info in the info panel
        y = self.info_panel.rect.top + 40
        text = self.font.render("[Mission/region info goes here]", True, (220, 220, 255))
        self.screen.blit(text, (self.info_panel.rect.left + 20, y))

    def daily_update(self):
        # Pay utilities
        for utility, cost in self.agency.utilities.items():
            self.agency.funds -= cost
            self.agency.mission_log.append(f"Day{self.day}: Paid {utility} ${cost}")

        # Pay salaries
        self.agency.pay_salaries()

        # Pay room maintenance
        for room in self.agency.rooms:
            cost = room.get_total_maintenance_cost()
            self.agency.funds -= cost
            self.agency.mission_log.append(f"Day{self.day}: Paid maintenance for {room.name} ${cost}")

        # Update agents
        for agent in self.agency.roster:
            if agent.status == Status.RESTING:
                agent.recover_stress(20)
            elif agent.status == Status.INJURED:
                agent.recover_stress(10)

        # Advance research
        if self.agency.research.current_project:
            self.agency.research.advance_project(10)

        self.day += 1

    def quit(self):
        pygame.quit()
        sys.exit()

if __name__ == '__main__':
    game = Game()
    game.agency.hire_random_agent()
    game.agency.hire_random_agent()
    game.run() 