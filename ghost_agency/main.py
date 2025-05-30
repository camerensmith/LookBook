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

        # Game state
        self.state = GameState.MAIN_MENU
        self.hour, self.minute = 8, 0
        self.tick_counter = 0
        self.day = 1

        # Core components
        self.agency = Agency()
        self.world_map = WorldMap()
        self.store = Store()

        # Menu options
        self.menu_options = [
            ("Agency", GameState.AGENCY),
            ("HQ", GameState.HQ),
            ("Roster", GameState.ROSTER),
            ("Research", GameState.RESEARCH),
            ("Log", GameState.LOG),
            ("Next Day", None),
            ("Exit", None)
        ]

        # Game state
        self.current_screen = "world_map"  # world_map, agency, store
        self.selected_agent: Optional[Agent] = None
        self.selected_item: Optional[Dict] = None
        self.store_category: Optional[str] = None

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
            if event.type == pygame.MOUSEBUTTONDOWN:
                mx, my = event.pos
                # Menu interaction
                for i, (label, state) in enumerate(self.menu_options):
                    rect = pygame.Rect(10, 10 + i*30, 140, 24)
                    if rect.collidepoint(mx, my):
                        if label == 'Exit':
                            self.quit()
                        elif label == 'Next Day':
                            self.daily_update()
                        else:
                            self.state = state
                        return
                
                # Map click to start mission
                if self.state == GameState.MAIN_MENU:
                    region = self.world_map.get_region_at(mx, my)
                    if region and region.missions:
                        self.run_mission(region)
                
                # HQ room interactions
                elif self.state == GameState.HQ:
                    y = 50
                    for room in self.agency.rooms:
                        if y <= my <= y + 60:  # Room area
                            # Upgrade room
                            if mx >= 200 and mx <= 300:
                                if self.agency.funds >= config.MAINTENANCE_COST_INCREASE:
                                    if room.upgrade():
                                        self.agency.funds -= config.MAINTENANCE_COST_INCREASE
                                        self.agency.mission_log.append(f"Upgraded {room.name} to level {room.level}")
                            # Add upgrade
                            elif mx >= 300 and mx <= 400:
                                if self.agency.funds >= config.UPGRADE_MAINTENANCE_COST:
                                    upgrade = random.choice(config.RESEARCH_PROJECTS)
                                    if room.add_upgrade(upgrade):
                                        self.agency.funds -= config.UPGRADE_MAINTENANCE_COST
                                        self.agency.mission_log.append(f"Added {upgrade} to {room.name}")
                        y += 60
                    
                    # Add new room
                    if len(self.agency.rooms) < config.MAX_ROOMS:
                        if y <= my <= y + 30:
                            if self.agency.funds >= config.DEFAULT_MAINTENANCE_COST:
                                room_type = random.choice(['Training', 'Research', 'Medical'])
                                room = Room(f"{room_type} Room", room_type)
                                self.agency.rooms.append(room)
                                self.agency.funds -= config.DEFAULT_MAINTENANCE_COST
                                self.agency.mission_log.append(f"Added new {room.name}")
                
                # Research interactions
                elif self.state == GameState.RESEARCH:
                    y = 50
                    if self.agency.research.current_project:
                        y += 30
                    
                    y += 25
                    for project in self.agency.research.get_available_projects():
                        if y <= my <= y + 25:
                            if self.agency.funds >= config.RESEARCH_PROJECT_COST:
                                if self.agency.research.start_project(project):
                                    self.agency.funds -= config.RESEARCH_PROJECT_COST
                                    self.agency.mission_log.append(f"Started research on {project}")
                        y += 25
            
            if event.type == pygame.KEYDOWN:
                if self.state == GameState.ROSTER and event.key == pygame.K_h:
                    self.agency.hire_random_agent()
                if event.key == pygame.K_ESCAPE and self.state != GameState.MAIN_MENU:
                    self.state = GameState.MAIN_MENU

            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    if self.current_screen == "store":
                        self.current_screen = "agency"
                    elif self.current_screen == "agency":
                        self.current_screen = "world_map"
                    else:
                        return False
                
                if event.key == pygame.K_s and self.current_screen == "agency":
                    self.current_screen = "store"
            
            if event.type == pygame.MOUSEBUTTONDOWN:
                if self.current_screen == "store":
                    self.handle_store_click(event.pos)
                elif self.current_screen == "agency":
                    self.handle_agency_click(event.pos)
                else:
                    self.handle_world_map_click(event.pos)
        
        return True

    def update(self):
        # Advance clock: 1 minute per second
        self.tick_counter = (self.tick_counter + 1) % 60
        if self.tick_counter == 0:
            self.minute += 1
            if self.minute >= 60:
                self.minute = 0
                self.hour = (self.hour + 1) % 24

    def render(self):
        self.screen.fill((30, 30, 30))
        if self.state == GameState.MAIN_MENU:
            self.world_map.draw(self.screen, self.font)
            self.draw_menu()
            self.draw_status()
        elif self.state == GameState.AGENCY:
            self.draw_agency()
        elif self.state == GameState.HQ:
            self.draw_hq()
        elif self.state == GameState.ROSTER:
            self.draw_roster()
        elif self.state == GameState.RESEARCH:
            self.draw_research()
        elif self.state == GameState.LOG:
            self.draw_log()
        elif self.current_screen == "store":
            self.draw_store()
        pygame.display.flip()

    def draw_menu(self):
        for i, (label, _) in enumerate(self.menu_options):
            t = self.font.render(label, True, (255, 255, 255))
            r = t.get_rect(topleft=(10, 10 + i*30))
            pygame.draw.rect(self.screen, (0, 0, 0), r.inflate(4, 4))
            self.screen.blit(t, r)

    def draw_status(self):
        lines = [
            f"Day: {self.day}",
            f"Time: {self.hour:02d}:{self.minute:02d}",
            f"Funds: ${self.agency.funds}",
            f"Reputation: {self.agency.reputation}",
            f"Agents: {len(self.agency.roster)}/{config.MAX_AGENTS}",
            f"Available: {len(self.agency.get_available_agents())}"
        ]
        for i, txt in enumerate(lines):
            self.screen.blit(self.font.render(txt, True, (200, 200, 200)), (600, 10 + i*20))

    def draw_agency(self):
        """Draw the agency screen with agent roster and class assignment options."""
        self.screen.fill((0, 0, 0))
        
        # Draw header
        header = "Agency Roster"
        if self.selected_agent:
            header += f" - Selected: {self.selected_agent.name}"
        text = self.font.render(header, True, (255, 255, 255))
        self.screen.blit(text, (10, 10))
        
        # Draw agent list
        y = 50
        for agent in self.agency.roster:
            # Agent info
            color = (255, 255, 0) if agent == self.selected_agent else (255, 255, 255)
            info = f"{agent.name} L{agent.level}"
            if agent.agent_class:
                info += f" [{agent.agent_class.value}]"
            text = self.font.render(info, True, color)
            self.screen.blit(text, (10, y))
            
            # Stats
            stats = " ".join(f"{stat}:{val}" for stat, val in agent.stats.items())
            text = self.font.render(stats, True, (200, 200, 200))
            self.screen.blit(text, (10, y + 25))
            
            # Status and money
            status = f"Status: {agent.status.name} | Money: ${agent.money}"
            text = self.font.render(status, True, (180, 180, 180))
            self.screen.blit(text, (10, y + 50))
            
            y += 80
        
        # Draw class assignment section if agent is selected and level 3+
        if self.selected_agent and self.selected_agent.level >= 3:
            if not self.selected_agent.agent_class:
                text = self.font.render("Available Classes:", True, (255, 255, 255))
                self.screen.blit(text, (10, y))
                y += 30
                
                for agent_class in get_available_classes(self.selected_agent.level):
                    specialization = get_class_specialization(agent_class)
                    if specialization:
                        class_info = f"{agent_class.value}: {specialization.description}"
                        text = self.font.render(class_info, True, (200, 200, 200))
                        self.screen.blit(text, (20, y))
                        y += 30
            else:
                # Show current class info
                specialization = get_class_specialization(self.selected_agent.agent_class)
                if specialization:
                    text = self.font.render(f"Class: {self.selected_agent.agent_class.value}", True, (255, 255, 255))
                    self.screen.blit(text, (10, y))
                    y += 30
                    
                    text = self.font.render(f"Description: {specialization.description}", True, (200, 200, 200))
                    self.screen.blit(text, (20, y))
                    y += 30
                    
                    text = self.font.render("Abilities:", True, (200, 200, 200))
                    self.screen.blit(text, (20, y))
                    y += 30
                    
                    for ability in specialization.abilities:
                        text = self.font.render(f"- {ability}", True, (180, 180, 180))
                        self.screen.blit(text, (30, y))
                        y += 25

    def draw_hq(self):
        hdr = "HQ Building"
        self.screen.blit(self.font.render(hdr, True, (255, 255, 255)), (10, 10))
        y = 50
        
        # Room list
        for room in self.agency.rooms:
            # Room name and level
            txt = f"{room.name} (Level {room.level})"
            self.screen.blit(self.font.render(txt, True, (220, 220, 220)), (10, y))
            y += 25
            
            # Room stats
            stats = f"Capacity: {room.capacity} | Maintenance: ${room.get_total_maintenance_cost()}/day"
            self.screen.blit(self.font.render(stats, True, (200, 200, 200)), (10, y))
            y += 25
            
            # Upgrades
            if room.upgrades:
                upgrades = "Upgrades: " + ", ".join(room.upgrades)
                self.screen.blit(self.font.render(upgrades, True, (180, 180, 180)), (10, y))
                y += 25
            
            y += 10
        
        # Add room button
        if len(self.agency.rooms) < config.MAX_ROOMS:
            txt = "Click to add new room"
            self.screen.blit(self.font.render(txt, True, (150, 200, 150)), (10, y))

    def draw_roster(self):
        hdr = "Roster - H: hire"
        self.screen.blit(self.font.render(hdr, True, (255, 255, 255)), (10, 10))
        y = 50
        for agent in self.agency.roster:
            # Basic info
            info = f"{agent.name} L{agent.level} (XP: {agent.experience}/{agent.get_level_threshold()})"
            self.screen.blit(self.font.render(info, True, (220, 220, 220)), (10, y))
            y += 25
            
            # Stats
            stats = " ".join(f"{stat}:{val}" for stat, val in agent.stats.items())
            self.screen.blit(self.font.render(stats, True, (200, 200, 200)), (10, y))
            y += 25
            
            # Equipment
            if agent.equipped:
                equipment = "Equipped: " + ", ".join(
                    f"{item.name}" for item in agent.equipped.values() if item
                )
                self.screen.blit(self.font.render(equipment, True, (180, 180, 180)), (10, y))
                y += 25
            
            # Status and money
            status = f"Status: {agent.status.name} | Money: ${agent.money}"
            self.screen.blit(self.font.render(status, True, (180, 180, 180)), (10, y))
            y += 35

    def draw_research(self):
        hdr = "Research Projects"
        self.screen.blit(self.font.render(hdr, True, (255, 255, 255)), (10, 10))
        y = 50
        
        # Current project
        if self.agency.research.current_project:
            progress = self.agency.research.get_project_progress()
            txt = f"Current: {self.agency.research.current_project} ({progress:.1%})"
            self.screen.blit(self.font.render(txt, True, (200, 200, 200)), (10, y))
            y += 30
        
        # Available projects
        self.screen.blit(self.font.render("Available Projects:", True, (220, 220, 220)), (10, y))
        y += 25
        for project in self.agency.research.get_available_projects():
            txt = f"- {project}"
            self.screen.blit(self.font.render(txt, True, (180, 180, 180)), (20, y))
            y += 25
        
        # Completed projects
        if self.agency.research.completed_projects:
            y += 10
            self.screen.blit(self.font.render("Completed Projects:", True, (220, 220, 220)), (10, y))
            y += 25
            for project in self.agency.research.completed_projects:
                txt = f"✓ {project}"
                self.screen.blit(self.font.render(txt, True, (150, 200, 150)), (20, y))
                y += 25

    def draw_log(self):
        hdr = "Mission Log"
        self.screen.blit(self.font.render(hdr, True, (255, 255, 255)), (10, 10))
        y = 50
        for entry in self.agency.mission_log[-10:]:
            self.screen.blit(self.font.render(entry, True, (200, 200, 200)), (10, y))
            y += 20

    def run_mission(self, region):
        mission = region.missions[0]
        agents = self.agency.get_available_agents()[:config.MAX_AGENTS_PER_MISSION]
        if not agents:
            self.agency.mission_log.append(f"Day{self.day}: No agents available at {region.name}")
            return

        # Assign agents to mission
        for agent in agents:
            agent.status = Status.ON_MISSION
            mission.assign_agent(agent.name)

        # Start mission
        mission.start()

        # Calculate success chance based on agent stats and ghost difficulty
        total_stats = sum(agent.get_total_stats() for agent in agents)
        success_chance = min(0.95, total_stats / (mission.difficulty * 10))
        success = random.random() < success_chance

        # Apply stress based on difficulty and region modifiers
        for agent in agents:
            stress = mission.difficulty * 10 * region.modifiers['fear_mult']
            agent.stress = min(100, agent.stress + int(stress))

        # Handle rewards
        if success:
            self.agency.add_funds(mission.reward)
            for agent in agents:
                agent.gain_experience(mission.difficulty * 10)
            self.agency.update_reputation(mission.difficulty * 5)
        else:
            self.agency.update_reputation(-mission.difficulty * 2)

        # Complete mission
        mission.complete(success)

        # Reset agent status
        for agent in agents:
            agent.status = Status.AVAILABLE

        # Log result
        result = "SUCCESS" if success else "FAILURE"
        self.agency.mission_log.append(
            f"Day{self.day} {region.name}: {result} ({success_chance:.1%})"
        )

        # Generate new mission
        region.generate_mission(mission.difficulty)

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

    def handle_store_click(self, pos):
        # Handle category selection
        category_y = 50
        for category in ["weapons", "armor", "tools", "trinkets"]:
            if 50 <= pos[0] <= 200 and category_y <= pos[1] <= category_y + 30:
                self.store_category = category
                self.selected_item = None
                return
            category_y += 40
        
        # Handle item selection
        if self.store_category:
            items = self.store.get_items_by_type(
                self.store_category,
                self.selected_agent.level if self.selected_agent else 1
            )
            item_y = 150
            for item in items:
                if 50 <= pos[0] <= 400 and item_y <= pos[1] <= item_y + 30:
                    self.selected_item = item
                    return
                item_y += 40
        
        # Handle purchase button
        if self.selected_item and self.selected_agent:
            if 50 <= pos[0] <= 150 and 500 <= pos[1] <= 530:
                self.purchase_item()
    
    def purchase_item(self):
        if self.selected_item and self.selected_agent:
            if self.selected_agent.spend_money(self.selected_item['cost']):
                equipment = self.store.create_equipment(self.selected_item)
                self.selected_agent.add_to_inventory(equipment)
                self.selected_item = None
    
    def draw_store(self):
        self.screen.fill((0, 0, 0))
        
        # Draw categories
        category_y = 50
        for category in ["weapons", "armor", "tools", "trinkets"]:
            color = (255, 255, 0) if category == self.store_category else (255, 255, 255)
            text = self.font.render(category.title(), True, color)
            self.screen.blit(text, (50, category_y))
            category_y += 40
        
        # Draw items
        if self.store_category:
            items = self.store.get_items_by_type(
                self.store_category,
                self.selected_agent.level if self.selected_agent else 1
            )
            item_y = 150
            for item in items:
                color = (255, 255, 0) if item == self.selected_item else (255, 255, 255)
                text = self.font.render(
                    f"{item['name']} - ${item['cost']} (Level {item['level_requirement']})",
                    True, color
                )
                self.screen.blit(text, (50, item_y))
                item_y += 40
        
        # Draw selected item details
        if self.selected_item:
            desc = self.store.get_item_description(self.selected_item)
            y = 150
            for line in desc.split('\n'):
                text = self.font.render(line, True, (255, 255, 255))
                self.screen.blit(text, (450, y))
                y += 20
            
            # Draw purchase button
            if self.selected_agent:
                can_afford = self.selected_agent.money >= self.selected_item['cost']
                color = (0, 255, 0) if can_afford else (255, 0, 0)
                text = self.font.render("Purchase", True, color)
                self.screen.blit(text, (50, 500))
        
        # Draw agent info
        if self.selected_agent:
            text = self.font.render(
                f"Agent: {self.selected_agent.name} - Money: ${self.selected_agent.money}",
                True, (255, 255, 255)
            )
            self.screen.blit(text, (50, 10))

    def handle_world_map_click(self, pos):
        """Handle clicks on the world map."""
        # Check if click is within map bounds
        if not (50 <= pos[0] <= 550 and 50 <= pos[1] <= 350):
            return
        
        # Get region at click position
        region = self.world_map.get_region_at(pos[0], pos[1])
        if not region:
            return
        
        # If region has missions, show mission selection
        if region.missions:
            self.selected_region = region
            self.current_screen = "mission_select"
    
    def handle_agency_click(self, pos):
        """Handle clicks in the agency screen."""
        # Check for agent selection
        y = 50
        for agent in self.agency.roster:
            if y <= pos[1] <= y + 60:  # Agent area
                self.selected_agent = agent
                return
            y += 60
        
        # Check for class assignment if agent is selected and level 3+
        if self.selected_agent and self.selected_agent.level >= 3:
            y = 200
            for agent_class in get_available_classes(self.selected_agent.level):
                if y <= pos[1] <= y + 30:
                    if self.selected_agent.assign_class(agent_class):
                        self.agency.mission_log.append(
                            f"{self.selected_agent.name} assigned as {agent_class.value}"
                        )
                    return
                y += 40

if __name__ == '__main__':
    game = Game()
    # Hire initial agents
    game.agency.hire_random_agent()
    game.agency.hire_random_agent()
    game.run() 