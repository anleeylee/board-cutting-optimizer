/**
 * guillotine.ts — 2D guillotine cutting-stock heuristic.
 *
 * Flow (per the spec):
 *   1. Filter compatible boards          6. Apply kerf to every cut
 *   2. Normalize units (inches)          7. Test rotation
 *   3. Add allowances (trim/joint/plane) 8. Recalculate remaining regions
 *   4. Sort parts by area                9. Score layouts
 *   5. Place largest parts first        10. Return best layouts
 *
 * Free-space management is guillotine-safe: every placement splits the free
 * rectangle into two axis-aligned strips, and every cut consumes kerf along
 * its full length. Defect zones are subtracted from free space up front, so
 * a part can never overlap a defect.
 */

import { formatInches } from '../../core';
import type {
  BoardLayout,
  CutPartInput,
  CutSettings,
  CutStep,
  CutStrategy,
  LayoutResult,
  PlacedPart,
  Rect,
  StockBoardInput,
  UnplacedPart,
} from './types';
import { scoreLayout, LAYOUT_SCORE_WEIGHTS } from './score';

interface FreeRect extends Rect {}

export function rectArea(r: Rect): number {
  return r.w * r.l;
}

/** A rectangle to subtract, in either Rect (w/l) or DefectRect (width/length) form. */
export interface SubtractInput {
  x: number;
  y: number;
  width?: number;
  length?: number;
  w?: number;
  l?: number;
}

/** Subtract a defect rect from a list of free rects (keeps rects defect-free). */
export function subtractRect(free: FreeRect[], defect: SubtractInput): FreeRect[] {
  const dw = defect.width ?? defect.w ?? 0;
  const dl = defect.length ?? defect.l ?? 0;
  const out: FreeRect[] = [];
  for (const r of free) {
    const ox1 = Math.max(r.x, defect.x);
    const oy1 = Math.max(r.y, defect.y);
    const ox2 = Math.min(r.x + r.l, defect.x + dl);
    const oy2 = Math.min(r.y + r.w, defect.y + dw);
    if (ox2 <= ox1 || oy2 <= oy1) {
      out.push(r);
      continue;
    }
    if (ox1 > r.x) out.push({ x: r.x, y: r.y, w: r.w, l: ox1 - r.x });
    if (ox2 < r.x + r.l) out.push({ x: ox2, y: r.y, w: r.w, l: r.x + r.l - ox2 });
    if (oy1 > r.y) out.push({ x: r.x, y: r.y, w: oy1 - r.y, l: r.l });
    if (oy2 < r.y + r.w) out.push({ x: r.x, y: oy2, w: r.y + r.w - oy2, l: r.l });
  }
  return out.filter((r) => r.w > 1e-9 && r.l > 1e-9);
}

export interface SizedPart {
  part: CutPartInput;
  /** Width across the board (after allowances, before kerf). */
  pw: number;
  /** Length along the board. */
  pl: number;
  rotated: boolean;
}

/** Add trim/jointing allowances to a part's finished size. */
export function sizedPart(part: CutPartInput, settings: CutSettings): { pw: number; pl: number } {
  const pw = part.widthIn + settings.trimAllowance + settings.jointingAllowance * 2;
  const pl = part.lengthIn + settings.trimAllowance + settings.jointingAllowance * 2;
  return { pw, pl };
}

/** Resolve the orientation a part may take on a board, or null. */
export function resolveCutOrientation(
  part: CutPartInput,
  settings: CutSettings,
): { pw: number; pl: number; rotated: boolean }[] {
  const { pw, pl } = sizedPart(part, settings);
  const grainFixed = settings.grainConstraint && part.edgeRequirement !== 'none';
  const canRotate = part.rotationAllowed && !grainFixed && part.grainDirection !== 'vertical';

  if (part.grainDirection === 'vertical') {
    return [{ pw, pl, rotated: false }];
  }
  if (part.grainDirection === 'horizontal') {
    return [{ pw: pl, pl: pw, rotated: true }];
  }
  const options: { pw: number; pl: number; rotated: boolean }[] = [{ pw, pl, rotated: false }];
  if (canRotate && part.lengthIn !== part.widthIn) {
    options.push({ pw: pl, pl: pw, rotated: true });
  }
  return options;
}

export function boardCompatible(board: StockBoardInput, part: CutPartInput): string | null {
  if (part.species.toLowerCase() !== 'any' && board.species.toLowerCase() !== 'any') {
    if (board.species.trim().toLowerCase() !== part.species.trim().toLowerCase()) {
      return `species mismatch (${part.species} vs ${board.species})`;
    }
  }
  const boardQ = Math.round(board.thicknessIn * 4);
  const partQ = Math.round(part.thicknessIn * 4);
  if (boardQ !== partQ) return `thickness mismatch (${part.thicknessIn}" part vs ${board.thicknessIn}" board)`;
  return null;
}

/** Find a free rect that fits (pw × pl), densest first. */
function findFit(free: FreeRect[], pw: number, pl: number): FreeRect | null {
  let best: FreeRect | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const r of free) {
    if (r.w + 1e-9 >= pw && r.l + 1e-9 >= pl) {
      const a = rectArea(r);
      if (a < bestArea) {
        bestArea = a;
        best = r;
      }
    }
  }
  return best;
}

/**
 * Place a part in a free rect with a guillotine split. Kerf is subtracted
 * from both resulting strips. Returns the new free list or null if the part
 * does not fit.
 */
export function placeWithSplit(
  free: FreeRect[],
  rect: FreeRect,
  pw: number,
  pl: number,
  kerf: number,
  minOffcut: number,
): FreeRect[] | null {
  if (rect.w + 1e-9 < pw || rect.l + 1e-9 < pl) return null;

  const remaining = free.filter((r) => r !== rect);

  // Option A: vertical cut along length (part at origin, strip to the right).
  const right = rect.l - pl - kerf;
  const topA = rect.w - pw - kerf;
  // Option B: horizontal cut along width (strip above the part).
  const top = rect.w - pw - kerf;
  const rightB = rect.l - pl - kerf;

  // Build both options; pick the one keeping the larger usable region.
  const optionA: FreeRect[] = [];
  if (right >= minOffcut) optionA.push({ x: rect.x + pl + kerf, y: rect.y, w: rect.w, l: right });
  if (topA >= minOffcut) optionA.push({ x: rect.x, y: rect.y + pw + kerf, w: topA, l: pl });

  const optionB: FreeRect[] = [];
  if (top >= minOffcut) optionB.push({ x: rect.x, y: rect.y + pw + kerf, w: top, l: rect.l });
  // Horizontal split: the strip to the right is only as wide as the part.
  if (rightB >= minOffcut) optionB.push({ x: rect.x + pl + kerf, y: rect.y, w: pw, l: rightB });

  const area = (list: FreeRect[]) => list.reduce((s, r) => s + rectArea(r), 0);
  const chosen = area(optionA) >= area(optionB) ? optionA : optionB;

  return [...remaining, ...chosen];
}

export interface PackedItem {
  part: CutPartInput;
  rect: Rect;
  rotated: boolean;
  netWidth: number;
  netLength: number;
}

/** Pack as many parts as possible onto one board (items sorted by caller). */
export function packBoard(
  board: StockBoardInput,
  items: SizedPart[],
  settings: CutSettings,
): { placements: PackedItem[]; freeRects: FreeRect[]; failed: SizedPart[] } {
  let free: FreeRect[] = [{ x: 0, y: 0, w: board.widthIn, l: board.lengthIn }];
  for (const d of board.defects) {
    free = subtractRect(free, { x: d.x, y: d.y, w: d.width, l: d.length });
  }
  // Drop unusably small strips.
  free = free.filter((r) => r.w >= settings.minOffcut && r.l >= settings.minOffcut);

  const placements: PackedItem[] = [];
  const failed: SizedPart[] = [];

  for (const item of items) {
    let placed = false;
    for (const orient of resolveCutOrientation(item.part, settings)) {
      const rect = findFit(free, orient.pw, orient.pl);
      if (!rect) continue;
      const next = placeWithSplit(free, rect, orient.pw, orient.pl, settings.kerf, settings.minOffcut);
      if (!next) continue;
      free = next;
      placements.push({
        part: item.part,
        rect: { x: rect.x, y: rect.y, w: orient.pw, l: orient.pl },
        rotated: orient.rotated,
        netWidth: item.part.widthIn,
        netLength: item.part.lengthIn,
      });
      placed = true;
      break;
    }
    if (!placed) failed.push(item);
  }

  return { placements, freeRects: free, failed };
}

function buildCutSequence(board: StockBoardInput, placements: PackedItem[], settings: CutSettings): CutStep[] {
  const steps: CutStep[] = [];
  if (settings.trimAllowance > 0) {
    steps.push({
      type: 'crosscut',
      at: settings.trimAllowance,
      from: 0,
      to: settings.trimAllowance,
      label: `Trim end ${formatInches(settings.trimAllowance)}`,
    });
  }
  const sorted = [...placements].sort((a, b) => a.rect.x - b.rect.x);
  for (const p of sorted) {
    steps.push({
      type: 'crosscut',
      at: p.rect.x + p.rect.l,
      from: p.rect.x,
      to: p.rect.x + p.rect.l,
      partId: p.part.partId,
      label: `Crosscut at ${formatInches(p.rect.x + p.rect.l)} (${p.part.partName || p.part.partId})`,
    });
    steps.push({
      type: 'rip',
      at: p.rect.y,
      from: p.rect.y,
      to: p.rect.y + p.rect.w,
      partId: p.part.partId,
      label: `Rip to ${formatInches(p.rect.w)} (${p.part.partName || p.part.partId})`,
    });
  }
  return steps;
}

function sortPartsFor(items: SizedPart[], strategy: CutStrategy): SizedPart[] {
  const sorted = [...items];
  switch (strategy) {
    case 'min-cuts':
      sorted.sort((a, b) => b.part.lengthIn - a.part.lengthIn);
      break;
    case 'grain-priority':
      // Fixed-grain parts first so they grab the best real estate.
      sorted.sort((a, b) => Number(b.part.grainDirection !== 'any') - Number(a.part.grainDirection !== 'any') || b.pl * b.pw - a.pl * a.pw);
      break;
    default:
      sorted.sort((a, b) => b.pl * b.pw - a.pl * a.pw);
      break;
  }
  return sorted;
}

function sortBoardsFor(boards: StockBoardInput[], strategy: CutStrategy): StockBoardInput[] {
  const sorted = [...boards];
  switch (strategy) {
    case 'min-cuts':
      sorted.sort((a, b) => b.lengthIn - a.lengthIn);
      break;
    default:
      sorted.sort((a, b) => b.widthIn * b.lengthIn - a.widthIn * a.lengthIn);
      break;
  }
  return sorted;
}

export function planLayouts(
  boards: StockBoardInput[],
  parts: CutPartInput[],
  strategy: CutStrategy,
  settings: CutSettings,
): LayoutResult {
  // Expand quantities into sized items.
  const pool: SizedPart[] = [];
  for (const part of parts) {
    if (part.quantity <= 0 || part.quantity % 1 !== 0) {
      throw new Error(`Part ${part.partId} has invalid quantity ${part.quantity}`);
    }
    for (let i = 0; i < part.quantity; i++) {
      const { pw, pl } = sizedPart(part, settings);
      pool.push({ part, pw, pl, rotated: false });
    }
  }

  const layouts: BoardLayout[] = [];
  const unplaced: UnplacedPart[] = [];
  const weights = LAYOUT_SCORE_WEIGHTS[strategy];
  let totalRequiredQuantity = parts.reduce((s, p) => s + p.quantity, 0);
  let placedQuantity = 0;
  let totalRequiredArea = 0;
  let totalUsedArea = 0;
  let totalBoardArea = 0;

  let remaining = [...pool];
  for (const board of sortBoardsFor(boards, strategy)) {
    if (remaining.length === 0) break;
    const order = sortPartsFor(remaining, strategy);
    const { placements, freeRects, failed } = packBoard(board, order, settings);

    const usedArea = placements.reduce((s, p) => s + rectArea(p.rect), 0);
    const boardArea = board.widthIn * board.lengthIn;
    const wasteArea = Math.max(0, boardArea - usedArea);
    const yieldPct = boardArea > 0 ? (usedArea / boardArea) * 100 : 0;
    const cutCount = placements.length * 2;

    const layout: BoardLayout = {
      board,
      placements: placements.map((p) => ({
        partId: p.part.partId,
        partName: p.part.partName,
        rect: p.rect,
        rotated: p.rotated,
        netWidth: p.netWidth,
        netLength: p.netLength,
      })),
      usableArea: boardArea,
      usedArea,
      wasteArea,
      yieldPct,
      cutCount,
      score: 0,
      cutSequence: buildCutSequence(board, placements, settings),
      freeRects,
      explanation: [],
    };
    layout.score = scoreLayout(layout, weights);

    // Explain.
    const b = board;
    layout.explanation.push(
      `Board ${b.boardId} (${b.species}, ${b.thicknessIn}" × ${b.widthIn}" × ${b.lengthIn}") — placed ${placements.length} part(s), ${usedArea.toFixed(1)} in² used of ${boardArea.toFixed(1)} in², yield ${yieldPct.toFixed(1)}%, score ${layout.score.toFixed(2)}`,
    );
    for (const p of layout.placements) {
      layout.explanation.push(
        `  ${p.partName || p.partId} @ x=${formatInches(p.rect.x)} y=${formatInches(p.rect.y)} (${formatInches(p.rect.w)} × ${formatInches(p.rect.l)})${p.rotated ? ' rotated' : ''}`,
      );
    }

    layouts.push(layout);
    placedQuantity += placements.length;
    totalUsedArea += usedArea;
    totalBoardArea += boardArea;

    // Items that failed on this board stay available for the next one.
    remaining = failed;
  }

  // Aggregate unplaced by part id.
  const unplacedMap = new Map<string, { part: CutPartInput; count: number }>();
  for (const f of remaining) {
    const hit = unplacedMap.get(f.part.partId);
    if (hit) hit.count += 1;
    else unplacedMap.set(f.part.partId, { part: f.part, count: 1 });
  }
  for (const [partId, v] of unplacedMap) {
    unplaced.push({
      partId,
      partName: v.part.partName,
      quantity: v.count,
      widthIn: v.part.widthIn,
      lengthIn: v.part.lengthIn,
      reason: explainUnplaced(v.part, boards, settings),
    });
  }

  for (const p of parts) totalRequiredArea += p.widthIn * p.lengthIn * p.quantity;

  return {
    strategy,
    settings,
    layouts,
    unplaced,
    totalRequiredArea,
    totalUsedArea,
    totalBoardArea,
    totalWasteArea: Math.max(0, totalBoardArea - totalUsedArea),
    totalYieldPct: totalBoardArea > 0 ? (totalUsedArea / totalBoardArea) * 100 : 0,
    placedQuantity,
    totalRequiredQuantity,
  };
}

function explainUnplaced(part: CutPartInput, boards: StockBoardInput[], settings: CutSettings): string {
  if (boards.length === 0) return 'No boards provided';
  const sameSpecies = boards.filter((b) => b.species.toLowerCase() === 'any' || part.species.toLowerCase() === 'any' || b.species === part.species);
  if (sameSpecies.length === 0) return `No ${part.species} boards available`;
  const maxW = Math.max(...sameSpecies.map((b) => b.widthIn));
  const maxL = Math.max(...sameSpecies.map((b) => b.lengthIn));
  const { pw, pl } = sizedPart(part, settings);
  if (pl > maxL) return `Part ${formatInches(part.lengthIn)}" longer than the longest compatible board (${formatInches(maxL)})`;
  if (pw > maxW) return `Part ${formatInches(part.widthIn)}" wider than the widest compatible board (${formatInches(maxW)})`;
  return `No compatible board has room for ${formatInches(part.widthIn)}"×${formatInches(part.lengthIn)}" (kerf, defects or grain constraints)`;
}
