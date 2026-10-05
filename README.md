# bfc-cut — Board Layout & Cutting Optimizer

Generate an actual **2D cutting layout for every board** before you touch the
saw. Kerf-aware guillotine cutting with grain and defect constraints, five
scoring strategies, and printable SVG / PDF cutting sheets plus CSV exports —
the missing link between a cut list and the saw.

Companion guide: [Board Foot Cut List Calculator](https://boardfootcalc.net/board-foot-cut-list-calculator/) ·
See also [How to Calculate Board Feet](https://boardfootcalc.net/how-to-calculate-board-feet/)
and [Board Feet vs Square Feet](https://boardfootcalc.net/board-feet-vs-square-feet/).

## Features

- **Real 2D guillotine layout** — parts are placed on each board, every cut
  splits the remaining free rectangles into two, and each cut consumes the
  **kerf** width (default 1/8").
- **Defect zones** — free space is cut around marked defect rectangles;
  parts never land on a defect.
- **Grain & edge constraints** — vertical-grain parts and edge-required parts
  (`one-clean` / `two-clean`) are never rotated when the grain constraint is
  on.
- **5 strategies** — `max-yield`, `min-waste`, `min-cuts`, `grain-priority`,
  `balanced`.
- **Trim / joint / plane allowances** — cut-to-size logic for real workshops.
- **Offcut policy** — minimum offcut length worth keeping, leftovers counted
  in yield.
- **Exports** — SVG cutting sheets (true scale, labeled parts, defect marks),
  PDF cutting plan (one page per board + cut sequence), CSV placements /
  cut-sequences / summary, full JSON.

## Install

```bash
git clone <your-repo-url> bfc-cut
cd bfc-cut
npm install
npm run build
npm test
```

## Quick start

```bash
npm run demo
# generates ./demo/{boards.csv, parts.csv}, cutting sheets, PDF and CSVs
```

Or:

```bash
# Plan with defaults, exporting everything
bfc-cut plan --boards boards.csv --parts parts.csv \
  --strategy balanced --kerf 0.125 --trim 0.25 \
  --svg ./cut-sheet --pdf ./cutting-plan.pdf --csv ./plan --json ./plan.json
```

## CLI reference

```
bfc-cut plan --boards <file> --parts <file>
             [--strategy max-yield|min-waste|min-cuts|grain-priority|balanced]
             [--kerf 0.125] [--trim 0.25] [--joint 0.25] [--plane 0.125]
             [--min-offcut 2] [--grain]
             [--svg <prefix>] [--pdf <file>] [--csv <prefix>] [--json <file>]
bfc-cut demo
```

## Input formats

**Boards CSV** — defects as `x,y,width,length` zones separated by `;`:

| Board ID | Species | Thickness | Width | Length | Defects |
|---|---|---|---|---|---|
| B-A | Black Walnut | 8/4 | 12 | 96 | |
| B-B | Black Walnut | 8/4 | 10 | 60 | 20,2,4,8; 50,0,3,10 |

**Parts CSV**:

| Part ID | Part Name | Quantity | Species | Thickness | Width | Length | Grain Direction | Rotation Allowed | Edge Requirement |
|---|---|---|---|---|---|---|---|---|---|
| T1 | Top | 1 | Black Walnut | 8/4 | 24 | 48 | vertical | no | two-clean |
| F1 | Rail | 4 | Black Walnut | 4/4 | 3 | 22 | any | yes | none |

## Engine

Frozen copy of the shared
[BoardFootCalc Desktop Lumber Calculation Engine](https://boardfootcalc.net/) in `src/core/`
— board feet, units, thickness parsing and yield math are identical across
all five tools and the [online calculators](https://boardfootcalc.net/).

## Tests

```bash
npm test   # guillotine layout, kerf, defects, grain, strategies
```

## License

MIT. Verify cuts against your saw setup before cutting.
