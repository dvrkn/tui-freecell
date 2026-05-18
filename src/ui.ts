import {
  BoxRenderable,
  TextRenderable,
  type CliRenderer,
  type MouseEvent,
} from "@opentui/core";
import {
  type GameState,
  type PileId,
  pileCards,
  foundationSuit,
  isWon,
} from "./game";
import { cardLabel, cardColor, SUIT_GLYPH, type Suit } from "./cards";

// ── Palette ───────────────────────────────────────────────────────────────
const BG = "transparent"; // let terminal background show through
const CARD_BG = "#f5f5f5";
const SLOT_BG = "transparent"; // empty pile interior
const TEXT_BLACK = "#111111";
const TEXT_RED = "#c0152e";
const TEXT_HINT = "#6b7280"; // dim glyph on empty foundations
const BORDER_NORMAL = "#dddddd";
const BORDER_EMPTY = "#64748b";
const BORDER_CURSOR = "#fde047"; // yellow cursor
const BORDER_SELECTED = "#fbbf24"; // amber for selected source pile
const SELECT_BG = "#fde68a"; // highlighted card row
const STATUS_FG = "#e2e8f0";

const CARD_W = 5; // 3-char label + 2 border cols
const SLOT_H = 3; // border + 1 content row + border
const POOL_PER_TAB = 24; // max cards we ever pre-allocate per tab pile

export interface UI {
  renderer: CliRenderer;
  root: BoxRenderable;
  freeBoxes: BoxRenderable[];
  freeTexts: TextRenderable[];
  foundBoxes: BoxRenderable[];
  foundTexts: TextRenderable[];
  tabBoxes: BoxRenderable[];
  tabPools: TextRenderable[][];
  statusText: TextRenderable;
  helpText: TextRenderable;
}

function makeSlotBox(renderer: CliRenderer, opts: { width: number; height: number | "auto"; minHeight?: number }): BoxRenderable {
  return new BoxRenderable(renderer, {
    width: opts.width,
    height: opts.height as any,
    minHeight: opts.minHeight,
    borderStyle: "rounded",
    borderColor: BORDER_NORMAL,
    backgroundColor: CARD_BG,
    padding: 0,
  });
}

function makeCardText(renderer: CliRenderer): TextRenderable {
  return new TextRenderable(renderer, {
    content: "   ",
    fg: TEXT_BLACK,
    bg: CARD_BG,
  });
}

export interface PileClickHandler {
  (pile: PileId, event: MouseEvent): void;
}

function attachClick(box: BoxRenderable, pile: PileId, onPileClick?: PileClickHandler) {
  if (!onPileClick) return;
  box.onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return; // left button only
    onPileClick(pile, event);
  };
}

export function buildUi(renderer: CliRenderer, onPileClick?: PileClickHandler): UI {
  const root = new BoxRenderable(renderer, {
    width: "100%",
    height: "100%",
    flexDirection: "column",
    padding: 1,
    gap: 1,
    backgroundColor: BG,
  });
  renderer.root.add(root);

  // ── Top row: free cells (left) + foundations (right) ─────────────────
  const topRow = new BoxRenderable(renderer, {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    backgroundColor: BG,
  });
  root.add(topRow);

  const freeGroup = new BoxRenderable(renderer, {
    flexDirection: "row",
    gap: 1,
    backgroundColor: BG,
  });
  topRow.add(freeGroup);

  const freeBoxes: BoxRenderable[] = [];
  const freeTexts: TextRenderable[] = [];
  for (let i = 0; i < 4; i++) {
    const box = makeSlotBox(renderer, { width: CARD_W, height: SLOT_H });
    const txt = makeCardText(renderer);
    box.add(txt);
    freeGroup.add(box);
    attachClick(box, { kind: "free", index: i }, onPileClick);
    freeBoxes.push(box);
    freeTexts.push(txt);
  }

  const foundGroup = new BoxRenderable(renderer, {
    flexDirection: "row",
    gap: 1,
    backgroundColor: BG,
  });
  topRow.add(foundGroup);

  const foundBoxes: BoxRenderable[] = [];
  const foundTexts: TextRenderable[] = [];
  for (let i = 0; i < 4; i++) {
    const box = makeSlotBox(renderer, { width: CARD_W, height: SLOT_H });
    const txt = makeCardText(renderer);
    box.add(txt);
    foundGroup.add(box);
    attachClick(box, { kind: "found", index: i }, onPileClick);
    foundBoxes.push(box);
    foundTexts.push(txt);
  }

  // ── Tableau row ───────────────────────────────────────────────────────
  const tabRow = new BoxRenderable(renderer, {
    flexDirection: "row",
    gap: 1,
    width: "auto",
    alignItems: "flex-start",
    backgroundColor: BG,
  });
  root.add(tabRow);

  const tabBoxes: BoxRenderable[] = [];
  const tabPools: TextRenderable[][] = [];
  for (let i = 0; i < 8; i++) {
    const col = new BoxRenderable(renderer, {
      width: CARD_W,
      flexDirection: "column",
      borderStyle: "rounded",
      borderColor: BORDER_NORMAL,
      backgroundColor: CARD_BG,
      minHeight: SLOT_H,
      padding: 0,
    });
    tabRow.add(col);
    attachClick(col, { kind: "tab", index: i }, onPileClick);
    const pool: TextRenderable[] = [];
    for (let j = 0; j < POOL_PER_TAB; j++) {
      const t = makeCardText(renderer);
      t.visible = false;
      col.add(t);
      pool.push(t);
    }
    tabBoxes.push(col);
    tabPools.push(pool);
  }

  // ── Status + help ─────────────────────────────────────────────────────
  const footer = new BoxRenderable(renderer, {
    flexDirection: "column",
    width: "100%",
    backgroundColor: BG,
  });
  root.add(footer);

  const statusText = new TextRenderable(renderer, {
    content: "",
    fg: STATUS_FG,
    bg: BG,
  });
  footer.add(statusText);

  const helpText = new TextRenderable(renderer, {
    content: "[←→/hl] move  [↑↓/kj/Tab] rows  [+/-] depth  [Space] pick/drop  [Enter] →foundation  [click] pick/drop  [u] undo  [n] new  [q] quit",
    fg: "#a3b8c4",
    bg: BG,
  });
  footer.add(helpText);

  return {
    renderer,
    root,
    freeBoxes,
    freeTexts,
    foundBoxes,
    foundTexts,
    tabBoxes,
    tabPools,
    statusText,
    helpText,
  };
}

function pileEq(a: PileId, b: PileId): boolean {
  return a.kind === b.kind && a.index === b.index;
}

function fgForSuit(suit: Suit): string {
  return cardColor({ suit, rank: 1 }) === "red" ? TEXT_RED : TEXT_BLACK;
}

export function render(s: GameState, ui: UI) {
  // ── Free cells ────────────────────────────────────────────────────────
  for (let i = 0; i < 4; i++) {
    const card = s.free[i];
    const box = ui.freeBoxes[i];
    const txt = ui.freeTexts[i];
    const isCursor = pileEq(s.cursor, { kind: "free", index: i });
    const isSelected = s.selected != null && pileEq(s.selected.from, { kind: "free", index: i });

    if (card) {
      txt.content = cardLabel(card);
      txt.fg = fgForSuit(card.suit);
      txt.bg = isSelected ? SELECT_BG : CARD_BG;
      box.backgroundColor = isSelected ? SELECT_BG : CARD_BG;
    } else {
      txt.content = "   ";
      txt.bg = SLOT_BG;
      box.backgroundColor = SLOT_BG;
    }
    box.borderColor = isSelected
      ? BORDER_SELECTED
      : isCursor
      ? BORDER_CURSOR
      : card
      ? BORDER_NORMAL
      : BORDER_EMPTY;
  }

  // ── Foundations ───────────────────────────────────────────────────────
  for (let i = 0; i < 4; i++) {
    const pile = s.found[i];
    const box = ui.foundBoxes[i];
    const txt = ui.foundTexts[i];
    const isCursor = pileEq(s.cursor, { kind: "found", index: i });

    if (pile.length > 0) {
      const top = pile[pile.length - 1];
      txt.content = cardLabel(top);
      txt.fg = fgForSuit(top.suit);
      txt.bg = CARD_BG;
      box.backgroundColor = CARD_BG;
      box.borderColor = isCursor ? BORDER_CURSOR : BORDER_NORMAL;
    } else {
      // Empty foundation — show a hint suit glyph cycling S,H,D,C just as a slot label.
      const suitHint: Suit = (["S", "H", "D", "C"] as Suit[])[i];
      txt.content = " " + SUIT_GLYPH[suitHint] + " ";
      txt.fg = TEXT_HINT;
      txt.bg = SLOT_BG;
      box.backgroundColor = SLOT_BG;
      box.borderColor = isCursor ? BORDER_CURSOR : BORDER_EMPTY;
    }
  }

  // ── Tableau ───────────────────────────────────────────────────────────
  for (let i = 0; i < 8; i++) {
    const pile = s.tab[i];
    const box = ui.tabBoxes[i];
    const pool = ui.tabPools[i];
    const isCursor = pileEq(s.cursor, { kind: "tab", index: i });
    const isSelSource =
      s.selected != null && pileEq(s.selected.from, { kind: "tab", index: i });
    const selCount = isSelSource ? s.selected!.count : 0;

    // Depth markers: when cursor is on this pile, the bottom-`cursorDepth` cards
    // get a subtle highlight so the user sees what they're about to grab.
    const depthMark =
      isCursor && pile.length > 0 && s.selected == null
        ? Math.min(s.cursorDepth, pile.length)
        : 0;

    // Fill pool slots.
    for (let j = 0; j < POOL_PER_TAB; j++) {
      const t = pool[j];
      if (j < pile.length) {
        const card = pile[j];
        t.visible = true;
        t.content = cardLabel(card);
        t.fg = fgForSuit(card.suit);
        const isSelected = isSelSource && j >= pile.length - selCount;
        const isDepth = !isSelSource && depthMark > 0 && j >= pile.length - depthMark;
        t.bg = isSelected ? SELECT_BG : isDepth ? "#e0f2fe" : CARD_BG;
      } else {
        t.visible = false;
      }
    }
    box.backgroundColor = pile.length === 0 ? SLOT_BG : CARD_BG;
    box.borderColor = isSelSource
      ? BORDER_SELECTED
      : isCursor
      ? BORDER_CURSOR
      : pile.length === 0
      ? BORDER_EMPTY
      : BORDER_NORMAL;
  }

  // ── Status line ───────────────────────────────────────────────────────
  if (isWon(s)) {
    ui.statusText.content = `🏆 You won in ${s.moves} moves! Press [n] for a new game or [q] to quit.`;
    ui.statusText.fg = "#fde047";
  } else if (s.selected) {
    const fp = s.selected.from;
    const name = describePile(fp);
    ui.statusText.content = `Holding ${s.selected.count} card${s.selected.count > 1 ? "s" : ""} from ${name}. Move cursor and press Space to drop, or Space again to cancel.`;
    ui.statusText.fg = "#fbbf24";
  } else {
    ui.statusText.content = `Moves: ${s.moves}   Seed: ${s.seed}   Cursor: ${describePile(s.cursor)}${
      s.cursor.kind === "tab" && s.tab[s.cursor.index].length > 0
        ? ` (depth ${Math.min(s.cursorDepth, s.tab[s.cursor.index].length)})`
        : ""
    }`;
    ui.statusText.fg = STATUS_FG;
  }
}

function describePile(p: PileId): string {
  if (p.kind === "free") return `free cell ${p.index + 1}`;
  if (p.kind === "found") return `foundation ${p.index + 1}`;
  return `column ${p.index + 1}`;
}
