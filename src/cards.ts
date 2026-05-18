export type Suit = "S" | "H" | "D" | "C";
export type Color = "red" | "black";

export const SUITS: Suit[] = ["S", "H", "D", "C"];
export const SUIT_GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const SUIT_COLOR: Record<Suit, Color> = { S: "black", H: "red", D: "red", C: "black" };

export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

const RANK_LABEL: Record<Rank, string> = {
  1: "A",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
};

export interface Card {
  suit: Suit;
  rank: Rank;
}

export function cardColor(c: Card): Color {
  return SUIT_COLOR[c.suit];
}

export function cardLabel(c: Card): string {
  // 3-char fixed width so cards align: "A♠ ", "10♥", " J♣"
  const label = RANK_LABEL[c.rank];
  if (label.length === 2) return label + SUIT_GLYPH[c.suit];
  return label + SUIT_GLYPH[c.suit] + " ";
}

export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ suit: s, rank: r });
  return deck;
}

// Mulberry32 — small deterministic PRNG so a seed reproduces the same deal.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
