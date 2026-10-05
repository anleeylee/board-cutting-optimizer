/**
 * csv.ts — Cutting plan CSV exports (placements + cut sequence).
 */

import { writeCSV } from '../io';
import type { BoardLayout, LayoutResult } from '../layout/types';

export function placementsCSV(result: LayoutResult): (string | number)[][] {
  const head = ['Board ID', 'Part ID', 'Part Name', 'X (in)', 'Y (in)', 'Width (in)', 'Length (in)', 'Rotated'];
  const rows: (string | number)[][] = [head];
  for (const layout of result.layouts) {
    for (const p of layout.placements) {
      rows.push([
        layout.board.boardId,
        p.partId,
        p.partName,
        r2(p.rect.x),
        r2(p.rect.y),
        r2(p.rect.w),
        r2(p.rect.l),
        p.rotated ? 'yes' : 'no',
      ]);
    }
  }
  return rows;
}

export function cutSequenceCSV(result: LayoutResult): (string | number)[][] {
  const head = ['Board ID', 'Step', 'Type', 'Position (in)', 'Label'];
  const rows: (string | number)[][] = [head];
  for (const layout of result.layouts) {
    layout.cutSequence.forEach((s, i) => {
      rows.push([layout.board.boardId, i + 1, s.type, r2(s.at), s.label]);
    });
  }
  return rows;
}

export function exportPlacementsCSV(path: string, result: LayoutResult): void {
  writeCSV(path, placementsCSV(result));
}

export function exportCutSequenceCSV(path: string, result: LayoutResult): void {
  writeCSV(path, cutSequenceCSV(result));
}

export function layoutSummaryRows(result: LayoutResult): (string | number)[][] {
  const head = ['Board ID', 'Species', 'Width', 'Length', 'Used in²', 'Waste in²', 'Yield %', 'Parts', 'Cuts'];
  const rows: (string | number)[][] = [head];
  for (const l of result.layouts) {
    rows.push([
      l.board.boardId,
      l.board.species,
      l.board.widthIn,
      l.board.lengthIn,
      r1(l.usedArea),
      r1(l.wasteArea),
      r1(l.yieldPct),
      l.placements.length,
      l.cutCount,
    ]);
  }
  return rows;
}

export function exportSummaryCSV(path: string, result: LayoutResult): void {
  writeCSV(path, layoutSummaryRows(result));
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
function r1(v: number): number {
  return Math.round(v * 10) / 10;
}
