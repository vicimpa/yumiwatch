// Keep the user's speed separate from Shaka's effective rate (0 while buffering)
// and the temporary correction used by the muted quality-switch decoder.
type RateEngine = { trickPlay: (rate:number, useTrickPlayTrack?:boolean)=>void };
const rates = new WeakMap<HTMLMediaElement, { rate:number; temporary?:number; engine?:RateEngine }>();
export const PLAYBACK_RATE_EVENT = 'yumiwatch:playback-rate';
export function selectedPlaybackRate(video:HTMLMediaElement) {
  return rates.get(video)?.rate ?? (video.playbackRate > 0 ? video.playbackRate : video.defaultPlaybackRate || 1);
}
function apply(video:HTMLMediaElement) {
  const state=rates.get(video)!;
  const rate=state.temporary ?? state.rate;
  if(state.engine)state.engine.trickPlay(rate,false);
  else if(video.playbackRate!==rate)video.playbackRate=rate;
}
export function setPlaybackRate(video:HTMLMediaElement, rate:number) {
  if(!Number.isFinite(rate)||rate<.5||rate>2)return;
  const state=rates.get(video) ?? {rate};
  state.rate=rate;delete state.temporary;rates.set(video,state);
  if(video.defaultPlaybackRate!==rate)video.defaultPlaybackRate=rate;
  apply(video);
  video.dispatchEvent(new Event(PLAYBACK_RATE_EVENT));
}
export function setTemporaryPlaybackRate(video:HTMLMediaElement, rate:number) {
  const state=rates.get(video) ?? {rate:selectedPlaybackRate(video)};
  if(state.temporary===rate)return;
  state.temporary=rate;rates.set(video,state);apply(video);
}
export function bindPlaybackRate(video:HTMLMediaElement, engine?:RateEngine) {
  // Native playback needs no adapter until the user explicitly selects a rate.
  if(!engine&&!rates.has(video))return ()=>{};
  const state=rates.get(video) ?? {rate:selectedPlaybackRate(video)};
  state.engine=engine;rates.set(video,state);
  if(video.defaultPlaybackRate!==state.rate)video.defaultPlaybackRate=state.rate;
  apply(video);
  return ()=>{if(rates.get(video)===state)delete state.engine;};
}
