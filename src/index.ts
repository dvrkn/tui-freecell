import { createCliRenderer, type KeyEvent, type MouseEvent } from "@opentui/core";
import {
  newGame,
  applyMove,
  canMove,
  undo,
  isWon,
  foundationFor,
  autoFoundationSweep,
  pileCards,
  isValidRun,
  maxRunFromBottom,
  type GameState,
  type PileId,
} from "./game";
import { buildUi, render, type UI } from "./ui";

// Cursor lanes left-to-right:
//   free 0..3 | found 0..3 | tab 0..7   (top row free+found logically; tab is its own row)
// Up/Down hops between the top row and the tab row, preserving horizontal position
// where it makes sense.

function moveCursorH(s: GameState, dir: -1 | 1) {
  const { kind, index } = s.cursor;
  if (kind === "tab") {
    s.cursor = { kind: "tab", index: clamp(index + dir, 0, 7) };
    s.cursorDepth = 1;
    return;
  }
  // top row: free 0..3 then found 0..3 → flatten to 0..7
  const flat = kind === "free" ? index : 4 + index;
  const next = clamp(flat + dir, 0, 7);
  s.cursor = next < 4 ? { kind: "free", index: next } : { kind: "found", index: next - 4 };
}

function moveCursorV(s: GameState, dir: -1 | 1) {
  if (s.cursor.kind === "tab") {
    // ↑ from tab: jump to top row, preserving horizontal position.
    if (dir < 0) {
      const flat = s.cursor.index;
      s.cursor = flat < 4 ? { kind: "free", index: flat } : { kind: "found", index: flat - 4 };
      s.cursorDepth = 1;
    }
    // ↓ on tab is a no-op (already at the bottom row).
  } else {
    // ↓ from top: jump to tab row.
    if (dir > 0) {
      const flat = s.cursor.kind === "free" ? s.cursor.index : 4 + s.cursor.index;
      s.cursor = { kind: "tab", index: flat };
      s.cursorDepth = 1;
    }
    // ↑ on top row is a no-op.
  }
}

function adjustDepth(s: GameState, delta: 1 | -1) {
  if (s.selected || s.cursor.kind !== "tab") return;
  const pile = s.tab[s.cursor.index];
  const maxRun = maxRunFromBottom(pile);
  if (maxRun === 0) return;
  s.cursorDepth = clamp(s.cursorDepth + delta, 1, maxRun);
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function pickUp(s: GameState): string | null {
  const p = s.cursor;
  const cards = pileCards(s, p);
  if (cards.length === 0) return "Pile is empty.";
  if (p.kind === "found") return "Can't move cards off a foundation.";
  if (p.kind === "free") {
    s.selected = { from: p, count: 1 };
    return null;
  }
  // Tableau: try to take `cursorDepth` cards, but only if they form a valid run.
  const want = Math.min(Math.max(1, s.cursorDepth), cards.length);
  // Find max valid run from the top that is <= want.
  let count = want;
  while (count > 1 && !isValidRun(cards, count)) count--;
  s.selected = { from: p, count };
  return null;
}

function dropOn(s: GameState): string | null {
  if (!s.selected) return null;
  const { from, count } = s.selected;
  const to = s.cursor;
  if (from.kind === to.kind && from.index === to.index) {
    s.selected = null;
    return "Selection cancelled.";
  }
  if (!canMove(s, from, to, count)) return "Illegal move.";
  applyMove(s, from, to, count);
  s.selected = null;
  autoFoundationSweep(s);
  return null;
}

function autoToFoundation(s: GameState): string | null {
  if (s.selected) return "Drop or cancel your selection first.";
  const top = topCardAt(s, s.cursor);
  if (!top) return "Nothing to send.";
  if (s.cursor.kind === "found") return "Already on a foundation.";
  const target = foundationFor(s, top);
  if (target === null) return "No foundation will accept that card.";
  applyMove(s, s.cursor, { kind: "found", index: target }, 1);
  autoFoundationSweep(s);
  return null;
}

function topCardAt(s: GameState, p: PileId) {
  const cards = pileCards(s, p);
  return cards.length ? cards[cards.length - 1] : null;
}

async function main() {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: 30,
    useMouse: true,
  });

  let state = newGame();
  let flash: string | null = null;
  let ui!: UI;

  const draw = () => {
    render(state, ui);
    if (flash) {
      ui.statusText.content = flash;
      ui.statusText.fg = "#fca5a5";
    }
  };

  const onPileClick = (pile: PileId, event: MouseEvent) => {
    flash = null;
    state.cursor = pile;
    if (pile.kind === "tab" && !state.selected) {
      // Map click Y to a card index inside the column (top border = 1 row).
      const box = ui.tabBoxes[pile.index];
      const row = event.y - box.screenY - 1;
      const pileLen = state.tab[pile.index].length;
      state.cursorDepth =
        pileLen > 0 && row >= 0 && row < pileLen ? pileLen - row : 1;
    } else {
      state.cursorDepth = 1;
    }
    flash = state.selected ? dropOn(state) : pickUp(state);
    draw();
  };

  ui = buildUi(renderer, onPileClick);
  draw();

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    flash = null;
    if (key.ctrl && key.name === "c") {
      renderer.destroy();
      process.exit(0);
    }
    switch (key.name) {
      case "q":
        renderer.destroy();
        process.exit(0);
      case "n":
        state = newGame();
        break;
      case "u":
        if (!undo(state)) flash = "Nothing to undo.";
        break;
      case "left":
      case "h":
        moveCursorH(state, -1);
        break;
      case "right":
      case "l":
        moveCursorH(state, 1);
        break;
      case "up":
      case "k":
        moveCursorV(state, -1);
        break;
      case "down":
      case "j":
        moveCursorV(state, 1);
        break;
      case "tab":
        // Tab hops between top row and tab row.
        if (state.cursor.kind === "tab") moveCursorV(state, -1);
        else moveCursorV(state, 1);
        break;
      case "+":
      case "=":
      case "]":
        adjustDepth(state, 1);
        break;
      case "-":
      case "[":
        adjustDepth(state, -1);
        break;
      case "space":
        flash = state.selected ? dropOn(state) : pickUp(state);
        break;
      case "return":
      case "enter":
        flash = autoToFoundation(state);
        break;
      default:
        // Number keys 1-8 jump to tableau column.
        if (key.name && /^[1-8]$/.test(key.name)) {
          state.cursor = { kind: "tab", index: parseInt(key.name, 10) - 1 };
          state.cursorDepth = 1;
        }
        break;
    }
    draw();
    if (isWon(state)) {
      // already reflected in status line by render()
    }
  });

  // Clean terminal restore on unexpected exit.
  const cleanup = () => {
    try {
      renderer.destroy();
    } catch {}
  };
  process.on("uncaughtException", (e) => {
    cleanup();
    console.error(e);
    process.exit(1);
  });
  process.on("SIGTERM", cleanup);
}

main();
