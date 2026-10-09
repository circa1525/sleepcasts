'use strict';
const $ = s => document.querySelector(s);
const audio = $('#audio');
let stories = [], cur = null, mode = 'story';   // mode: 'story' | 'outro'
let timer = { kind: 'end', deadline: 0, fading: false };
const fmt = s => { s = Math.max(0, Math.floor(s)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };
const narrLabel = s => (s.narrator === 'female' ? 'Female' : 'Male') + ' narrator';
const posKey = id => 'pos2:' + id;   // v2 audio is longer; old saved positions no longer apply
const getPos = id => parseFloat(localStorage.getItem(posKey(id)) || '0');
const setPos = (id, t) => localStorage.setItem(posKey(id), String(Math.round(t)));

// iOS ignores audio.volume (read-only). Detect so we can use the ambient outro fade instead.
const volumeWorks = (() => { try { const a = new Audio(); a.volume = 0.5; return Math.abs(a.volume - 0.5) < 0.01; } catch (e) { return false; } })();

async function init() {
  stories = await (await fetch('data/stories.json')).json();
  const list = $('#list');
  for (const s of stories) {
    const b = document.createElement('button');
    b.className = 'card'; b.dataset.id = s.id;
    b.innerHTML = `<img src="${s.art}" alt=""><div><h2>${s.title}</h2><div class="narr ${s.narrator}">${narrLabel(s)}</div><p>${s.desc}</p><div class="meta"></div></div>`;
    b.onclick = () => choose(s, true);
    list.appendChild(b);
  }
  refreshMeta();
  const last = localStorage.getItem('last');
  const s = stories.find(x => x.id === last);
  if (s) choose(s, false);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
}
function refreshMeta() {
  document.querySelectorAll('.card').forEach(c => {
    const s = stories.find(x => x.id === c.dataset.id), p = getPos(s.id);
    c.querySelector('.meta').textContent = `${Math.round(s.duration / 60)} min` + (p > 20 ? ` · resume at ${fmt(p)}` : '');
    c.classList.toggle('active', cur && cur.id === s.id);
  });
}
function loadStory(s, at) {
  mode = 'story';
  audio.src = s.audio;
  audio.addEventListener('loadedmetadata', () => { try { audio.currentTime = at; } catch (e) {} }, { once: true });
  audio.load();
}
function choose(s, autoplay) {
  if (cur && cur.id === s.id && mode === 'story') { if (autoplay) toggle(); return; }
  if (cur && mode === 'story' && audio.currentTime > 0) setPos(cur.id, audio.currentTime);
  cur = s; localStorage.setItem('last', s.id);
  $('#player').hidden = false; $('#mini-title').textContent = s.title; $('#mini-art').src = s.art; applyCollapsed();
  $('#np-title').textContent = s.title; $('#np-narr').textContent = narrLabel(s); $('#np-art').src = s.art;
  loadStory(s, getPos(s.id));
  setMedia(); refreshMeta(); updateUI();
  if (autoplay) play();
}
function setMedia() {
  if (!('mediaSession' in navigator) || !cur) return;
  const abs = u => new URL(u, location.href).href;
  navigator.mediaSession.metadata = new MediaMetadata({ title: cur.title, artist: 'Sleepcasts · ' + narrLabel(cur), album: 'Sleepcasts',
    artwork: [{ src: abs(cur.art512), sizes: '512x512', type: 'image/png' }, { src: abs(cur.art), sizes: '256x256', type: 'image/png' }] });
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', play); ms.setActionHandler('pause', pause);
  ms.setActionHandler('seekbackward', () => back(15));
  try { ms.setActionHandler('seekforward', null); ms.setActionHandler('previoustrack', null); ms.setActionHandler('nexttrack', null); } catch (e) {}
  try { ms.setActionHandler('seekto', d => { if (mode === 'story') audio.currentTime = d.seekTime; }); } catch (e) {}
}
function play() {
  if (!cur) return;
  if (mode === 'outro') { loadStory(cur, getPos(cur.id)); }
  if (timer.kind !== 'end' && !timer.deadline) startTimer(timer.kind);
  audio.volume = 1; audio.play().catch(() => {});
}
function pause() { audio.pause(); }
function toggle() { audio.paused ? play() : pause(); }
function back(n) { if (mode === 'story') audio.currentTime = Math.max(0, audio.currentTime - n); }

function startTimer(kind) {
  timer = { kind, deadline: kind === 'end' ? 0 : Date.now() + kind * 60000, fading: false };
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.t === String(kind)));
  updateUI();
}
function checkTimer() {
  if (!timer.deadline || timer.fading || mode !== 'story' || audio.paused) return;
  if (Date.now() < timer.deadline) return;
  if (volumeWorks) { volumeFade(); return; }
  // iOS: wait for the voice to finish its sentence, then hand over to a 75 s ambient fade-out.
  const t = audio.currentTime;
  const inSentence = cur.sentences.some(([a, b]) => t >= a - 0.15 && t < b + 0.3);
  if (!inSentence || Date.now() > timer.deadline + 30000) startOutro();
}
function volumeFade() {
  timer.fading = true; const t0 = Date.now(), D = 60000;
  const step = () => {
    const k = Math.min(1, (Date.now() - t0) / D);
    audio.volume = Math.max(0, Math.pow(1 - k, 2));
    if (k < 1 && !audio.paused) setTimeout(step, 250);
    else { setPos(cur.id, audio.currentTime); audio.pause(); audio.volume = 1; endTimer(); }
  };
  step();
}
function startOutro() {
  timer.fading = true; setPos(cur.id, audio.currentTime);
  mode = 'outro'; audio.src = cur.outro; audio.load(); audio.play().catch(() => {});
}
function endTimer() { timer.deadline = 0; timer.fading = false; updateUI(); }

audio.addEventListener('timeupdate', () => {
  if (mode === 'story' && cur) {
    if (Math.floor(audio.currentTime) % 5 === 0) setPos(cur.id, audio.currentTime);
    checkTimer();
  }
  updateUI();
});
audio.addEventListener('pause', () => { if (cur && mode === 'story') setPos(cur.id, audio.currentTime); refreshMeta(); updateUI(); });
audio.addEventListener('play', updateUI);
audio.addEventListener('ended', () => {
  if (mode === 'outro') { endTimer(); loadStory(cur, getPos(cur.id)); }
  else { setPos(cur.id, 0); endTimer(); }
  refreshMeta(); updateUI();
});
setInterval(checkTimer, 1000);

function updateUI() {
  if (!cur) return;
  const playing = !audio.paused;
  for (const id of ['#play', '#mini-play']) { $(id).textContent = playing ? '❚❚' : '▶'; $(id).setAttribute('aria-label', playing ? 'Pause' : 'Play'); }
  const d = cur.duration, t = mode === 'story' ? audio.currentTime : getPos(cur.id);
  $('#np-time').textContent = mode === 'outro' ? 'Fading out…' : `${fmt(t)} / ${fmt(d)}`;
  if (!seeking) $('#seek').value = Math.round(1000 * t / d);
  $('#mini-prog div').style.width = (100 * Math.min(1, t / d)).toFixed(2) + '%';
  $('#mini-sub').textContent = narrLabel(cur) + ' · ' + (mode === 'outro' ? 'Fading out…' : `${fmt(t)} / ${fmt(d)}`);
  $('#timer-left').textContent = timer.deadline ? (timer.fading ? 'Fading out…' : `Stops in ${fmt((timer.deadline - Date.now()) / 1000)}` + (audio.paused ? ' (starts counting on play)' : ''))
    : (timer.kind !== 'end' ? `${timer.kind} min timer starts when you press play` : 'Plays to the end. The ambience fades out slowly after the story.');
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
}
let seeking = false;
$('#seek').addEventListener('input', () => { seeking = true; });
$('#seek').addEventListener('change', () => { seeking = false; if (cur && mode === 'story') audio.currentTime = $('#seek').value / 1000 * cur.duration; });
$('#play').onclick = toggle;
$('#mini-play').onclick = toggle;

// ---- collapsible player: mini bar <-> full player; state remembered ----
let collapsed = localStorage.getItem('playerCollapsed') === '1';
const player = $('#player');
function setPad() {   // keep the last card reachable above the player (+ home indicator, already inside the player's height)
  const h = player.hidden ? 0 : player.getBoundingClientRect().height;
  document.body.style.setProperty('--pb', (collapsed ? h + 16 : (player.hidden ? 24 : Math.min(h, innerHeight * 0.6) + 16)) + 'px');
}
function applyCollapsed() { player.classList.toggle('collapsed', collapsed); requestAnimationFrame(setPad); }
function setCollapsed(c) { collapsed = c; localStorage.setItem('playerCollapsed', c ? '1' : '0'); lastY = scrollY; applyCollapsed(); }
$('#collapse').onclick = () => setCollapsed(true);
$('#mini-open').onclick = () => setCollapsed(false);
$('#mini-expand').onclick = () => setCollapsed(false);
// scrolling the story list minimizes the full player
let lastY = scrollY;
addEventListener('scroll', () => { if (!collapsed && !player.hidden && Math.abs(scrollY - lastY) > 40) setCollapsed(true); }, { passive: true });
// swipe down on the full player (when it is scrolled to its top) minimizes it; swipe up on the mini bar expands
let ty = null;
$('#full').addEventListener('touchstart', e => { ty = $('#full').scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
$('#full').addEventListener('touchend', e => { if (ty !== null && e.changedTouches[0].clientY - ty > 60) setCollapsed(true); ty = null; }, { passive: true });
$('#mini').addEventListener('touchstart', e => { ty = e.touches[0].clientY; }, { passive: true });
$('#mini').addEventListener('touchend', e => { if (ty !== null && ty - e.changedTouches[0].clientY > 40) setCollapsed(false); ty = null; }, { passive: true });
if ('ResizeObserver' in window) new ResizeObserver(setPad).observe(player);
addEventListener('resize', setPad);
$('#back').onclick = () => back(15);
$('#restart').onclick = () => { if (!cur) return; if (mode === 'outro') loadStory(cur, 0); else audio.currentTime = 0; setPos(cur.id, 0); play(); };
document.querySelectorAll('.chip').forEach(c => c.onclick = () => {
  const k = c.dataset.t === 'end' ? 'end' : parseInt(c.dataset.t, 10);
  startTimer(k);
  if (k !== 'end' && audio.paused) timer.deadline = 0;   // counts from when playback starts
});
init();
