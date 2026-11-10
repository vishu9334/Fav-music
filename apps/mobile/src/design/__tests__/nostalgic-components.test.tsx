import React from 'react';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
const {renderToStaticMarkup}=createRequire(import.meta.url)('react-dom/server') as {renderToStaticMarkup:(node:React.ReactNode)=>string};
vi.mock('react-native',()=>({View:({children}:{children?:React.ReactNode})=>React.createElement('div',null,children),StyleSheet:{create:(value:unknown)=>value,absoluteFill:{}}}));
vi.mock('react-native-svg',()=>({
  default:({accessible,importantForAccessibility,pointerEvents,style:_style,...props}:React.SVGProps<SVGSVGElement>&{accessible?:boolean;importantForAccessibility?:string;pointerEvents?:string})=>React.createElement('svg',{
    ...props,'data-accessible':String(accessible),'data-accessibility':importantForAccessibility,'data-pointer-events':pointerEvents,
  }),
  Defs:'defs',LinearGradient:'linearGradient',RadialGradient:'radialGradient',Stop:'stop',Rect:'rect',Path:'path',Circle:'circle',
}));
vi.mock('../NativeBackdrop',()=>({NativeBackdrop:({reducedEffects}:{reducedEffects:boolean})=>React.createElement('i',{'data-backdrop':'native','data-reduced':String(reducedEffects)})}));
import { GlassSurface } from '../GlassSurface';
import { NostalgicCassette } from '../NostalgicCassette';
import { colors } from '../theme';
describe('nostalgic theme component rendering (mocked native/SVG views)',()=>{
  it('keeps regular scroll surfaces flat without native captures or repeated gradient layers',()=>{
    const markup=renderToStaticMarkup(<GlassSurface><span>Existing content</span></GlassSurface>);expect(markup).toContain('Existing content');expect(markup).not.toMatch(/svg|Gradient|data-backdrop/);
  });
  it('retains media-only glass highlights and passes reduced effects to the existing native policy',()=>{
    const markup=renderToStaticMarkup(<GlassSurface backdrop reduceEffects><span>Play</span></GlassSurface>);expect(markup).toContain('data-backdrop="native"');expect(markup).toContain('data-reduced="true"');expect(markup.match(/<svg/g)).toHaveLength(1);expect(markup.match(/<(?:linear|radial)Gradient/g)).toHaveLength(3);expect(markup).toContain(colors.accent);expect(markup).toContain('Play');
  });
  it('uses a small original static vector with a bounded node budget and no raster, gradient or animation',()=>{
    const markup=renderToStaticMarkup(<NostalgicCassette/>);expect(markup).toContain('viewBox="0 0 84 56"');expect(markup).toContain('width="84"');expect(markup).toContain('height="56"');expect(markup).not.toMatch(/<image|<animate|Gradient|filter|<text/);
    expect(markup.match(/<(?:path|circle|rect)\b/g)).toHaveLength(10);expect(markup).toContain(colors.success);expect(markup).toContain(colors.warning);
    expect(markup).toContain('data-accessible="false"');expect(markup).toContain('data-accessibility="no-hide-descendants"');expect(markup).toContain('data-pointer-events="none"');
  });
});
