import json
from pathlib import Path
from typing import Dict, List, Optional
from ..entities.equipment import Equipment, EquipmentType

class Store:
    def __init__(self):
        self.catalog: Dict[str, List[Dict]] = {}
        self.load_catalog()
    
    def load_catalog(self):
        """Load equipment catalog from JSON file."""
        catalog_path = Path(__file__).parent.parent / 'data' / 'equipment_catalog.json'
        with open(catalog_path, 'r') as f:
            self.catalog = json.load(f)
    
    def get_available_items(self, agent_level: int) -> List[Dict]:
        """Get all items available for purchase at the given agent level."""
        available = []
        for category in self.catalog.values():
            for item in category:
                if item['level_requirement'] <= agent_level:
                    available.append(item)
        return available
    
    def get_items_by_type(self, item_type: str, agent_level: int) -> List[Dict]:
        """Get items of a specific type available at the given agent level."""
        if item_type in self.catalog:
            return [
                item for item in self.catalog[item_type]
                if item['level_requirement'] <= agent_level
            ]
        return []
    
    def create_equipment(self, item_data: Dict) -> Equipment:
        """Create an Equipment instance from item data."""
        return Equipment(
            name=item_data['name'],
            type=EquipmentType(item_data['type']),
            stats=item_data['stats'],
            abilities=item_data['abilities'],
            cost=item_data['cost'],
            level_requirement=item_data['level_requirement']
        )
    
    def purchase_item(self, item_data: Dict, funds: int) -> Optional[Equipment]:
        """Attempt to purchase an item. Returns the Equipment if successful."""
        if funds >= item_data['cost']:
            return self.create_equipment(item_data)
        return None
    
    def get_item_description(self, item_data: Dict) -> str:
        """Get a formatted description of an item."""
        desc = [
            f"{item_data['name']} (Level {item_data['level_requirement']})",
            f"Cost: ${item_data['cost']}",
            f"Type: {item_data['type'].title()}",
            f"Stats: {', '.join(f'{k}: +{v}' for k, v in item_data['stats'].items())}",
            f"Abilities: {', '.join(item_data['abilities'])}",
            f"Description: {item_data['description']}"
        ]
        return "\n".join(desc) 