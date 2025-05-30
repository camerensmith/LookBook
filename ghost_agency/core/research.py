from dataclasses import dataclass, field
from typing import Dict, List, Set
import random
from .config import config

@dataclass
class Research:
    completed_projects: List[str] = field(default_factory=list)
    current_project: str = ""
    progress: int = 0
    
    def start_project(self, project: str) -> bool:
        if project in self.completed_projects or self.current_project:
            return False
        
        self.current_project = project
        self.progress = 0
        return True
    
    def advance_project(self, amount: int) -> bool:
        if not self.current_project:
            return False
        
        self.progress += amount
        if self.progress >= config.RESEARCH_PROJECT_COST:
            self.complete_project()
            return True
        return False
    
    def complete_project(self):
        if self.current_project:
            self.completed_projects.append(self.current_project)
            self.current_project = ""
            self.progress = 0
    
    def get_available_projects(self) -> List[str]:
        return [
            project for project in config.RESEARCH_PROJECTS
            if project not in self.completed_projects
        ]
    
    def is_project_completed(self, project: str) -> bool:
        return project in self.completed_projects
    
    def get_project_progress(self) -> float:
        if not self.current_project:
            return 0.0
        return self.progress / config.RESEARCH_PROJECT_COST

    def can_research(self, tech: str) -> bool:
        """Check if a technology can be researched."""
        if tech not in self.tree:
            return False
        
        tech_data = self.tree[tech]
        if tech_data["unlocked"]:
            return False
            
        if self.fragments < tech_data["cost"]:
            return False
            
        return all(self.tree[dep]["unlocked"] for dep in tech_data["deps"])
    
    def research(self, tech: str) -> bool:
        """Attempt to research a technology. Returns True if successful."""
        if not self.can_research(tech):
            return False
            
        tech_data = self.tree[tech]
        self.fragments -= tech_data["cost"]
        tech_data["unlocked"] = True
        return True
    
    def get_bonus(self, stat: str) -> float:
        """Get the total bonus multiplier for a stat from all researched techs."""
        bonus = 1.0
        for tech_data in self.tree.values():
            if tech_data["unlocked"]:
                bonus *= tech_data["bonuses"].get(stat, 1.0)
        return bonus
    
    def add_fragments(self, amount: int):
        """Add research fragments."""
        self.fragments += amount 