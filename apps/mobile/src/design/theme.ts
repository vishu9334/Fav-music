/** Obsidian foundations (#040415), volt neon electric controls (#E9FF60) and white text. */
export interface ThemeTokens {
  surface: { canvas:string; panel:string; raised:string; subtle:string; hero:string; scrim:string };
  text: { primary:string; secondary:string; tertiary:string; onPrimary:string };
  border: { subtle:string; control:string; selected:string };
  action: { primary:string; selected:string; secondary:string; pressed:string; focus:string };
  status: { positive:string; warning:string; warningSurface:string; negative:string; negativeSurface:string };
  media: { background:string; foreground:string; muted:string; surface:string; glass:string; rim:string; bubble:string; primaryBubble:string; primaryTint:string; pressed:string; track:string; buffered:string };
  illustration: { blue:string; green:string; yellow:string };
}
const media:ThemeTokens['media']={background:'#040415',foreground:'#FFFFFF',muted:'#8A8A9E',surface:'#121320',glass:'rgba(18,19,32,0.92)',rim:'rgba(255,255,255,0.18)',bubble:'rgba(233,255,96,0.12)',primaryBubble:'rgba(233,255,96,0.22)',primaryTint:'rgba(255,255,255,0.05)',pressed:'rgba(233,255,96,0.25)',track:'rgba(255,255,255,0.12)',buffered:'rgba(255,255,255,0.24)'};
export const themes:Readonly<Record<'dark'|'light',ThemeTokens>>={
  dark:{
    surface:{canvas:'#040415',panel:'#0A0B14',raised:'#121320',subtle:'#080910',hero:'#181A28',scrim:'rgba(4,4,21,0.85)'},
    text:{primary:'#FFFFFF',secondary:'#FFFFFF',tertiary:'#FFFFFF',onPrimary:'#040415'},
    border:{subtle:'#2A2B3A',control:'#6E7084',selected:'#E9FF60'},
    action:{primary:'#E9FF60',selected:'#1E220D',secondary:'#121320',pressed:'rgba(233,255,96,0.28)',focus:'#E9FF60'},
    status:{positive:'#E9FF60',warning:'#FFB800',warningSurface:'#261E0A',negative:'#FF4D6D',negativeSurface:'#280E14'},
    media,illustration:{blue:'#5C68FF',green:'#E9FF60',yellow:'#FFB800'},
  },
  light:{
    surface:{canvas:'#FFFFFF',panel:'#F5F8F9',raised:'#E7EFF1',subtle:'#FAFCFC',hero:'#EDF4F6',scrim:'rgba(0,0,0,0.42)'},
    text:{primary:'#101719',secondary:'#42565E',tertiary:'#536A73',onPrimary:'#FFFFFF'},
    border:{subtle:'#CBD7DC',control:'#72858D',selected:'#195D9F'},
    action:{primary:'#195D9F',selected:'#DFEDF8',secondary:'#E7EFF1',pressed:'rgba(25,93,159,0.10)',focus:'#195D9F'},
    status:{positive:'#246D4F',warning:'#72530D',warningSurface:'#FFF5D9',negative:'#A32935',negativeSurface:'#FFF0F1'},
    media,illustration:{blue:'#195D9F',green:'#246D4F',yellow:'#997114'},
  },
};
/** Preserve the established dark presentation; light tokens do not introduce a new mode/settings flow. */
export const activeTheme=themes.dark;
/** Compatible aliases let existing components adopt tokens without new state or routing. */
export const colors={
  bg:activeTheme.surface.canvas,panel:activeTheme.surface.panel,raised:activeTheme.surface.raised,subtle:activeTheme.surface.subtle,hero:activeTheme.surface.hero,overlay:activeTheme.surface.scrim,
  text:activeTheme.text.primary,muted:activeTheme.text.secondary,tertiary:activeTheme.text.tertiary,primaryForeground:activeTheme.text.onPrimary,
  line:activeTheme.border.subtle,controlBorder:activeTheme.border.control,selectedBorder:activeTheme.border.selected,
  accent:activeTheme.action.primary,darkAccent:activeTheme.action.selected,secondary:activeTheme.action.secondary,pressed:activeTheme.action.pressed,focus:activeTheme.action.focus,
  success:activeTheme.status.positive,warning:activeTheme.status.warning,warningSurface:activeTheme.status.warningSurface,destructive:activeTheme.status.negative,errorSurface:activeTheme.status.negativeSurface,
  glass:activeTheme.media.glass,highlight:activeTheme.media.rim,mediaBackground:activeTheme.media.background,mediaForeground:activeTheme.media.foreground,mediaMuted:activeTheme.media.muted,mediaSurface:activeTheme.media.surface,
  mediaBubble:activeTheme.media.bubble,mediaPrimaryBubble:activeTheme.media.primaryBubble,mediaPrimaryTint:activeTheme.media.primaryTint,mediaPressed:activeTheme.media.pressed,mediaTrack:activeTheme.media.track,mediaBuffered:activeTheme.media.buffered,
};
export const spacing={xs:4,sm:8,md:12,lg:16,page:18,xl:24,section:32};
export const radius={small:12,card:16,large:24,pill:999};
export const motion={duration:240,damping:20,stiffness:220};
