import { dateOf } from '../sim/economy';
import { averageStars } from '../sim/reviews';
import type { World } from '../sim/world';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const SHOW = 12;

export const starText = (n: number): string => '★'.repeat(n) + '☆'.repeat(5 - n);

/** 공원 리뷰 카드: 떠난 손님들이 남긴 별점과 후기. HUD의 평점을 누르면 열린다 */
export class ReviewPanel {
  private root = $('reviews');
  private avg = $('r-avg');
  private list = $('r-list');
  private shown = -1;

  constructor(private world: World) {
    $('r-close').addEventListener('click', () => this.toggle(false));
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  toggle(open = this.root.hidden): void {
    this.root.hidden = !open;
    this.shown = -1;
  }

  update(): void {
    if (this.root.hidden) return;
    const w = this.world;
    const last = w.reviews.length ? w.reviews[w.reviews.length - 1].tick * 1000 + w.reviews.length : 0;
    if (last === this.shown) return; // 새 리뷰가 있을 때만 다시 그린다
    this.shown = last;
    const a = averageStars(w);
    this.avg.textContent = a === null ? '아직 리뷰가 없어요. 손님이 공원을 떠날 때 후기를 남겨요.' : `${starText(Math.round(a))} ${a.toFixed(1)} · 최근 ${w.reviews.length}명`;
    this.list.replaceChildren(
      ...w.reviews.slice(-SHOW).reverse().map((r) => {
        const li = document.createElement('li');
        li.dataset.stars = String(r.stars);
        const head = document.createElement('div');
        head.className = 'r-head';
        const st = document.createElement('span');
        st.className = 'r-stars';
        st.textContent = starText(r.stars);
        const who = document.createElement('span');
        const d = dateOf(r.tick);
        who.textContent = `${r.name} · ${d.month}월 ${d.day}일`;
        head.append(st, who);
        const text = document.createElement('div');
        text.textContent = r.text;
        li.append(head, text);
        return li;
      }),
    );
  }
}
