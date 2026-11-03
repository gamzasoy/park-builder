import type { Building, World } from '../sim/world';

/** 시운전이 끝난 뒤 열차를 보여 주는 시간(초) */
const LINGER = 2.5;

/**
 * 시운전(렌더 전용 상태). 저장하지 않고 시뮬레이션 상태에도 영향을 주지 않는다.
 * 코스터가 계산한 경로·조각별 구간(Track.route / pieceT)만 읽어 열차를 한 바퀴(또는 멈추는 곳까지) 달리게 한다.
 */
export class TestRun {
  private id: number | null = null;
  private pieces = 0;
  /** 선두의 경로 위치(0~1) */
  t = 0;
  /** 달릴 목표 위치. 완주면 1, 멈추는 코스면 그 조각 가운데 */
  private stopT = 1;
  private lapTicks = 100;
  stalled = false;
  finished = false;
  private linger = 0;
  /** 결과 문구(화면 알림용) */
  result = '';

  active(id: number): boolean {
    return this.id === id;
  }

  cancel(): void {
    this.id = null;
  }

  /** 시운전을 시작한다. 조각이 없으면 false. 알림에 쓸 문구는 result에 담는다. */
  start(b: Building): boolean {
    const tr = b.track;
    if (!tr || tr.placed.length === 0 || tr.route.length < 2) return false;
    this.id = b.id;
    this.pieces = tr.pieces.length;
    this.t = 0;
    this.finished = false;
    this.linger = LINGER;
    this.lapTicks = Math.max(60, tr.lapTicks);
    if (tr.stallIndex !== null) {
      const [a, e] = tr.pieceT[tr.stallIndex];
      this.stalled = true;
      this.stopT = (a + e) / 2;
      this.result = `시운전: ${tr.stallIndex + 1}번째 조각에서 멈춥니다`;
    } else if (!tr.closed) {
      this.stalled = false;
      this.stopT = 1;
      this.result = '시운전: 코스가 아직 이어지지 않았습니다 (끝까지 달려 봅니다)';
    } else {
      this.stalled = false;
      this.stopT = 1;
      this.result = '시운전: 한 바퀴 완주';
    }
    if (this.stalled) this.linger = LINGER + 1.5;
    return true;
  }

  /** 프레임마다 호출. dt는 실제 경과 초. */
  update(world: World, dt: number): void {
    if (this.id === null) return;
    const b = world.buildings.get(this.id);
    // 건물이 사라졌거나 트랙이 편집되면(조각 수 변화) 그만둔다
    if (!b?.track || b.track.pieces.length !== this.pieces) { this.id = null; return; }
    if (!this.finished) {
      this.t = Math.min(this.stopT, this.t + (dt * 10) / this.lapTicks);
      if (this.t >= this.stopT) this.finished = true;
    } else {
      this.linger -= dt;
      if (this.linger <= 0) this.id = null;
    }
  }
}
