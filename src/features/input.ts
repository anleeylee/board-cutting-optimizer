/**
 * input.ts — Parse stock boards and required parts from CSV/XLSX.
 */

import { z } from 'zod';
import {
  friendlyZodError,
  mapHeaders,
  parseDecimal,
  parseDimension,
  parseThickness,
  cell,
} from '../core';
import { readTableFile } from './io';
import type { CutPartInput, StockBoardInput } from './layout/types';

const BOARD_SYNONYMS: Record<string, string[]> = {
  boardId: ['boardid', 'board id', 'id', 'board', 'stock id'],
  species: ['species', 'wood', 'material'],
  thicknessIn: ['thickness', 'thk', 't'],
  widthIn: ['width', 'wdth', 'w'],
  lengthIn: ['length', 'len', 'l'],
  grainDirection: ['grain', 'grain direction'],
  defects: ['defects', 'defect zones', 'defect'],
  edgeCondition: ['edge', 'edge condition'],
  location: ['location', 'rack'],
};

const PART_SYNONYMS: Record<string, string[]> = {
  partId: ['partid', 'part id', 'id', 'part'],
  partName: ['partname', 'part name', 'name', 'description'],
  quantity: ['quantity', 'qty', 'q', 'count', 'pieces'],
  species: ['species', 'wood', 'material'],
  thicknessIn: ['thickness', 'thk', 't'],
  widthIn: ['width', 'wdth', 'w'],
  lengthIn: ['length', 'len', 'l'],
  grainDirection: ['grain', 'grain direction'],
  rotationAllowed: ['rotation', 'rotate', 'rotation allowed'],
  edgeRequirement: ['edge', 'edge requirement', 'edge req'],
  notes: ['notes', 'note'],
};

export interface ParseResult<T> {
  items: T[];
  rejected: { row: number; reason: string }[];
  warnings: string[];
}

function parseDefects(raw: string): { x: number; y: number; width: number; length: number }[] {
  if (!raw) return [];
  return raw
    .split(';')
    .map((z) => z.trim())
    .filter(Boolean)
    .map((zone) => {
      const [x, y, w, l] = zone.split(',').map((v) => Number(parseDecimal(v)));
      if ([x, y, w, l].some((v) => !Number.isFinite(v) || v! < 0)) {
        throw new Error(`Invalid defect zone "${zone}" (expected x,y,width,length)`);
      }
      return { x: x as number, y: y as number, width: w as number, length: l as number };
    });
}

export function parseBoards(rows: string[][]): ParseResult<StockBoardInput> {
  if (rows.length < 2) return { items: [], rejected: [{ row: 1, reason: 'No data rows' }], warnings: [] };
  const headers = rows[0];
  const { mapping, unmapped } = mapHeaders(headers, BOARD_SYNONYMS);
  const warnings: string[] = [];
  for (const f of unmapped) {
    if (['grainDirection', 'defects', 'edgeCondition', 'location'].includes(f)) continue;
    warnings.push(`Column not found: "${f}"`);
  }

  const items: StockBoardInput[] = [];
  const rejected: ParseResult<StockBoardInput>['rejected'] = [];
  rows.slice(1).forEach((raw, idx) => {
    const rowIndex = idx + 2;
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = raw[i] ?? '';
    });
    const boardId = cell(row, mapping, 'boardId');
    if (!boardId) {
      rejected.push({ row: rowIndex, reason: 'Missing Board ID' });
      return;
    }
    try {
      items.push({
        boardId,
        species: cell(row, mapping, 'species'),
        thicknessIn: parseThickness(cell(row, mapping, 'thicknessIn')).thicknessIn,
        widthIn: parseDimension(cell(row, mapping, 'widthIn')).inches,
        lengthIn: parseDimension(cell(row, mapping, 'lengthIn')).inches,
        grainDirection: ['vertical', 'horizontal'].includes(cell(row, mapping, 'grainDirection').toLowerCase())
          ? (cell(row, mapping, 'grainDirection').toLowerCase() as 'vertical' | 'horizontal')
          : 'any',
        defects: parseDefects(cell(row, mapping, 'defects')),
        edgeCondition: ['rough', 'wane'].includes(cell(row, mapping, 'edgeCondition').toLowerCase())
          ? (cell(row, mapping, 'edgeCondition').toLowerCase() as 'rough' | 'wane')
          : 'clean',
        location: cell(row, mapping, 'location'),
      });
    } catch (err) {
      rejected.push({ row: rowIndex, reason: `${boardId}: ${(err as Error).message}` });
    }
  });
  return { items, rejected, warnings };
}

export function parseParts(rows: string[][]): ParseResult<CutPartInput> {
  if (rows.length < 2) return { items: [], rejected: [{ row: 1, reason: 'No data rows' }], warnings: [] };
  const headers = rows[0];
  const { mapping, unmapped } = mapHeaders(headers, PART_SYNONYMS);
  const warnings: string[] = [];
  for (const f of unmapped) {
    if (['partName', 'grainDirection', 'rotationAllowed', 'edgeRequirement', 'notes'].includes(f)) continue;
    warnings.push(`Column not found: "${f}"`);
  }

  const items: CutPartInput[] = [];
  const rejected: ParseResult<CutPartInput>['rejected'] = [];
  rows.slice(1).forEach((raw, idx) => {
    const rowIndex = idx + 2;
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = raw[i] ?? '';
    });
    const partId = cell(row, mapping, 'partId');
    if (!partId) {
      rejected.push({ row: rowIndex, reason: 'Missing Part ID' });
      return;
    }
    try {
      const grainRaw = cell(row, mapping, 'grainDirection').toLowerCase();
      const edgeRaw = cell(row, mapping, 'edgeRequirement').toLowerCase();
      const rotationRaw = cell(row, mapping, 'rotationAllowed').toLowerCase();
      items.push({
        partId,
        partName: cell(row, mapping, 'partName'),
        quantity: parseDecimal(cell(row, mapping, 'quantity')) ?? 1,
        species: cell(row, mapping, 'species'),
        thicknessIn: parseThickness(cell(row, mapping, 'thicknessIn')).thicknessIn,
        widthIn: parseDimension(cell(row, mapping, 'widthIn')).inches,
        lengthIn: parseDimension(cell(row, mapping, 'lengthIn')).inches,
        grainDirection: ['vertical', 'horizontal'].includes(grainRaw) ? (grainRaw as 'vertical' | 'horizontal') : 'any',
        rotationAllowed: ['no', 'false', 'forbidden', '0', 'n'].includes(rotationRaw) ? false : true,
        edgeRequirement: ['one-clean', 'two-clean'].includes(edgeRaw) ? (edgeRaw as 'one-clean' | 'two-clean') : 'none',
        notes: cell(row, mapping, 'notes'),
      });
    } catch (err) {
      const reason = err instanceof z.ZodError ? friendlyZodError(err) : (err as Error).message;
      rejected.push({ row: rowIndex, reason: `${partId}: ${reason}` });
    }
  });
  return { items, rejected, warnings };
}

export function readBoardsFile(path: string): ParseResult<StockBoardInput> {
  return parseBoards(readTableFile(path));
}

export function readPartsFile(path: string): ParseResult<CutPartInput> {
  return parseParts(readTableFile(path));
}
