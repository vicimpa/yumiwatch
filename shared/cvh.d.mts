export function cvhEpisodeMatches(playlist:{isSerial?:boolean},item:{episode?:number|string|null},episode:number|string):boolean;
interface CvhItem {episode?:number|string|null;voiceStudio?:string;voiceType?:string;vkId?:number|string}
export function selectCvhItem<T extends CvhItem>(playlist:{isSerial?:boolean;items?:T[]},dubbing:string,episode:number|string,dubbingCode?:string|null):T|undefined;
