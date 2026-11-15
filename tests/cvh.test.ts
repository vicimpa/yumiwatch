import { describe,expect,it } from 'vitest';
import { cvhEpisodeMatches,selectCvhItem } from '../shared/cvh.mjs';
describe('CVH film and episode numbering',()=>{
 it('accepts missing episode numbers only for the first entry of a film',()=>{
  expect(cvhEpisodeMatches({isSerial:false},{},'1')).toBe(true);
  expect(cvhEpisodeMatches({isSerial:false},{episode:null},1)).toBe(true);
  expect(cvhEpisodeMatches({isSerial:false},{},2)).toBe(false);
  expect(cvhEpisodeMatches({isSerial:true},{},1)).toBe(false);
  expect(cvhEpisodeMatches({},{},1)).toBe(false);
 });
 it('matches numeric and string episode numbers without replacing explicit numbering',()=>{
  expect(cvhEpisodeMatches({isSerial:true},{episode:'3'},3)).toBe(true);
  expect(cvhEpisodeMatches({isSerial:false},{episode:2},1)).toBe(false);
  expect(cvhEpisodeMatches({isSerial:false},{episode:''},1)).toBe(false);
 });
 it('keeps the new AniLibria dub separate from its older voice-over',()=>{
  const dubbed={episode:1,voiceStudio:'AniLiberty',voiceType:'Дубляж',vkId:1};
  const voiced={episode:1,voiceStudio:'AniLibria',voiceType:'Многоголосый',vkId:2};
  const playlist={isSerial:true,items:[dubbed,voiced]};
  expect(selectCvhItem(playlist,'Дубляж AniLibria',1,'AniLiberty')).toBe(dubbed);
  expect(selectCvhItem(playlist,'Озвучка AniLibria',1,'AniLibria')).toBe(voiced);
  expect(selectCvhItem(playlist,'Озвучка AniLibria',1)).toBe(voiced);
  expect(selectCvhItem({...playlist,items:[voiced]},'Дубляж AniLibria',1,'AniLiberty')).toBeUndefined();
 });
});
