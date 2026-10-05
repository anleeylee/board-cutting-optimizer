#!/usr/bin/env node
/**
 * cli.ts — bfc-cut: Board Layout & Cutting Optimizer CLI.
 *
 * Workflow:  plan --boards boards.csv --parts parts.csv [--svg …] [--pdf …]
 * Try it instantly with:  bfc-cut demo
 */

import { Command } from 'commander';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatInches } from './core';
import { CUT_STRATEGIES, planLayouts } from './features';
import type { CutSettings, CutStrategy } from './features/layout/types';
import { readBoardsFile, readPartsFile } from './features/input';
import { exportAllSVG } from './features/export/svg';
import { exportLayoutPDF } from './features/export/pdf';
import { exportCutSequenceCSV, exportPlacementsCSV, exportSummaryCSV } from './features/export/csv';
import { writeCSV } from './features/io';

const program = new Command();

program.name('bfc-cut').description('Generate a kerf-aware 2D cutting layout for every board.').version('1.0.0');

program
  .command('plan')
  .description('Plan the cutting layout')
  .requiredOption('--boards <file>', 'stock boards CSV/XLSX')
  .requiredOption('--parts <file>', 'required parts CSV/XLSX')
  .option('-s, --strategy <strategy>', `strategy: ${CUT_STRATEGIES.join(' | ')}`, 'balanced')
  .option('--kerf <inches>', 'saw kerf', '0.125')
  .option('--trim <inches>', 'trim allowance', '0.25')
  .option('--joint <inches>', 'jointing allowance', '0.25')
  .option('--plane <inches>', 'planing allowance', '0.125')
  .option('--min-offcut <inches>', 'minimum offcut worth keeping', '2')
  .option('--grain', 'enforce grain constraint (no rotation for edged parts)')
  .option('--svg <prefix>', 'SVG cutting sheets output prefix (e.g. ./cut-sheet)')
  .option('--pdf <file>', 'PDF cutting plan output path')
  .option('--csv <prefix>', 'CSV output prefix (placements/cuts/summary)')
  .option('--json <file>', 'full result JSON output path')
  .action(
    (opts: {
      boards: string;
      parts: string;
      strategy: string;
      kerf: string;
      trim: string;
      joint: string;
      plane: string;
      minOffcut: string;
      grain?: boolean;
      svg?: string;
      pdf?: string;
      csv?: string;
      json?: string;
    }) => {
      const boardsRes = readBoardsFile(opts.boards);
      const partsRes = readPartsFile(opts.parts);
      for (const w of [...boardsRes.warnings, ...partsRes.warnings]) console.warn(`Warning: ${w}`);
      for (const r of [...boardsRes.rejected, ...partsRes.rejected]) console.warn(`  Rejected row ${r.row}: ${r.reason}`);

      const settings: CutSettings = {
        kerf: Number(opts.kerf),
        trimAllowance: Number(opts.trim),
        jointingAllowance: Number(opts.joint),
        planingAllowance: Number(opts.plane),
        minOffcut: Number(opts.minOffcut),
        grainConstraint: !!opts.grain,
      };
      const strategy = CUT_STRATEGIES.includes(opts.strategy as CutStrategy) ? (opts.strategy as CutStrategy) : 'balanced';

      console.log(`Strategy: ${strategy} | kerf ${formatInches(settings.kerf)} | trim ${formatInches(settings.trimAllowance)} | joint ${formatInches(settings.jointingAllowance)}`);
      const result = planLayouts(boardsRes.items, partsRes.items, strategy, settings);

      console.log(
        `Placed ${result.placedQuantity}/${result.totalRequiredQuantity} pieces | used ${result.totalUsedArea.toFixed(0)} in² of ${result.totalBoardArea.toFixed(0)} in² | yield ${result.totalYieldPct.toFixed(1)}%`,
      );
      for (const layout of result.layouts) {
        console.log(
          `  ${layout.board.boardId}: ${layout.placements.length} part(s), yield ${layout.yieldPct.toFixed(1)}%, score ${layout.score.toFixed(2)}`,
        );
        for (const line of layout.explanation.slice(1)) console.log(line);
      }
      if (result.unplaced.length > 0) {
        console.log('Unplaced:');
        for (const u of result.unplaced) console.log(`  ${u.partName || u.partId} ×${u.quantity}: ${u.reason}`);
      }

      if (opts.svg) {
        const files = exportAllSVG(opts.svg, result);
        for (const f of files) console.log(`SVG sheet written to ${f}`);
      }
      if (opts.pdf) {
        exportLayoutPDF(opts.pdf, result).then(() => console.log(`PDF plan written to ${opts.pdf}`));
      }
      if (opts.csv) {
        exportPlacementsCSV(`${opts.csv}-placements.csv`, result);
        exportCutSequenceCSV(`${opts.csv}-cuts.csv`, result);
        exportSummaryCSV(`${opts.csv}-summary.csv`, result);
        console.log(`CSV exports written to ${opts.csv}-*.csv`);
      }
      if (opts.json) {
        writeFileSync(opts.json, JSON.stringify(result, null, 2), 'utf8');
        console.log(`JSON result written to ${opts.json}`);
      }
    },
  );

program
  .command('demo')
  .description('Create sample data in ./demo and generate a full cutting plan')
  .action(async () => {
    const dir = join(process.cwd(), 'demo');
    mkdirSync(dir, { recursive: true });
    const boardsPath = join(dir, 'boards.csv');
    const partsPath = join(dir, 'parts.csv');
    writeCSV(boardsPath, [
      ['Board ID', 'Species', 'Thickness', 'Width', 'Length', 'Defects'],
      ['B-A', 'Black Walnut', '8/4', 12, 96, ''],
      ['B-B', 'Black Walnut', '8/4', 10, 60, '20,2,4,8; 50,0,3,10'],
      ['B-C', 'Black Walnut', '4/4', 8, 72, ''],
    ]);
    writeCSV(partsPath, [
      ['Part ID', 'Part Name', 'Quantity', 'Species', 'Thickness', 'Width', 'Length', 'Grain Direction', 'Rotation Allowed', 'Edge Requirement'],
      ['T1', 'Top', 1, 'Black Walnut', '8/4', 11, 48, 'vertical', 'no', 'two-clean'],
      ['S1', 'Side', 2, 'Black Walnut', '8/4', 9, 30, 'vertical', 'no', 'two-clean'],
      ['S2', 'Inner Side', 2, 'Black Walnut', '8/4', 8, 28, 'vertical', 'no', 'one-clean'],
      ['F1', 'Rail', 4, 'Black Walnut', '4/4', 3, 22, 'any', 'yes', 'none'],
      ['D1', 'Drawer Front', 4, 'Black Walnut', '4/4', 6, 14, 'any', 'yes', 'none'],
    ]);

    const boardsRes = readBoardsFile(boardsPath);
    const partsRes = readPartsFile(partsPath);
    const settings: CutSettings = { kerf: 0.125, trimAllowance: 0.25, jointingAllowance: 0.25, planingAllowance: 0.125, minOffcut: 2, grainConstraint: true };
    const result = planLayouts(boardsRes.items, partsRes.items, 'balanced', settings);

    console.log(`Placed ${result.placedQuantity}/${result.totalRequiredQuantity} pieces | yield ${result.totalYieldPct.toFixed(1)}%`);
    for (const layout of result.layouts) {
      console.log(`  ${layout.board.boardId}: ${layout.placements.length} part(s), yield ${layout.yieldPct.toFixed(1)}%, score ${layout.score.toFixed(2)}`);
      for (const line of layout.explanation.slice(1)) console.log(line);
    }
    if (result.unplaced.length > 0) {
      console.log('Unplaced:');
      for (const u of result.unplaced) console.log(`  ${u.partName || u.partId} ×${u.quantity}: ${u.reason}`);
    }

    const svgFiles = exportAllSVG(join(dir, 'cut-sheet'), result);
    const pdfPath = join(dir, 'cutting-plan.pdf');
    await exportLayoutPDF(pdfPath, result);
    exportPlacementsCSV(join(dir, 'placements.csv'), result);
    exportCutSequenceCSV(join(dir, 'cut-sequences.csv'), result);
    exportSummaryCSV(join(dir, 'summary.csv'), result);
    writeCSV(join(dir, 'boards-export.csv'), [['Board ID', 'Species', 'Thickness', 'Width', 'Length'], ...boardsRes.items.map((b) => [b.boardId, b.species, b.thicknessIn, b.widthIn, b.lengthIn])]);
    console.log(`\nFiles written to ${dir}/`);
    console.log(`  ${svgFiles.map((f) => f.split(/[\\/]/).pop()).join(', ')}`);
    console.log('  cutting-plan.pdf, placements.csv, cut-sequences.csv, summary.csv');
  });

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
