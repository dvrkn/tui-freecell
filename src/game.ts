import { type Card, type Suit, newDeck, shuffle, cardColor, SUITS } from "./cards";

export type PileKind = "free" | "found" | "tab";
export interface PileId {
  kind: PileKind;
  index: number; // 0..3 (free/found) or 0..7 (tab)
}

export interface Selection {
  from: PileId;
  count: number; // how many cards from the top of the source pile
}

export interface GameState {
  free: (Card | null)[]; // length 4
  found: Card[][]; // length 4, each pile builds up by suit; suit determined by first ace
  tab: Card[][]; // length 8
  selected: Selection | null;
  cursor: PileId; // current keyboard cursor position
  cursorDepth: number; // when cursor on tab pile, how deep from top (1 = top card)
  history: SerializedState[]; // for undo
  seed: number;
  moves: number;
}

interface SerializedState {
  free: (Card | null)[];
  found: Card[][];
  tab: Card[][];
  moves: number;
}

function snap(s: GameState): SerializedState {
  return {
    free: s.free.map((c) => (c ? { ...c } : null)),
    found: s.found.map((p) => p.map((c) => ({ ...c }))),
    tab: s.tab.map((p) => p.map((c) => ({ ...c }))),
    moves: s.moves,
  };
}

function restore(s: GameState, snap: SerializedState) {
  s.free = snap.free;
  s.found = snap.found;
  s.tab = snap.tab;
  s.moves = snap.moves;
}

export function newGame(seed = Date.now() & 0xffffffff): GameState {
  const deck = shuffle(newDeck(), seed);
  const tab: Card[][] = [[], [], [], [], [], [], [], []];
  // First 4 columns get 7 cards, last 4 get 6 → 52 total.
  for (let i = 0; i < deck.length; i++) tab[i % 8].push(deck[i]);
  return {
    free: [null, null, null, null],
    found: [[], [], [], []],
    tab,
    selected: null,
    cursor: { kind: "tab", index: 0 },
    cursorDepth: 1,
    history: [],
    seed,
    moves: 0,
  };
}

export function pileCards(s: GameState, p: PileId): Card[] {
  if (p.kind === "free") {
    const c = s.free[p.index];
    return c ? [c] : [];
  }
  if (p.kind === "found") return s.found[p.index];
  return s.tab[p.index];
}

function topCard(s: GameState, p: PileId): Card | null {
  const pile = pileCards(s, p);
  return pile.length ? pile[pile.length - 1] : null;
}

// Validate that the bottom N cards on a tableau pile form a valid
// descending alternating-color run, so the user can pick them up as a group.
export function isValidRun(cards: Card[], count: number): boolean {
  if (count <= 0 || count > cards.length) return false;
  const start = cards.length - count;
  for (let i = start; i < cards.length - 1; i++) {
    const a = cards[i];
    const b = cards[i + 1];
    if (a.rank - 1 !== b.rank) return false;
    if (cardColor(a) === cardColor(b)) return false;
  }
  return true;
}

// Longest valid run from the bottom of a tableau pile.
export function maxRunFromBottom(cards: Card[]): number {
  if (cards.length === 0) return 0;
  let n = 1;
  while (n < cards.length && isValidRun(cards, n + 1)) n++;
  return n;
}

// Supermove capacity: with F empty free cells and E empty tableau columns
// (excluding the destination if it is itself empty), you can move up to
// (F + 1) * 2^E cards in one logical move.
export function maxMoveCount(s: GameState, dest: PileId): number {
  const emptyFree = s.free.filter((c) => c === null).length;
  let emptyTab = 0;
  for (let i = 0; i < s.tab.length; i++) {
    if (s.tab[i].length === 0 && !(dest.kind === "tab" && dest.index === i)) emptyTab++;
  }
  return (emptyFree + 1) * Math.pow(2, emptyTab);
}

export function canMove(s: GameState, from: PileId, to: PileId, count: number): boolean {
  if (from.kind === to.kind && from.index === to.index) return false;
  const src = pileCards(s, from);
  if (count <= 0 || count > src.length) return false;
  const moving = src.slice(src.length - count);

  if (to.kind === "free") {
    if (count !== 1) return false;
    return s.free[to.index] === null;
  }

  if (to.kind === "found") {
    if (count !== 1) return false;
    const card = moving[0];
    const pile = s.found[to.index];
    if (pile.length === 0) return card.rank === 1;
    const top = pile[pile.length - 1];
    return top.suit === card.suit && card.rank === top.rank + 1;
  }

  // Tableau target.
  if (!isValidRun(src, count)) return false;
  if (count > maxMoveCount(s, to)) return false;
  const dest = s.tab[to.index];
  const first = moving[0];
  if (dest.length === 0) return true;
  const destTop = dest[dest.length - 1];
  if (destTop.rank - 1 !== first.rank) return false;
  if (cardColor(destTop) === cardColor(first)) return false;
  return true;
}

export function applyMove(s: GameState, from: PileId, to: PileId, count: number): boolean {
  if (!canMove(s, from, to, count)) return false;
  s.history.push(snap(s));
  if (s.history.length > 200) s.history.shift();

  const take = (): Card[] => {
    if (from.kind === "free") {
      const c = s.free[from.index]!;
      s.free[from.index] = null;
      return [c];
    }
    if (from.kind === "found") {
      return [s.found[from.index].pop()!];
    }
    const pile = s.tab[from.index];
    return pile.splice(pile.length - count, count);
  };

  const moving = take();

  if (to.kind === "free") {
    s.free[to.index] = moving[0];
  } else if (to.kind === "found") {
    s.found[to.index].push(moving[0]);
  } else {
    s.tab[to.index].push(...moving);
  }
  s.moves++;
  return true;
}

export function undo(s: GameState): boolean {
  const last = s.history.pop();
  if (!last) return false;
  restore(s, last);
  s.selected = null;
  return true;
}

// Find a foundation pile that will accept this card.
export function foundationFor(s: GameState, card: Card): number | null {
  // Prefer an existing pile of the same suit.
  for (let i = 0; i < 4; i++) {
    const pile = s.found[i];
    if (pile.length === 0) continue;
    if (pile[pile.length - 1].suit === card.suit && card.rank === pile[pile.length - 1].rank + 1) {
      return i;
    }
  }
  // Otherwise place an Ace in any empty foundation.
  if (card.rank === 1) {
    for (let i = 0; i < 4; i++) if (s.found[i].length === 0) return i;
  }
  return null;
}

// Returns the suit that each foundation pile is dedicated to (once it has any card),
// for rendering placeholder glyphs and slot identity.
export function foundationSuit(s: GameState, index: number): Suit | null {
  const pile = s.found[index];
  return pile.length ? pile[0].suit : null;
}

export function isWon(s: GameState): boolean {
  return s.found.reduce((n, p) => n + p.length, 0) === 52;
}

// Sweep any cards that can safely auto-move to their foundation.
// A card is safe if both opposite-color cards of rank-1 are already on foundations
// (so it can never serve as a useful tableau target for a card needing to land on it).
export function autoFoundationSweep(s: GameState) {
  const minOppOnFound = (color: "red" | "black"): number => {
    // Find min rank still NOT on foundation among the opposite-color suits.
    const opps: Suit[] = color === "red" ? ["S", "C"] : ["H", "D"];
    let m = 14;
    for (const suit of opps) {
      const pile = s.found.find((p) => p.length && p[0].suit === suit);
      const r = pile ? pile[pile.length - 1].rank + 1 : 1;
      if (r < m) m = r;
    }
    return m;
  };
  let didMove = true;
  while (didMove) {
    didMove = false;
    const trySource = (from: PileId) => {
      const top = topCard(s, from);
      if (!top) return false;
      // Aces and 2s always safe.
      const safe =
        top.rank <= 2 ||
        top.rank <= minOppOnFound(cardColor(top)) + 1;
      if (!safe) return false;
      const target = foundationFor(s, top);
      if (target === null) return false;
      return applyMove(s, from, { kind: "found", index: target }, 1);
    };
    for (let i = 0; i < 4; i++) if (trySource({ kind: "free", index: i })) didMove = true;
    for (let i = 0; i < 8; i++) if (trySource({ kind: "tab", index: i })) didMove = true;
  }
}
