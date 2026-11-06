import { type KV, defaultStorage } from '../save/save';

export type SoundName = 'build' | 'path' | 'demolish' | 'error' | 'chime' | 'win' | 'lose' | 'pickup' | 'shutter';

const MUTE_KEY = 'park-builder-muted';

interface Note {
  freq: number;
  at: number;
  dur: number;
  type?: OscillatorType;
  /** 끝 주파수(슬라이드) */
  to?: number;
  gain?: number;
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;

const SOUNDS: Record<SoundName, Note[]> = {
  build: [{ freq: 392, at: 0, dur: 0.07, type: 'square' }, { freq: 587, at: 0.07, dur: 0.1, type: 'square' }],
  shutter: [{ freq: 1800, at: 0, dur: 0.03, type: 'square', gain: 0.5 }, { freq: 900, at: 0.05, dur: 0.05, type: 'square', gain: 0.5 }],
  pickup: [{ freq: 660, at: 0, dur: 0.05, type: 'triangle' }, { freq: 990, at: 0.05, dur: 0.08, type: 'triangle' }],
  path: [{ freq: 880, at: 0, dur: 0.03, type: 'sine', gain: 0.6 }],
  demolish: [{ freq: 220, at: 0, dur: 0.18, type: 'sawtooth', to: 70 }],
  error: [{ freq: 160, at: 0, dur: 0.16, type: 'square', gain: 0.7 }],
  chime: [{ freq: C5, at: 0, dur: 0.15 }, { freq: E5, at: 0.12, dur: 0.15 }, { freq: G5, at: 0.24, dur: 0.3 }],
  win: [
    { freq: C5, at: 0, dur: 0.14 }, { freq: E5, at: 0.14, dur: 0.14 },
    { freq: G5, at: 0.28, dur: 0.14 }, { freq: C6, at: 0.42, dur: 0.45 },
  ],
  lose: [{ freq: G5, at: 0, dur: 0.2, type: 'triangle' }, { freq: E5, at: 0.2, dur: 0.2, type: 'triangle' }, { freq: C5 / 2, at: 0.4, dur: 0.5, type: 'triangle' }],
};

/**
 * 외부 파일 없이 WebAudio 오실레이터로 만드는 짧은 효과음.
 * 브라우저 정책상 오디오는 사용자 조작 후에야 시작되므로 컨텍스트를 처음 재생할 때 만든다.
 * 음소거 설정은 저장소에 보관한다. AudioContext가 없는 환경에서는 조용히 아무것도 하지 않는다.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  muted: boolean;

  constructor(private storage: KV | null = defaultStorage()) {
    let m = false;
    try { m = storage?.getItem(MUTE_KEY) === '1'; } catch { /* 저장소 사용 불가 */ }
    this.muted = m;
  }

  toggle(): boolean {
    this.muted = !this.muted;
    try { this.storage?.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch { /* 무시 */ }
    return this.muted;
  }

  play(name: SoundName): void {
    if (this.muted) return;
    try {
      const ctx = this.context();
      if (!ctx) return;
      if (ctx.state === 'suspended') void ctx.resume();
      const t0 = ctx.currentTime;
      for (const n of SOUNDS[name]) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = n.type ?? 'sine';
        osc.frequency.setValueAtTime(n.freq, t0 + n.at);
        if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t0 + n.at + n.dur);
        const peak = 0.05 * (n.gain ?? 1);
        g.gain.setValueAtTime(0.0001, t0 + n.at);
        g.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
        osc.connect(g).connect(ctx.destination);
        osc.start(t0 + n.at);
        osc.stop(t0 + n.at + n.dur + 0.02);
      }
    } catch {
      /* 오디오를 쓸 수 없어도 게임은 계속된다 */
    }
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    return this.ctx;
  }
}
