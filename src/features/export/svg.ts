/**
 * svg.ts — Real-scale SVG cutting sheet.
 *
 * Colors are a visual aid only: every part also carries a text label with
 * its ID and size, so the sheet is usable in black and white.
 */

import { writeFileSync } from 'node:fs';
import { formatInches } from '../../core';
import type { BoardLayout, LayoutResult } from '../layout/types';

const PALETTE = ['#cfe8ff', '#ffe9c7', '#d6f5d6', '#f3d9f3', '#fff2b8', '#d9e6ff', '#ffd9d9', '#e0e0ff', '#c7f0ea', '#ffe0f0'];

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string));
}

export function layoutToSVG(layout: BoardLayout): string {
  const b = layout.board;
  const pad = 30;
  const scale = Math.min(1200 / b.lengthIn, 600 / b.widthIn, 20);
  const W = b.lengthIn * scale + pad * 2;
  const H = b.widthIn * scale + pad * 2;

  const parts: string[] = [];
  let colorIdx = 0;
  for (const p of layout.placements) {
    const x = pad + p.rect.x * scale;
    const y = pad + p.rect.y * scale;
    const w = p.rect.l * scale;
    const h = p.rect.w * scale;
    const fill = PALETTE[colorIdx++ % PALETTE.length];
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="#333" stroke-width="1.5"/>` +
        `<text x="${x + w / 2}" y="${y + h / 2 - 3}" font-size="11" text-anchor="middle" fill="#000">${escapeXml(p.partName || p.partId)}</text>` +
        `<text x="${x + w / 2}" y="${y + h / 2 + 11}" font-size="9" text-anchor="middle" fill="#000">${formatInches(p.rect.w)} × ${formatInches(p.rect.l)}${p.rotated ? ' (R)' : ''}</text>`,
    );
  }

  const defects = b.defects
    .map(
      (d) =>
        `<rect x="${pad + d.x * scale}" y="${pad + d.y * scale}" width="${d.length * scale}" height="${d.width * scale}" fill="url(#hatch)" stroke="#a00" stroke-width="1"/>` +
        `<text x="${pad + (d.x + d.length / 2) * scale}" y="${pad + (d.y + d.width / 2) * scale}" font-size="8" text-anchor="middle" fill="#a00">DEFECT</text>`,
    )
    .join('');

  const wasteRects = layout.freeRects
    .map(
      (r) =>
        `<rect x="${pad + r.x * scale}" y="${pad + r.y * scale}" width="${r.l * scale}" height="${r.w * scale}" fill="none" stroke="#999" stroke-width="0.6" stroke-dasharray="3,3"/>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(1)}" height="${H.toFixed(1)}" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}">
  <defs>
    <pattern id="hatch" width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="6" stroke="#a00" stroke-width="1"/>
    </pattern>
  </defs>
  <rect x="${pad}" y="${pad}" width="${b.lengthIn * scale}" height="${b.widthIn * scale}" fill="#faf6ee" stroke="#000" stroke-width="2"/>
  ${defects}
  ${wasteRects}
  ${parts.join('\n  ')}
  <text x="${pad}" y="${H - 6}" font-size="10" fill="#333">${escapeXml(`${b.boardId} — ${b.species}, ${b.thicknessIn}" × ${b.widthIn}" × ${b.lengthIn}" | yield ${layout.yieldPct.toFixed(1)}% | score ${layout.score.toFixed(2)}`)}</text>
</svg>`;
}

export function exportLayoutSVG(path: string, layout: BoardLayout): void {
  writeFileSync(path, layoutToSVG(layout), 'utf8');
}

export function exportAllSVG(pathPrefix: string, result: LayoutResult): string[] {
  const files: string[] = [];
  result.layouts.forEach((layout, i) => {
    const path = `${pathPrefix}-${layout.board.boardId}.svg`;
    exportLayoutSVG(path, layout);
    files.push(path);
  });
  return files;
}
