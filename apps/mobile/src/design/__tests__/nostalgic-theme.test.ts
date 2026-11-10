import { describe, expect, it } from 'vitest';
import { activeTheme, colors, motion, themes } from '../theme';
import { normalTextContrast } from '../layout-policy';

describe('nostalgic premium semantic tokens',()=>{
  it.each(['dark','light'] as const)('%s gives readable text, controls and status colors on their intended surfaces',mode=>{
    const t=themes[mode];
    for(const background of [t.surface.canvas,t.surface.panel,t.surface.raised,t.surface.hero]){
      for(const ink of [t.text.primary,t.text.secondary,t.text.tertiary])expect(normalTextContrast(ink,background)).toBeGreaterThanOrEqual(4.5);
      expect(normalTextContrast(t.action.primary,background)).toBeGreaterThanOrEqual(3);
    }
    expect(normalTextContrast(t.text.onPrimary,t.action.primary)).toBeGreaterThanOrEqual(4.5);
    expect(normalTextContrast(t.action.primary,t.action.selected)).toBeGreaterThanOrEqual(3);
    expect(normalTextContrast(t.border.control,t.surface.panel)).toBeGreaterThanOrEqual(3);
    expect(normalTextContrast(t.action.focus,t.surface.canvas)).toBeGreaterThanOrEqual(3);
    expect(normalTextContrast(t.status.positive,t.surface.panel)).toBeGreaterThanOrEqual(4.5);
    expect(normalTextContrast(t.status.negative,t.status.negativeSurface)).toBeGreaterThanOrEqual(4.5);
    expect(normalTextContrast(t.status.warning,t.status.warningSurface)).toBeGreaterThanOrEqual(4.5);
  });
  it('retains dark presentation with a complete separate light palette and black/white media foundations',()=>{
    expect(activeTheme).toBe(themes.dark);expect(themes.light.surface.canvas).toBe('#FFFFFF');expect(themes.dark.media.background).toBe('#040415');expect(themes.dark.media.foreground).toBe('#FFFFFF');
    expect(themes.dark.surface.canvas).toBe('#040415');expect(Object.values(themes.dark.text)).toEqual(['#FFFFFF','#FFFFFF','#FFFFFF','#040415']);expect(colors.accent).toBe('#E9FF60');expect(colors.success).toBe('#E9FF60');expect(colors.primaryForeground).toBe(activeTheme.text.onPrimary);expect(colors.controlBorder).toBe(activeTheme.border.control);
  });
  it('keeps media readable in either token palette and preserves reduced-motion animation constants',()=>{
    for(const t of Object.values(themes)){expect(normalTextContrast(t.media.foreground,t.media.surface)).toBeGreaterThanOrEqual(7);expect(normalTextContrast(t.media.muted,t.media.surface)).toBeGreaterThanOrEqual(4.5);}
    expect(motion).toEqual({duration:240,damping:20,stiffness:220});
  });
});
