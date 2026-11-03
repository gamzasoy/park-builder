import { getDef } from '../data';
import { START_FEE } from './economy';
import type { World } from './world';

/** 길이 이만큼(공원 입구에서 이어진 칸, 입구 제외) 깔리면 첫 단계 완료 */
export const MIN_PATH_TILES = 5;
/** 판정 주기(틱) */
export const TUTORIAL_EVERY = 10;

export interface TutorialStep {
  id: string;
  title: string;
  text: string;
  /** 이 단계에서 눌러야 할 툴바 버튼 키(깜빡여 알려 준다) */
  tool?: string;
  /** 선택 과제: 끝내지 않아도 기본 과정은 완료로 친다 */
  optional?: boolean;
  done(world: World): boolean;
}

export interface TutorialState {
  /** 한 번 달성한 단계 id. 나중에 철거해도 유지된다 */
  completed: string[];
}

export const newTutorial = (): TutorialState => ({ completed: [] });

export const STEPS: readonly TutorialStep[] = [
  {
    id: 'path',
    title: '길 깔기',
    text: `공원 입구(노란 칸)에서 길을 ${MIN_PATH_TILES}칸 이상 깔아 보세요. 아래 '길' 버튼을 누르고 드래그하면 됩니다.`,
    tool: 'path',
    done: (w) => {
      const m = w.map;
      let n = 0;
      for (let y = 0; y < m.height; y++) {
        for (let x = 0; x < m.width; x++) {
          if (m.isPath(x, y) && !m.isGate(x, y) && w.network.isReachable(x, y)) n++;
        }
      }
      return n >= MIN_PATH_TILES;
    },
  },
  {
    id: 'ride',
    title: '놀이기구 짓기',
    text: '길 끝에 놀이기구를 지어 보세요. 건물의 노란 입구 칸이 길에 닿아야 운영됩니다. R 키로 회전할 수 있어요.',
    tool: 'build:carousel',
    done: (w) => [...w.buildings.values()].some((b) => getDef(b.defId).kind === 'ride' && w.network.isOperational(b)),
  },
  {
    id: 'shop',
    title: '매점 짓기',
    text: '손님은 배고픔과 갈증도 느껴요. 길 옆에 햄버거 가게나 음료 가판대를 지어 보세요.',
    tool: 'build:burger',
    done: (w) => [...w.buildings.values()].some((b) => {
      const d = getDef(b.defId);
      return d.kind === 'shop' && (d.serves === 'hunger' || d.serves === 'thirst') && w.network.isOperational(b);
    }),
  },
  {
    id: 'guest',
    title: '첫 손님 맞이',
    text: '운영 중인 시설이 있으면 손님이 입장해요. 잠시 기다려 보세요. 위쪽 속도 버튼으로 빨리 감을 수도 있어요.',
    done: (w) => w.stats.entered > 0,
  },
  {
    id: 'price',
    title: '요금 바꿔 보기',
    text: '놀이기구를 클릭해 이용 요금을 바꿔 보세요(상단의 입장료도 좋아요). 적정 요금보다 비싸면 손님이 외면해요.',
    done: (w) => {
      if (w.entranceFee !== START_FEE) return true;
      for (const b of w.buildings.values()) {
        const d = getDef(b.defId);
        // 코스터는 완성할 때 요금이 자동으로 맞춰지므로 직접 바꾼 것으로 세지 않는다
        if (d.kind === 'ride' && !d.coaster && b.price !== d.price) return true;
      }
      return false;
    },
  },
  {
    id: 'coaster',
    title: '롤러코스터 완성 (도전)',
    text: '롤러코스터를 직접 설계해 보세요. 리프트로 올라 내리막으로 속도를 얻고, 역의 시작 칸으로 돌아오면 완성이에요.',
    tool: 'build:coaster',
    optional: true,
    done: (w) => [...w.buildings.values()].some((b) => b.track?.ok === true),
  },
];

export const STEP_IDS: readonly string[] = STEPS.map((s) => s.id);
const REQUIRED = STEPS.filter((s) => !s.optional);

/** 아직 달성하지 못한 단계를 판정해 새로 달성한 단계 id를 반환 */
export function updateTutorial(world: World): string[] {
  const t = world.tutorial;
  const fresh: string[] = [];
  for (const s of STEPS) {
    if (t.completed.includes(s.id)) continue;
    if (s.done(world)) {
      t.completed.push(s.id);
      fresh.push(s.id);
    }
  }
  return fresh;
}

/** 지금 안내할 단계: 선택 과제보다 필수 단계를 먼저, 순서대로 */
export function currentStep(world: World): TutorialStep | null {
  const left = (s: TutorialStep): boolean => !world.tutorial.completed.includes(s.id);
  return REQUIRED.find(left) ?? STEPS.find(left) ?? null;
}

/** 필수 단계를 모두 끝냈는가 */
export function basicsDone(world: World): boolean {
  return REQUIRED.every((s) => world.tutorial.completed.includes(s.id));
}
