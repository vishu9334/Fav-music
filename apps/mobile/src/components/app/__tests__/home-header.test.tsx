import React from 'react';
import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const {renderToStaticMarkup}=createRequire(import.meta.url)('react-dom/server') as {renderToStaticMarkup:(node:React.ReactNode)=>string};
const h=vi.hoisted(()=>({path:'/',open:false,push:vi.fn(),random:vi.fn(async()=>null),buttons:new Map<string,{style:unknown;onPress:()=>void}>()}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),useState:()=>[h.open,(value:boolean)=>{h.open=value;}],useSyncExternalStore:(_subscribe:unknown,getSnapshot:()=>unknown)=>getSnapshot()}));
vi.mock('react-native',()=>{
 const Box=({children}:{children?:React.ReactNode})=>React.createElement('div',null,children);
 return {View:Box,ScrollView:Box,Text:({children}:{children:React.ReactNode})=>React.createElement('span',null,children),
  Pressable:({children,style,accessibilityLabel,onPress,disabled}:{children:React.ReactNode;style:unknown;accessibilityLabel?:string;onPress:()=>void;disabled?:boolean})=>{
   if(accessibilityLabel)h.buttons.set(accessibilityLabel,{style,onPress});return React.createElement('button',{'aria-label':accessibilityLabel,disabled},children);
  },Modal:({visible,children}:{visible:boolean;children:React.ReactNode})=>visible?React.createElement('aside',null,children):null,
  StyleSheet:{create:(value:unknown)=>value,hairlineWidth:1,absoluteFill:{}},
 };
});
vi.mock('lucide-react-native',()=>new Proxy({}, {get:(_target,key)=>key==='then'?undefined:key==='__esModule'?true:()=>React.createElement('i',{'aria-hidden':true}),has:()=>true}));
vi.mock('react-native-safe-area-context',()=>({SafeAreaView:({children}:{children:React.ReactNode})=>React.createElement('header',null,children)}));
vi.mock('expo-router',()=>({usePathname:()=>h.path,useRouter:()=>({push:h.push})}));
vi.mock('../../../auth/auth.module',()=>({AuthModule:{getController:()=>({subscribe:()=>()=>{},getSnapshot:()=>({user:null})})}}));
vi.mock('../../../store/useDiscoveryStore',()=>({useDiscoveryStore:Object.assign((select:(state:{busy:boolean})=>unknown)=>select({busy:false}),{getState:()=>({playRandom:h.random})})}));
vi.mock('../../../design/useReducedMotion',()=>({useReducedMotion:()=>true}));
vi.mock('../../../design/BrandLogo',()=>({BrandLogo:()=>React.createElement('img',{alt:'Existing Fav Music logo'})}));
vi.mock('../ui',()=>({colors:{},ui:{},IconButton:({label,onPress}:{label:string;onPress:()=>void})=>{h.buttons.set(label,{style:null,onPress});return React.createElement('button',{'aria-label':label});}}));
import { AppHeader, accountNavigation } from '../AppHeader';
const render=()=>renderToStaticMarkup(<AppHeader />);
beforeEach(()=>{vi.clearAllMocks();h.path='/';h.open=false;h.buttons.clear();});
describe('Home header cleanup (mocked native rendering; no authenticated session)',()=>{
 it('removes only the Home logo frame while retaining its actual logo and touch target',()=>{
  const html=render(),mark=h.buttons.get('Open Fav Music navigation')!,style=mark.style as [{minWidth:number;minHeight:number},object];expect(style[0]).toMatchObject({minWidth:44,minHeight:44});expect(style[1]).toEqual({backgroundColor:'transparent',borderWidth:0,borderRadius:0});expect(html).toContain('Existing Fav Music logo');
  mark.onPress();expect(h.open).toBe(true);expect(h.push).not.toHaveBeenCalled();
 });
 it('keeps the shared header presentation on other screens unchanged',()=>{
  h.path='/search';render();expect((h.buttons.get('Open Fav Music navigation')!.style as unknown[])[1]).toBe(false);
 });
 it('removes Your space and its heading gap without removing any menu route or action',()=>{
  h.open=true;const html=render().replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&');expect(html).not.toContain('Your space');for(const item of accountNavigation)expect(html).toContain(item.title);expect(html).toContain('Play something for this moment');
 });
 it('preserves Search/Profile actions, accessible labels and hidden full-player header',()=>{
  render();h.buttons.get('Open search')!.onPress();expect(h.push).toHaveBeenLastCalledWith('/search');h.buttons.get('Open your account')!.onPress();expect(h.push).toHaveBeenLastCalledWith('/profile');expect(h.random).not.toHaveBeenCalled();
  h.path='/player';expect(render()).toBe('');
 });
});
