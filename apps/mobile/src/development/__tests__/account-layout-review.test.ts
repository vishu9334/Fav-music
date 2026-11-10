import React from 'react';
import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {renderToStaticMarkup:(node:React.ReactNode)=>string};
const accountCalls=vi.hoisted(()=>({controller:vi.fn(()=>{throw Error('Account controller must not be used in layout review');})}));
vi.mock('../../auth/auth.module',()=>({AuthModule:{getController:accountCalls.controller}}));
vi.mock('react-native',()=>({
  View:({children}:{children:React.ReactNode})=>React.createElement('div',null,children),Text:({children}:{children:React.ReactNode})=>React.createElement('span',null,children),
  TextInput:({editable,value}:{editable:boolean;value:string})=>React.createElement('input',{readOnly:!editable,value}),
  Pressable:({children,disabled}:{children:React.ReactNode;disabled:boolean})=>React.createElement('button',{disabled},children),
  Image:()=>React.createElement('img',{alt:'Artwork'}),
  ActivityIndicator:()=>React.createElement('span',null,'Loading indicator'),StyleSheet:{create:(v:unknown)=>v},
}));
vi.mock('../../design/GlassSurface',()=>({GlassSurface:({children}:{children:React.ReactNode})=>React.createElement('div',null,children)}));
vi.mock('../../design/BrandLogo',()=>({BrandLogo:()=>React.createElement('img',{alt:'Fav Music logo'})}));
vi.mock('../../auth/components/google-signin.button',()=>({GoogleSignInButton:({disabled}:{disabled:boolean})=>React.createElement('button',{disabled},'Google native button presentation')}));
import { AccountLayoutReview } from '../AccountLayoutReview';
import { accountStyles } from '../../auth/components/account-presentation';
import { normalTextContrast } from '../../design/layout-policy';
import { colors } from '../../design/theme';
describe('account presentation review without an authentication system',()=>{
  it('renders Login with the shared intro and disabled Google action',()=>{
    const html=renderToStaticMarkup(React.createElement(AccountLayoutReview,{page:'login'}));
    expect(html).toContain('Your music');expect(html).toContain('button disabled');expect(html).toContain('Google Sign-In is disabled');expect(accountCalls.controller).not.toHaveBeenCalled();
  });
  it('renders Profile with no identity and no enabled save/logout action',()=>{
    const html=renderToStaticMarkup(React.createElement(AccountLayoutReview,{page:'profile'}));
    expect(html).toContain('NO ACCOUNT LOADED');expect(html).toContain('Visual review only');expect(html).not.toContain('You’re signed in');expect(html).not.toContain('test@example');
    const buttons=[...html.matchAll(/<button([^>]*)>/g)];expect(buttons.length).toBeGreaterThanOrEqual(3);expect(buttons.every(b=>b[1]!.includes('disabled'))).toBe(true);expect(accountCalls.controller).not.toHaveBeenCalled();
  });
  it('labels Loading honestly and verifies the exact shared privacy style',()=>{
    expect(renderToStaticMarkup(React.createElement(AccountLayoutReview,{page:'loading'}))).toContain('no connection attempted');
    expect(normalTextContrast(accountStyles.privacy.color,colors.bg)).toBeGreaterThanOrEqual(4.5);expect(accountCalls.controller).not.toHaveBeenCalled();
  });
});
