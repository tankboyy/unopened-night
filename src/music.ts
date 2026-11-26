import { SETLIST } from './setlist.js';

/*
 * YouTube 공식 영상(IFrame Player API)으로 세트리스트 곡을 재생하고, 재생 위치를 공연 시계로 넘긴다.
 * - 로그인 없이 누구나 전곡을 듣는다.
 * - intentionally: 음원 파일은 저장소에 두지 않는다 — 공개 저장소·갤러리에 올리면 재배포가 된다.
 * - intentionally: Spotify 임베드는 로그인 안 한 방문자에게 재생 버튼을 막아서(미리듣기 차단) 쓰지 않는다.
 * - YouTube API 정책상 플레이어는 숨기지 않고 200×200 이상으로 보여 준다.
 * - 첫 재생은 브라우저 자동재생 정책 때문에 방문자가 플레이어를 직접 눌러야 할 수 있다.
 */

const API_SRC = 'https://www.youtube.com/iframe_api';

// IFrame API 의 상태 코드(YT.PlayerState) — 전역 타입을 들이지 않으려고 필요한 것만 옮겨 둔다
const STATE_ENDED = 0;
const STATE_PLAYING = 1;

interface YtVideoArg {
  videoId: string;
  startSeconds?: number;
}

interface YtPlayer {
  loadVideoById(arg: YtVideoArg): void;
  cueVideoById(arg: YtVideoArg): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
}

interface YtNamespace {
  Player: new (el: HTMLElement, opts: {
    videoId: string;
    width: string | number;
    height: string | number;
    playerVars?: Record<string, number | string>;
    events?: { onReady?: () => void; onStateChange?: (e: { data: number }) => void; onError?: (e: { data: number }) => void };
  }) => YtPlayer;
}

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface MusicState {
  songIndex: number;
  positionSec: number;
  durationSec: number;
  playing: boolean;
}

export interface MusicPlayer {
  /** 곡의 sec 초로 옮긴다. 같은 곡이면 그 자리로 건너뛰고, 다른 곡이면 그 곡을 불러온다. play 면 바로 재생 */
  seek(songIndex: number, sec: number, play: boolean): void;
  play(): void;
  pause(): void;
  /** 지금 재생 상태. 한 번도 재생되지 않았으면 null — 그동안 공연은 스크롤 위치로만 흐른다 */
  state(): MusicState | null;
}

/**
 * @param mount 플레이어가 들어갈 요소
 * @param onEnded 곡이 끝까지 재생됐을 때 — 보통 다음 곡을 불러온다
 * @param onError 영상을 재생할 수 없을 때(지역 차단·삭제 등) — 보통 다음 곡으로 건너뛴다
 */
export function createMusicPlayer(mount: HTMLElement, onEnded: (songIndex: number) => void, onError: (songIndex: number) => void): MusicPlayer {
  let player: YtPlayer | null = null;
  let ready = false;
  let current = 0;
  let started = false;

  let pending: { index: number; sec: number; play: boolean } | null = null;
  let loadedIndex = 0;

  const seek = (index: number, sec: number, play: boolean): void => {
    if (!player || !ready) {
      pending = { index, sec, play };
      return;
    }
    current = index;
    const start = Math.max(0, sec);
    if (index !== loadedIndex) {
      loadedIndex = index;
      const arg = { videoId: SETLIST[index].youtubeId, startSeconds: start };
      if (play) player.loadVideoById(arg);
      else player.cueVideoById(arg);
      return;
    }
    player.seekTo(start, true);
    if (play) player.playVideo();
  };

  window.onYouTubeIframeAPIReady = () => {
    if (!window.YT) return;
    const el = document.createElement('div');
    mount.replaceChildren(el);
    player = new window.YT.Player(el, {
      videoId: SETLIST[0].youtubeId,
      // 영상 벽 크기를 그대로 채운다(정책 최소 크기보다 훨씬 크다)
      width: '100%',
      height: '100%',
      playerVars: { playsinline: 1, rel: 0, origin: location.origin },
      events: {
        onReady: () => {
          ready = true;
          if (pending) {
            const p = pending;
            pending = null;
            seek(p.index, p.sec, p.play);
          }
        },
        onStateChange: (e) => {
          if (e.data === STATE_PLAYING) started = true;
          if (e.data === STATE_ENDED) onEnded(current);
        },
        onError: () => onError(current),
      },
    });
  };

  const script = document.createElement('script');
  script.src = API_SRC;
  script.async = true;
  // 비핵심: 플레이어를 못 불러와도 공연은 스크롤만으로 소리 없이 계속된다
  script.onerror = () => {
    mount.textContent = 'YouTube 플레이어를 불러오지 못했어요. 소리 없이 공연을 이어 갑니다.';
  };
  document.head.appendChild(script);

  return {
    seek,
    play() {
      if (player && ready) player.playVideo();
      else pending = { index: current, sec: 0, play: true };
    },
    pause() {
      if (player && ready) player.pauseVideo();
    },
    state() {
      if (!player || !started) return null;
      const duration = player.getDuration();
      return {
        songIndex: current,
        positionSec: player.getCurrentTime(),
        // 길이를 아직 모르면(메타데이터 로딩 중) 음원 길이로 대신한다
        durationSec: duration > 0 ? duration : SETLIST[current].durationMs / 1000,
        playing: player.getPlayerState() === STATE_PLAYING,
      };
    },
  };
}
