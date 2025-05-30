from .core.game import Game
from .core.config import GameConfig

def main():
    game = Game(GameConfig())
    game.run()

if __name__ == '__main__':
    main() 