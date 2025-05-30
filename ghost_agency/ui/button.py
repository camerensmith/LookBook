import pygame

class Button:
    def __init__(self, rect, text, font, callback, bg_color=(60, 60, 80), fg_color=(255,255,255), hover_color=(100,100,140)):
        self.rect = pygame.Rect(rect)
        self.text = text
        self.font = font
        self.callback = callback
        self.bg_color = bg_color
        self.fg_color = fg_color
        self.hover_color = hover_color
        self.hovered = False

    def draw(self, surface):
        color = self.hover_color if self.hovered else self.bg_color
        pygame.draw.rect(surface, color, self.rect, border_radius=8)
        pygame.draw.rect(surface, (30,30,40), self.rect, 2, border_radius=8)
        text_surf = self.font.render(self.text, True, self.fg_color)
        text_rect = text_surf.get_rect(center=self.rect.center)
        surface.blit(text_surf, text_rect)

    def handle_event(self, event):
        if event.type == pygame.MOUSEMOTION:
            self.hovered = self.rect.collidepoint(event.pos)
        elif event.type == pygame.MOUSEBUTTONDOWN and self.hovered:
            if event.button == 1:
                self.callback() 