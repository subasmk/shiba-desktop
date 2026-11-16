// Hidden YouTube player page. This window is never shown - only the audio
// is heard. Playback runs through the official YouTube IFrame API; main
// drives it via window.__rexMusic (commands issued before the API is ready
// are queued here and flushed on ready). Player state flows back to main
// as 'music-event' sends through the app preload: ready / playing /
// paused / ended / error. Nothing else runs in this page.
let player = null, apiReady = false;
const pending = [];
function sendEvt(type, data) { try { window.petAPI.send('music-event', Object.assign({ type }, data || {})); } catch { /* preload gone */ } }
function whenReady(fn) { if (apiReady && player) fn(); else pending.push(fn); }
window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player('player', {
    width: '320', height: '180',
    playerVars: { autoplay: 0, controls: 0, disablekb: 1, iv_load_policy: 3, modestbranding: 1, playsinline: 1, rel: 0 },
    events: {
      onReady: () => { apiReady = true; sendEvt('ready'); for (const fn of pending.splice(0)) { try { fn(); } catch { /* one bad command must not block the rest */ } } },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.ENDED) sendEvt('ended');
        else if (e.data === YT.PlayerState.PLAYING) sendEvt('playing');
        else if (e.data === YT.PlayerState.PAUSED) sendEvt('paused');
      },
      onError: (e) => sendEvt('error', { code: e && e.data }),
    },
  });
};
window.__rexMusic = {
  loadVideo(id) { whenReady(() => player.loadVideoById(id)); },
  loadPlaylist(id) { whenReady(() => player.loadPlaylist({ list: id, listType: 'playlist' })); },
  play() { whenReady(() => player.playVideo()); },
  pause() { whenReady(() => player.pauseVideo()); },
  stop() { whenReady(() => player.stopVideo()); },
  nextInPlaylist() { whenReady(() => player.nextVideo()); },
  prevInPlaylist() { whenReady(() => player.previousVideo()); },
  setVolume(v) { whenReady(() => player.setVolume(Math.max(0, Math.min(100, v | 0)))); },
};
const tag = document.createElement('script');
tag.src = 'https://www.youtube.com/iframe_api';
document.head.appendChild(tag);
