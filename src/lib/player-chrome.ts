export const PLAYER_CHROME_EVENT='yumiwatch:player-chrome';
export function playerChromeVisible(){return document.documentElement.dataset.playerChrome!=='hidden';}
export function setPlayerChrome(visible:boolean){
 document.documentElement.dataset.playerChrome=visible?'visible':'hidden';
 window.dispatchEvent(new Event(PLAYER_CHROME_EVENT));
}
export function resetPlayerChrome(){delete document.documentElement.dataset.playerChrome;window.dispatchEvent(new Event(PLAYER_CHROME_EVENT));}
