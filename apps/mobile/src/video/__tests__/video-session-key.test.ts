import {describe,it,expect} from 'vitest';
import {videoSessionKey} from '../video-session-key';
import type {VideoItem} from '../video.contract';
const item:VideoItem={id:'video-1',title:'Test-only original clip',description:'Synthetic pattern',source:{kind:'asset',asset:1},poster:{uri:'old'}};
describe('stable native video session identity',()=>{
 it('retains native session identity for new arrays and artwork/title-only updates',()=>{expect(videoSessionKey([{...item,title:'Updated metadata',poster:{uri:'new'}}])).toBe(videoSessionKey([item]));});
 it('treats attribution updates as metadata rather than creating a second decoder',()=>{const catalog:VideoItem={...item,source:{kind:'catalog',trackId:item.id,attribution:'Original credit'}};expect(videoSessionKey([{...catalog,source:{kind:'catalog',trackId:item.id,attribution:'Updated credit'}}])).toBe(videoSessionKey([catalog]));});
 it('reinitializes for an actual source or ordered queue change',()=>{expect(videoSessionKey([{...item,id:'video-2'}])).not.toBe(videoSessionKey([item]));expect(videoSessionKey([{...item,source:{kind:'asset',asset:2}}])).not.toBe(videoSessionKey([item]));});
 it('retains session key for local video items with stable URI and updates metadata',()=>{const local:VideoItem={...item,source:{kind:'local',uri:'file:///media/song.mp4',resolution:'1080p'}};expect(videoSessionKey([{...local,title:'Updated'}])).toBe(videoSessionKey([local]));expect(videoSessionKey([{...local,source:{kind:'local',uri:'file:///media/other.mp4'}}])).not.toBe(videoSessionKey([local]));});
});
