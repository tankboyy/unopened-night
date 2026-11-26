import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { loadAvatar, loadCrowdAvatars, PERFORMER_AVATAR_ID } from './avatars.js';
import { CAMERA_VIEWS, createCameraRig } from './camera-rig.js';
import type { CameraView } from './camera-rig.js';
import { performerStateInSong } from './choreography.js';
import type { PerformerMotion } from './choreography.js';
import { createCrowd } from './crowd.js';
import { createMusicPlayer } from './music.js';
import { createPerformer } from './performer.js';
import { DON_TOLIVER_BODY, loadBodyModel, POST_MALONE_BODY } from './performer-body-model.js';
import type { BodySpec } from './performer-body-model.js';
import { DON_TOLIVER_HEAD, loadHeadModel, POST_MALONE_HEAD } from './performer-head-model.js';
import type { HeadSpec } from './performer-head-model.js';
import type { Performer } from './performer.js';
import { createDjBooth } from './dj.js';
import { createScrollStory } from './scroll-story.js';
import { ARTIST_NAMES, MAIN_START_INDEX, SET_START_CLOCK_MIN, SETLIST } from './setlist.js';
import type { Artist } from './setlist.js';
import {
  FAR_CROWD_DESKTOP, FAR_CROWD_MOBILE, MOBILE_BREAKPOINT_PX, NEAR_CROWD_DESKTOP, NEAR_CROWD_MOBILE, PERFORMER_HEIGHT_M, SCRUB_SETTLE_MS,
  SIL_CROWD_DESKTOP, SIL_CROWD_MOBILE, STAGE_HEIGHT_M,
} from './show.constants.js';
import { animatePhoneLights, buildStadium, makeGlowTexture } from './stadium.js';
import { createStageFx } from './stage-fx.js';
import { buildStageSet } from './stage-set.js';
import { createPyro } from './pyro.js';
import { createBand } from './band.js';
import { createImag } from './imag.js';
import { createSmash } from './smash.js';
import { createTicketShare, drawTicket } from './ticket-card.js';
import { FX_LAYER, SCREEN_LAYER, toFxLayer } from './layers.js';
import { setupTicket } from './ticket.js';
import { fractionAt, timelineAt, timelineTotalSec } from './timeline.js';
import { createScrubMeter } from './scrub.js';
import { createVideoWall } from './video-wall.js';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`[main] missing element ${sel}`);
  return el;
};

// ─── 렌더러·장면 ───
const canvas = $<HTMLCanvasElement>('#gl');
// alpha: 영상 벽 자리에 투명한 구멍을 뚫어 캔버스 뒤 YouTube 층이 비치게 한다(video-wall.ts)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
/** 폰: 장면을 세 번(중계·마스크·본 화면) 그리므로 해상도·주기를 낮춘다 */
const MOBILE = innerWidth < MOBILE_BREAKPOINT_PX;
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#05060a');
// 연무: 가까운 곳부터 옅게 깔아 빔과 원경이 공기에 묻히게 한다
scene.fog = new THREE.Fog('#05060a', 70, 300);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 800);
camera.layers.enable(FX_LAYER);
camera.layers.enable(SCREEN_LAYER);

const ambient = new THREE.AmbientLight('#8890b0', 0.12);
const hemi = new THREE.HemisphereLight('#fff6e8', '#20222c', 0);
// 관객 얼굴이 완전히 묻히지 않게 무대 쪽에서 오는 약한 역광
const stageGlow = new THREE.DirectionalLight('#9fb0ff', 0.35);
stageGlow.position.set(0, 20, -60);
scene.add(ambient, hemi, stageGlow);

const glow = makeGlowTexture();
const stadium = buildStadium(glow);
scene.add(stadium.group);
const stageSet = buildStageSet();
scene.add(stageSet.group);
const fx = createStageFx(stageSet.fixtureSpots);
scene.add(fx.group);
const pyro = createPyro(stageSet.pyroSpots, stageSet.sparkCurtain);
toFxLayer(pyro.group);
scene.add(pyro.group);
toFxLayer(stadium.standLights);
const imag = createImag(MOBILE ? 3 : 2);
scene.add(imag.group);
const smash = createSmash(canvas, (e) => {
  pyro.burstAt(e.at, Math.min(1.6, e.speed / 7));
  rig.shake(Math.min(1, e.speed / 10));
});
scene.add(smash.group);

// 블룸이 LED 벽·빔·폰 불빛을 번지게 해 "공연장 사진" 질감을 만든다. 문턱값을 낮추면 관객 실루엣까지 뿌옇게 뜬다
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.85, 0.35, 0.62));
composer.addPass(new OutputPass());

const videoWall = createVideoWall(MOBILE ? 0.35 : 0.5);
scene.add(videoWall.holeMesh);
composer.addPass(videoWall.compositePass);

function resize(): void {
  renderer.setSize(innerWidth, innerHeight, false);
  videoWall.resize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  pyro.setViewport(innerHeight, camera.fov);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ─── 카메라 ───
const rig = createCameraRig(camera, canvas);
const setView = (view: CameraView): void => {
  rig.setView(view);
  document.querySelectorAll<HTMLButtonElement>('[data-cam]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cam === view)));
};
document.querySelectorAll<HTMLButtonElement>('[data-cam]').forEach((b) => {
  b.addEventListener('click', () => {
    const v = b.dataset.cam as CameraView;
    if ((CAMERA_VIEWS as readonly string[]).includes(v)) setView(v);
  });
});

// ─── 기타 부수기 ───
const smashBtn = $<HTMLButtonElement>('#smashBtn');
const smashHint = $('#smashHint');
function setSmash(on: boolean): void {
  if (on) {
    smash.start();
    setView('smash');
  } else {
    smash.stop();
    setView('stand');
  }
  // 기타를 잡고 휘두르는 동안 캔버스 끌기는 기타 몫 — 시점 조작을 끈다
  rig.setControlsEnabled(!on && document.body.dataset.phase === 'show');
  smashBtn.setAttribute('aria-pressed', String(on));
  smashBtn.textContent = on ? '그만하기' : '🎸 기타 부수기';
  smashHint.hidden = !on;
}
smashBtn.addEventListener('click', () => setSmash(!smash.active()));

// ─── 이야기·티켓 ───
const story = createScrollStory();
setupTicket($('#ticket'), $('#stamp'), $('#ticketStatus'));

// ─── 공유 티켓(마지막 장면) ───
const ticketShare = createTicketShare();
const siteUrl = `${location.origin}${location.pathname}`;
let ticketCard: HTMLCanvasElement | null = null;
/** 다음 프레임의 렌더 직후 캔버스를 복사한다 — WebGL 버퍼는 렌더 직후에만 읽을 수 있다(preserveDrawingBuffer 없이) */
let captureNext: ((c: HTMLCanvasElement) => void) | null = null;
$('#ticketForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $<HTMLInputElement>('#ticketName').value;
  captureNext = (shot) => {
    void drawTicket(shot, name, siteUrl).then((card) => {
      ticketCard = card;
      const img = $<HTMLImageElement>('#ticketPreview');
      img.src = card.toDataURL('image/png');
      img.hidden = false;
      $('#ticketActions').hidden = false;
    });
  };
});
$('#ticketShare').addEventListener('click', () => {
  if (!ticketCard) return;
  void ticketShare.share(ticketCard, siteUrl).then((how) => {
    $('#shareStatus').textContent = how === 'shared' ? '공유했어요.' : '이미지를 저장했고, 링크를 복사했어요.';
  }).catch((err: unknown) => {
    console.error('[main] ticket share failed', err);
    $('#shareStatus').textContent = '공유하지 못했어요. 이미지를 길게 눌러 저장해 주세요.';
  });
});

// ─── 세트리스트·음악 ───
/*
 * 공연 구간의 스크롤 위치 = 세트리스트 타임라인(timeline.ts).
 *  - 노래가 흐르는 동안에는 노래가 주인: 화면이 재생 위치를 따라 저절로 내려간다.
 *  - 방문자가 스크롤하면 스크롤이 주인: 소리를 멈추고 곡이 빨리감기처럼 넘어가다가,
 *    SCRUB_SETTLE_MS 동안 조용하면 멈춘 자리의 곡·위치부터 다시 튼다.
 *  - Congratulations 가 끝나면 마지막 장면(객석 조명)으로 내려간다.
 */
let songIndex = -1;
/** 방문자가 소리를 켠 상태인가 — 빨리감기가 끝나면 이 값으로 재생을 다시 시작할지 정한다 */
let playIntent = false;
/**
 * 플레이어에 마지막으로 걸어 둔(또는 재생을 요청한) 곡.
 * trap: 재생을 요청한 직후 영상이 로딩되는 몇 프레임 동안은 '멈춤' 상태라, 이 값을 갱신하지 않으면
 * '멈춰 있으면 스크롤 위치의 곡을 걸어 둔다' 분기가 끼어들어 시작 위치를 덮어쓰고 곡이 처음부터 나온다.
 */
let cuedIndex = 0;
const seekSong = (i: number, sec: number, play: boolean): void => {
  cuedIndex = i;
  music.seek(i, sec, play);
};
const music = createMusicPlayer(
  videoWall.mount,
  (ended) => {
    if (ended >= SETLIST.length - 1) {
      playIntent = false;
      scrollTo({ top: story.scrollYForFinale(), behavior: 'smooth' });
      return;
    }
    seekSong(ended + 1, 0, true);
  },
  // 지역 차단·삭제 등으로 재생할 수 없는 영상은 건너뛴다
  (failed) => {
    if (failed < SETLIST.length - 1) seekSong(failed + 1, 0, playIntent);
  },
);
// 개발 전용: 검사 스크립트에서 재생 상태를 읽는다
if (import.meta.env.DEV) Object.assign(window, { __music: music, __pyro: pyro });

// 우리가 직접 스크롤한 위치. 이와 다른 스크롤은 방문자가 한 것으로 본다(휠·터치·키·스크롤바 모두 잡힌다)
let programmaticY = -1;
let userScrollUntil = 0;
addEventListener('scroll', () => {
  if (Math.abs(scrollY - programmaticY) > 3) userScrollUntil = performance.now() + SCRUB_SETTLE_MS;
}, { passive: true });
const autoScrollTo = (y: number): void => {
  programmaticY = Math.round(y);
  scrollTo(0, programmaticY);
};

/*
 * 공연 구간에서는 휠·터치를 직접 받아 속도에 따라 빨리감기 배율을 바꾼다(scrub.ts).
 * 공연 구간의 처음에서 위로, 끝에서 아래로 굴릴 때만 평소 스크롤에 넘겨 앞뒤 장면으로 나간다.
 */
const scrub = createScrubMeter();
const ffBadge = $('.ff-badge');
function scrubBy(deltaPx: number): boolean {
  const frame = story.read();
  if (frame.phase !== 'show' || deltaPx === 0) return false;
  const total = timelineTotalSec();
  const now = performance.now();
  const cur = frame.showProgress * total;
  if ((cur <= 0.05 && deltaPx < 0) || (cur >= total - 0.05 && deltaPx > 0)) return false;
  const next = Math.max(0, Math.min(total, cur + scrub.step(deltaPx, now)));
  autoScrollTo(story.scrollYForShow(next / total));
  userScrollUntil = now + SCRUB_SETTLE_MS;
  // 한 프레임에 여러 칸이 몰리면 배율이 수천으로 튄다 — 읽을 수 있게 999 에서 자른다
  const rate = Math.min(999, Math.round(Math.abs(scrub.rate(now))));
  ffBadge.textContent = deltaPx < 0 ? `⏪ 되감기 ×${rate}` : `⏩ 빨리감기 ×${rate}`;
  return true;
}
addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) return; // 핀치 확대는 카메라 몫
  // 줄 단위(Firefox 일부)·쪽 단위 휠을 px 로 맞춘다
  const px = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
  if (scrubBy(px)) e.preventDefault();
}, { passive: false });
let touchY: number | null = null;
addEventListener('touchstart', (e) => { touchY = e.touches[0]?.clientY ?? null; }, { passive: true });
addEventListener('touchmove', (e) => {
  const y = e.touches[0]?.clientY;
  if (touchY === null || y === undefined) return;
  // 손가락을 위로 밀면(화면이 아래로) 앞으로 감기 — 휠과 같은 방향
  if (scrubBy((touchY - y) * 1.5)) e.preventDefault();
  touchY = y;
}, { passive: false });
addEventListener('touchend', () => { touchY = null; });

const listEl = $('#setlist');
const songItems = SETLIST.map((song, i) => {
  // 무대가 바뀌는 자리에 묶음 제목
  if (i === 0 || i === MAIN_START_INDEX) {
    const head = document.createElement('li');
    head.className = 'set-head';
    head.textContent = i === 0 ? `SPECIAL GUEST · ${ARTIST_NAMES['don-toliver'].toUpperCase()}` : ARTIST_NAMES['post-malone'].toUpperCase();
    listEl.appendChild(head);
  }
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = song.title;
  b.addEventListener('click', () => {
    autoScrollTo(story.scrollYForShow(fractionAt(i, 0)) + 1);
    seekSong(i, 0, playIntent);
  });
  li.appendChild(b);
  listEl.appendChild(li);
  return li;
});

// 포스트 말론 무대 문구를 그 무대가 시작하는 스크롤 자리에 둔다
$('#mainAct').style.top = `${fractionAt(MAIN_START_INDEX, 0) * 100}%`;

const playBtn = $<HTMLButtonElement>('#playBtn');
playBtn.addEventListener('click', () => {
  const ms = music.state();
  if (ms?.playing) {
    playIntent = false;
    music.pause();
    return;
  }
  playIntent = true;
  const p = timelineAt(story.read().showProgress);
  seekSong(p.songIndex, p.songTime, true);
});

const pad2 = (n: number): string => String(n).padStart(2, '0');
/** 무대 시각 — 게스트 20:00, 포스트 말론 21:20 부터 각자의 무대가 흐른 만큼(사이 무대 전환 시간은 스크롤에 넣지 않았다) */
function showClock(fraction: number): string {
  const p = timelineAt(fraction);
  const artist = SETLIST[p.songIndex].artist;
  const first = SETLIST.findIndex((s) => s.artist === artist);
  const before = fractionAt(p.songIndex, p.songTime) * timelineTotalSec() - fractionAt(first, 0) * timelineTotalSec();
  const min = SET_START_CLOCK_MIN[artist] + Math.floor(before / 60);
  return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
}

function showSong(i: number): void {
  songIndex = i;
  const song = SETLIST[i];
  songItems.forEach((li, k) => { li.className = k < i ? 'done' : k === i ? 'current' : ''; });
  // 36곡이라 패널이 넘친다 — 지금 곡이 패널 안에 보이게(페이지 스크롤은 건드리지 않게 패널만 움직인다)
  const panel = listEl.parentElement!;
  const cur = songItems[i];
  if (cur.offsetTop < panel.scrollTop || cur.offsetTop > panel.scrollTop + panel.clientHeight - 40) panel.scrollTop = cur.offsetTop - panel.clientHeight / 3;
  $('#nowSong').textContent = song.title;
  $('#nowFeat').textContent = `${ARTIST_NAMES[song.artist]}${song.feat ? ` · with ${song.feat}` : ''}`;
  const inSet = song.artist === 'don-toliver' ? i + 1 : i - MAIN_START_INDEX + 1;
  const setSize = song.artist === 'don-toliver' ? MAIN_START_INDEX : SETLIST.length - MAIN_START_INDEX;
  $('#songNo').textContent = `${song.artist === 'don-toliver' ? 'SPECIAL GUEST · ' : ''}${inSet} / ${setSize}`;
  imag.setTitle(song.title, song.feat);
  fx.setLook(song.look);
}

// ─── 부트 ───
async function boot(): Promise<void> {
  const loadingText = $('#loadingText');
  // 머리·몸 모델이 없어도 공연은 열린다 — 바탕 아바타·코드 캐리커처로 대신한다(비핵심)
  const head = (spec: HeadSpec) => loadHeadModel(spec).catch((err: unknown) => { console.warn('[main] head model unavailable', spec.glb, err); return null; });
  const body = (spec: BodySpec) => loadBodyModel(spec).catch((err: unknown) => { console.warn('[main] body model unavailable', spec.glb, err); return null; });
  // 공연자마다 바탕 아바타(뼈대)를 따로 불러온다 — 한 뼈대를 둘이 나눠 쓰면 동작이 섞인다
  const [pmAvatar, dtAvatar, crowdAvatars, pmHead, pmBody, dtHead, dtBody] = await Promise.all([
    loadAvatar(PERFORMER_AVATAR_ID),
    loadAvatar(PERFORMER_AVATAR_ID),
    loadCrowdAvatars(),
    head(POST_MALONE_HEAD), body(POST_MALONE_BODY), head(DON_TOLIVER_HEAD), body(DON_TOLIVER_BODY),
  ]);
  loadingText.textContent = '조명 맞추는 중…';

  const performers: Record<Artist, Performer> = {
    'post-malone': createPerformer(pmAvatar, pmHead, pmBody),
    'don-toliver': createPerformer(dtAvatar, dtHead, dtBody),
  };
  for (const p of Object.values(performers)) scene.add(p.root);
  const crowd = createCrowd(crowdAvatars, {
    nearCount: MOBILE ? NEAR_CROWD_MOBILE : NEAR_CROWD_DESKTOP,
    farCount: MOBILE ? FAR_CROWD_MOBILE : FAR_CROWD_DESKTOP,
    silhouetteCount: MOBILE ? SIL_CROWD_MOBILE : SIL_CROWD_DESKTOP,
    glow,
  });
  scene.add(crowd.group);
  const band = createBand(crowdAvatars);
  scene.add(band.group);
  const dj = createDjBooth(crowdAvatars[crowdAvatars.length - 1]);
  scene.add(dj.group);
  $('#loading').classList.add('done');

  // 개발 전용: ?pose=sing 처럼 주면 공연자를 중앙에 세우고 그 동작만 반복한다(자세 확인용). ?face=1 은 얼굴 근접
  const params = new URLSearchParams(location.search);
  const debugPose = import.meta.env.DEV ? (params.get('pose') as PerformerMotion | null) : null;

  const clock = new THREE.Clock();
  const focus = new THREE.Vector3();
  const face = new THREE.Vector3();
  let lastPhase = '';
  let wasScrubbing = false;
  let house = 0.4;
  let phones = 0;
  let stage = 0;

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const frame = story.read();
    if (debugPose) Object.assign(frame, { phase: 'show', house: 0, phones: 1, stage: 1, camera: null });

    if (frame.phase !== lastPhase) {
      document.body.dataset.phase = frame.phase;
      if (frame.phase === 'show') setView(debugPose && params.has('face') ? 'face' : debugPose ? 'close' : 'stand');
      if (frame.phase === 'lights') setView('empty');
      rig.setControlsEnabled(frame.phase === 'show' && !smash.active());
      if (frame.phase !== 'show' && smash.active()) setSmash(false);
      lastPhase = frame.phase;
    }
    // 스크롤 값으로 바로 바꾸면 휠 한 칸에 조명이 툭툭 끊긴다 — 짧게 따라가게 한다
    const k = Math.min(1, dt * 4);
    house += (frame.house - house) * k;
    phones += (frame.phones - phones) * k;
    stage += (frame.stage - stage) * k;
    if (frame.camera) rig.setPose(frame.camera);

    // ─── 타임라인: 노래가 흐르면 노래가, 방문자가 스크롤하면 스크롤이 주인 ───
    const scrubbing = performance.now() < userScrollUntil;
    const ms = music.state();
    if (ms?.playing && !scrubbing) playIntent = true;
    let pos = timelineAt(frame.showProgress);
    if (frame.phase === 'show') {
      if (scrubbing) {
        // 빨리감기 중에는 소리를 멈춘다 — 곡이 휙휙 넘어가는 동안 엉뚱한 소리가 나지 않게
        if (ms?.playing) music.pause();
      } else if (wasScrubbing && playIntent) {
        seekSong(pos.songIndex, pos.songTime, true);
      } else if (!ms?.playing && pos.songIndex !== cuedIndex) {
        // 멈춰 있을 때는 스크롤이 가리키는 곡을 플레이어에 걸어 둔다 — 영상 벽의 재생 버튼을 눌러도 그 곡부터 나오게
        seekSong(pos.songIndex, pos.songTime, false);
      } else if (ms?.playing) {
        cuedIndex = ms.songIndex;
        pos = { songIndex: ms.songIndex, songTime: ms.positionSec };
        const y = story.scrollYForShow(fractionAt(pos.songIndex, pos.songTime));
        if (Math.abs(y - scrollY) >= 1) autoScrollTo(y);
      }
    } else if (ms?.playing) {
      // 공연 구간을 벗어나면 끈다 — 다시 들어오면 재생 버튼으로 켠다
      playIntent = false;
      music.pause();
    }
    wasScrubbing = scrubbing;
    document.body.classList.toggle('ff', scrubbing && frame.phase === 'show');
    playBtn.textContent = ms?.playing ? '❚❚ 일시정지' : playIntent && scrubbing ? '⏩ 감는 중' : '▶ 소리 켜고 보기';
    if (pos.songIndex !== songIndex) showSong(pos.songIndex);
    const st = performerStateInSong(pos.songIndex, pos.songTime, SETLIST[pos.songIndex].durationMs / 1000);
    if (debugPose) Object.assign(st, { motion: debugPose, x: 0, z: -48, facing: 0 });

    // 지금 곡의 주인만 무대에 선다 — 게스트 무대엔 DJ, 포스트 말론 무대엔 밴드
    const artist = SETLIST[pos.songIndex].artist;
    const performer = performers[artist];
    for (const [who, p] of Object.entries(performers) as Array<[Artist, Performer]>) {
      if (who === artist) p.update(st, t, dt);
      p.setPresence(who === artist ? stage : 0);
    }
    band.update(dt);
    band.setPresence(artist === 'post-malone' ? stage : 0);
    dj.update(dt, t);
    dj.setPresence(artist === 'don-toliver' ? stage : 0);
    crowd.update(t, dt);
    crowd.setLit(house);
    crowd.setPhones(phones * (1 - house * 0.92));
    fx.update(t, dt, stage);
    stageSet.update(t, fx.color(), stage);
    pyro.update(t, dt, SETLIST[pos.songIndex], pos.songIndex, pos.songTime, SETLIST.length, frame.phase === 'show' ? stage : 0);
    // 얼굴 높이는 키의 약 93% — 중계 카메라가 이 점을 잡는다
    face.copy(performer.root.position).setY(performer.root.position.y + PERFORMER_HEIGHT_M * 0.93);
    imag.update(face, performer.root.rotation.y, t, stage);
    videoWall.setLevel(frame.phase === 'show' ? stage : 0);
    stadium.micStand.visible = frame.phase === 'lights' && house > 0.3;
    stadium.spot.target.position.set(st.x, STAGE_HEIGHT_M, st.z);
    stadium.spot.intensity = 450 * stage;
    stadium.wash.intensity = 400 * stage * (0.7 + 0.3 * Math.sin(t * 2.6));
    stadium.wash.color.setHSL((0.62 + songIndex * 0.07) % 1, 0.7, 0.55);
    animatePhoneLights(stadium.standLights, t, phones * (1 - house * 0.92));
    animatePhoneLights(crowd.farLights, t + 0.7, phones * (1 - house * 0.92));

    ambient.intensity = 0.12 + house * 1.3;
    hemi.intensity = house * 2.6;
    (scene.background as THREE.Color).setRGB(0.02 + house * 0.2, 0.024 + house * 0.21, 0.04 + house * 0.23);
    scene.fog!.color.copy(scene.background as THREE.Color);
    // 낮(입장 전) 장면은 하늘에서 내려다보므로 연무를 멀리 밀어 경기장이 뿌옇게 묻히지 않게 한다
    (scene.fog as THREE.Fog).far = 300 + house * 500;

    $('#hudTime').textContent = `10.02 FRI ${frame.phase === 'show' ? showClock(frame.showProgress) : frame.clock}`;
    rig.track(focus.set(st.x, performer.root.position.y + 1.5, st.z));
    rig.update(dt);
    smash.update(dt, camera);
    imag.render(renderer, scene);
    videoWall.renderMask(renderer, scene, camera);
    composer.render();
    if (captureNext) {
      const shot = document.createElement('canvas');
      shot.width = canvas.width;
      shot.height = canvas.height;
      shot.getContext('2d')!.drawImage(canvas, 0, 0);
      const cb = captureNext;
      captureNext = null;
      cb(shot);
    }
    videoWall.renderCss(camera);
  });
}

boot().catch((err: unknown) => {
  console.error('[main] boot failed', err);
  $('#loadingText').textContent = '공연장을 여는 데 실패했어요. 새로고침해 주세요.';
});
