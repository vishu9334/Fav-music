import {describe,it,expect,vi} from 'vitest';
import {DemoCatalog,type CatalogEntry} from '../demo-catalog';
const entries:CatalogEntry[]=['a','b','c'].map(id=>({track:{id,title:id,artist:'Test fixture',duration:20,url:'',artwork:'',catalogSource:'catalog'},seasons:[],moods:['Calm']}));
describe('stable metadata publication',()=>{
 it('retains order/references and emits nothing for unchanged cached metadata',()=>{const registry=new DemoCatalog(entries),changed=vi.fn();registry.subscribe(changed);const before=registry.get('a');registry.upsert([{...entries[0]!,track:{...entries[0]!.track},moods:['Calm'],seasons:[]}]);expect(registry.tracks().map(t=>t.id)).toEqual(['a','b','c']);expect(registry.get('a')).toBe(before);expect(changed).not.toHaveBeenCalled();});
 it('updates a thumbnail in place without reordering other rows',()=>{const registry=new DemoCatalog(entries);registry.upsert([{...entries[0]!,track:{...entries[0]!.track,artwork:'new-image'}}]);expect(registry.tracks().map(t=>t.id)).toEqual(['a','b','c']);expect(registry.get('b')).toBe(entries[1]!.track);});
});
