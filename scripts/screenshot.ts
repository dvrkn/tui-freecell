// Render one frame of the game to an SVG screenshot.
// Run: bun run scripts/screenshot.ts
import { createTestRenderer } from "@opentui/core/testing";
import { newGame } from "../src/game";
import { buildUi, render } from "../src/ui";
import type { CapturedFrame, CapturedSpan } from "@opentui/core";
import { writeFileSync } from "node:fs";

const COLS = 80;
const ROWS = 22;

// Use a fixed seed so the screenshot is reproducible.
const SEED = 0x5eedbeef;

// Cell dimensions for the rasterised SVG (rough match to a 14px monospace).
const CW = 8.4;
const CH = 17;
const FONT = 14;

function rgba(c: { r: number; g: number; b: number; a: number }): string {
  // OpenTUI exposes r/g/b in 0..1 floats (×255 for ints) and a 0..1.
  const [r, g, b, a] = c.buffer ? Array.from(c.toInts()) : [0, 0, 0, 0];
  if (a === 0) return "transparent";
  return `rgb(${r},${g},${b})`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svgFromFrame(frame: CapturedFrame): string {
  const W = frame.cols * CW;
  const H = frame.rows * CH;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="ui-monospace, 'SF Mono', Menlo, Consolas, monospace" font-size="${FONT}">`,
  );
  // Backdrop matching a typical dark terminal.
  parts.push(`<rect width="100%" height="100%" fill="#0f1419"/>`);

  for (let row = 0; row < frame.lines.length; row++) {
    const line = frame.lines[row];
    let col = 0;
    for (const span of line.spans) {
      const bg = rgba(span.bg as any);
      const fg = rgba(span.fg as any);
      const x = col * CW;
      const y = row * CH;
      if (bg !== "transparent") {
        parts.push(
          `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(span.width * CW).toFixed(2)}" height="${CH}" fill="${bg}"/>`,
        );
      }
      if (span.text.trim().length > 0) {
        // Baseline ~ y + CH * 0.78 sits text nicely inside the row.
        const tx = x.toFixed(2);
        const ty = (y + CH * 0.78).toFixed(2);
        parts.push(
          `<text x="${tx}" y="${ty}" fill="${fg}" xml:space="preserve">${esc(span.text)}</text>`,
        );
      }
      col += span.width;
    }
  }
  parts.push(`</svg>`);
  return parts.join("\n");
}

async function main() {
  const { renderer, renderOnce, captureSpans } = await createTestRenderer({
    width: COLS,
    height: ROWS,
  });
  const state = newGame(SEED);
  const ui = buildUi(renderer);
  render(state, ui);
  await renderOnce();
  const frame = captureSpans();
  const svg = svgFromFrame(frame);
  writeFileSync("docs/screenshot.svg", svg);
  console.log(`Wrote docs/screenshot.svg (${frame.cols}×${frame.rows})`);
  process.exit(0);
}

main();
