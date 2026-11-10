import { describe, expect, it } from 'vitest';
import { CommonActions, TabRouter } from '@react-navigation/routers';
import { activeBottomTab, bottomTabNames, bottomTabPath, bottomTabTarget, compactDock, tabHighlightX, TabPressIntent, type BottomTabName } from '../bottom-navigation';

describe('bottom navigation selection and intent', () => {
  it('uses the current pathname for every existing tab without renaming routes', () => {
    for (const name of bottomTabNames) expect(activeBottomTab(bottomTabPath(name))).toBe(name);
  });
  it('retains the real underlying tab on secondary screens and follows account/navigation resets', () => {
    const routes = bottomTabNames.map(name => ({ name }));
    for (let index = 0; index < routes.length; index++) {
      const root = { index: 1, routes: [{ name: '(tabs)', state: { index, routes } }, { name: 'collection' }] };
      expect(activeBottomTab('/collection', root)).toBe(bottomTabNames[index]);
      expect(activeBottomTab('/search', root)).toBe('search');
    }
    expect(activeBottomTab('/profile', {routes:[{name:'login'}]})).toBeNull();
    expect(activeBottomTab('/profile')).toBeNull();
  });
  it('rejects accidental repeated presses while allowing the latest different tab immediately', () => {
    let now = 0; const intent = new TabPressIntent(() => now);
    expect(intent.allow('search')).toBe(true); expect(intent.allow('search')).toBe(false);
    expect(intent.allow('library')).toBe(true); expect(intent.allow('warehouse')).toBe(true);
    now = 239; expect(intent.allow('warehouse')).toBe(false);
    now = 240; expect(intent.allow('warehouse')).toBe(true);
  });
  it('centers the same compact highlight in all slots after resize', () => {
    for (const width of [280, 320, 412, 700]) {
      const cell = (width - 8) / 4;
      for (let index = 0; index < 4; index++) expect(tabHighlightX(width, 4, index) + 22).toBeCloseTo(4 + cell * (index + 0.5));
    }
  });
  it('uses safe-area-adjusted landscape space and retains vertical flow for large fonts/narrow windows', () => {
    expect(compactDock(740, 360, 1, 32, 32)).toBe(true);
    expect(compactDock(600, 360, 1, 32, 32)).toBe(false);
    expect(compactDock(740, 360, 1.5, 0, 0)).toBe(false);
    expect(compactDock(320, 640, 1, 0, 0)).toBe(false);
  });
});

describe('installed tab-router state preservation contract', () => {
  it('switches among the four tabs without recreating route keys, nested state or saved params', () => {
    const router = TabRouter({backBehavior:'history'}), options = {routeNames:[...bottomTabNames],routeParamList:{},routeGetIdList:{}};
    let state = router.getInitialState(options);
    const searchState = { stale:false as const, type:'stack', key:'search-stack', index:0, routeNames:['results'], routes:[{key:'results-key',name:'results',params:{query:'Believer',scrollOffset:420}}] };
    state = {...state, routes:state.routes.map(route => route.name === 'search' ? {...route,params:{query:'Believer'},state:searchState} : route)};
    const keys = state.routes.map(route => route.key);
    for (const name of ['search','library','warehouse','index','search'] as BottomTabName[]) {
      const target = bottomTabTarget(name,{routes:[{name:'(tabs)',state}]});
      const next = router.getStateForAction(state, CommonActions.navigate(name,typeof target==='string'?undefined:target.params), options)!;
      state = router.getRehydratedState(next, options);
      expect(state.routes.map(route => route.key)).toEqual(keys);
      expect(state.routes.find(route => route.name === 'search')?.state).toBe(searchState);
      expect(state.routes.find(route => route.name === 'search')?.params).toEqual({query:'Believer'});
      expect(state.routes[state.index]?.name).toBe(name);
    }
  });
});
