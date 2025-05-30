import pygame

class Panel:
    def __init__(self, rect, title=None, bg_color=(40, 40, 60), border_color=(100, 100, 140)):
        self.rect = pygame.Rect(rect)
        self.title = title
        self.bg_color = bg_color
        self.border_color = border_color

    def draw(self, surface, font):
        pygame.draw.rect(surface, self.bg_color, self.rect, border_radius=10)
        pygame.draw.rect(surface, self.border_color, self.rect, 3, border_radius=10)
        if self.title:
            text_surf = font.render(self.title, True, (220, 220, 255))
            text_rect = text_surf.get_rect(midtop=(self.rect.centerx, self.rect.top + 8))
            surface.blit(text_surf, text_rect) 