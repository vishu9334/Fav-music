import {describe,it,expect} from 'vitest';
import {instaMusRows} from '../instamus-rows';
import {historyRows} from '../history-rows';
import {ScrollInteraction,ListPositions} from '../scroll-interaction';
describe('scroll and explicit-press boundary',()=>{
 it('rejects drag, momentum and release presses without queuing a delayed action',()=>{
  let now=0;const interaction=new ScrollInteraction(()=>now);expect(interaction.allowPress()).toBe(true);
  interaction.beginDrag();expect(interaction.allowPress()).toBe(false);interaction.endDrag();expect(interaction.allowPress()).toBe(false);
  interaction.beginMomentum();now=1000;expect(interaction.allowPress()).toBe(false);interaction.endMomentum();now=1179;expect(interaction.allowPress()).toBe(false);now=1180;expect(interaction.allowPress()).toBe(true);
 });
 it('retains separate bounded page/filter positions and rejects invalid offsets',()=>{
  const positions=new ListPositions();positions.set('Search:A',420);positions.set('Search:B',90);expect(positions.get('Search:A')).toBe(420);
  positions.set('Search:A',NaN);positions.set('Search:A',-1);expect(positions.get('Search:A')).toBe(420);
  for(let i=0;i<40;i++)positions.set(String(i),i*10);expect(positions.get('0')).toBe(0);expect(positions.get('39')).toBe(390);
 });
});

describe('history row identity',()=>{
 it('keeps song keys when timestamps/order change and collapses duplicate history entries',()=>{
  const entries=[{trackId:'one',playedAt:10},{trackId:'two',playedAt:9}],before=historyRows(entries),after=historyRows([{trackId:'three',playedAt:11},...entries]);expect(after.slice(1).map(row=>row.key)).toEqual(before.map(row=>row.key));
  const duplicates=historyRows([entries[0]!,entries[0]!]);expect(duplicates).toHaveLength(1);expect(duplicates[0]?.key).toBe('one');expect(historyRows([{trackId:'one',playedAt:99}])[0]?.key).toBe(before[0]?.key);
 });
});

describe('virtualized InstaMus row identity',()=>{
 it('keeps results as bounded-batch FlatList data rather than mounting them all in its header',()=>{
  const tracks=Array.from({length:500},(_,i)=>({id:String(i),title:'Test-only row',artist:'Test',duration:20,url:'',artwork:''}));
  const rows=instaMusRows([...tracks,tracks[0]!],[]);expect(rows).toHaveLength(502);expect(rows.filter(row=>row.kind==='match')).toHaveLength(500);expect(new Set(rows.map(row=>row.key)).size).toBe(rows.length);
  expect(rows[0]?.kind).toBe('match');expect(rows.at(-1)?.kind).toBe('heading');
 });
});
