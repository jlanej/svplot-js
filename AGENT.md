# Agent Guide — svplot-js

Quick-reference documentation for AI agents working on this codebase.

## Project Overview

**svplot-js** is a browser-based structural variant (SV) visualization tool inspired by [samplot](https://github.com/ryanlayer/samplot). It reads indexed BAM files in the browser using [@gmod/bam](https://github.com/GMOD/bam-js) and renders samplot-style visualizations on an HTML5 Canvas. This is an AI-generated prototype, not a production tool.

## Repository Layout

```
svplot-js/                      # Root (contains README, LICENSE, CI)
├── .github/workflows/ci.yml   # GitHub Actions CI
├── README.md
├── svplot-js/                  # Main npm package
│   ├── package.json
│   ├── babel.config.js         # Babel (transpile ESM → CJS for Jest)
│   ├── webpack.config.js       # UMD bundle config
│   ├── src/                    # Source (ES modules)
│   │   ├── index.js            # Main Samplot class (public API)
│   │   ├── bam-reader.js       # BAM file reading (@gmod/bam wrapper)
│   │   ├── data-processor.js   # Read classification & coverage
│   │   ├── renderer.js         # Canvas rendering engine
│   │   ├── constants.js        # Colors, defaults, SAM flags
│   │   └── utils.js            # Coordinate mapping, formatting
│   ├── test/
│   │   ├── samplot.test.js         # Unit tests (utils, DataProcessor)
│   │   ├── integration.test.js     # Integration test (chr4 DEL)
│   │   ├── comprehensive.test.js   # Comprehensive tests (Renderer, edge cases, multi-variant)
│   │   └── generate-images.test.js # Generates example PNGs for README
│   └── examples/
│       ├── index.html          # Interactive browser demo
│       └── images/             # Auto-generated example PNGs
└── test/data/                  # Shared BAM test data (samplot project)
```

## Quick Commands

All commands run from the `svplot-js/` directory:

```bash
npm install                     # Install dependencies
npm test                        # Run all tests with coverage (jest --coverage)
npm run build                   # Build UMD bundle (dist/samplot.js)
npm run build:dev               # Build unminified bundle
npm run generate-examples       # Generate example images (jest test/generate-images.test.js)
npx jest test/samplot.test.js   # Run a single test file
npx jest --watch                # Watch mode for development
```

## Architecture

### Source Modules (`src/`)

| Module | Role | Key Class/Exports |
|--------|------|-------------------|
| `index.js` | Public API, orchestration | `Samplot` (default), re-exports sub-modules |
| `bam-reader.js` | BAM file access (remote URLs, local files) | `BamReader` |
| `data-processor.js` | Classify reads, compute coverage | `DataProcessor` |
| `renderer.js` | Canvas rendering (coverage, reads, legend) | `Renderer` |
| `constants.js` | Configuration constants | `COLORS`, `COVERAGE_COLORS`, `READ_STYLES`, `DEFAULTS`, `FLAGS` |
| `utils.js` | Coordinate math, formatting | `mapGenomeToPlot`, `calculateRanges`, `formatSize`, etc. |

### Data Flow

```
BAM File → BamReader.fetchReads() → raw records
         → DataProcessor.processReads() → { pairs, splits, coverage, maxCoverage }
         → Renderer.render() → Canvas visualization
```

### Module Details

- **Source files use ES module syntax** (`import`/`export`). Babel transpiles to CJS for Jest.
- **Renderer** is compatible with both browser `<canvas>` and Node.js `@napi-rs/canvas` (fallback path when `getBoundingClientRect` is unavailable).
- **DataProcessor** works entirely in Node.js (no DOM dependency).
- **BamReader** wraps `@gmod/bam`; supports `RemoteFile` (URL) and `LocalFile` (local path / File object).

## Test Data

Test BAM files live in `test/data/` (root, not inside `svplot-js/`).

| File | Type | Chromosome Naming |
|------|------|-------------------|
| `NA12878_restricted.bam` | Short-read (Illumina) | `chr`-prefixed |
| `NA12889_restricted.bam` | Short-read (Illumina) | `chr`-prefixed |
| `NA12890_restricted.bam` | Short-read (Illumina) | `chr`-prefixed |
| `HG002_Illumina.bam` | Short-read (Illumina) | Non-prefixed (`1`, `4`, etc.) |
| `HG003_Illumina.bam` | Short-read (Illumina) | Non-prefixed |
| `HG004_Illumina.bam` | Short-read (Illumina) | Non-prefixed |
| `hg19_chr1_*_deletion.bam` | Long-read | `chr`-prefixed, unpaired reads |
| `hg19_chr21_*_inversion.bam` | Long-read | `chr`-prefixed, unpaired reads |

**Important:** The NA12878/89/90 files contain paired-end short reads; the hg19 deletion/inversion files contain long unpaired reads (PacBio/ONT style). When writing tests, check `isPaired()` before expecting paired reads.

## Key Patterns & Conventions

1. **Chromosome naming**: Use `stripChr()` for comparisons. Some BAMs use `chr1`, others use `1`.
2. **Region padding**: `calculateRanges(chrom, start, end, 0.15)` adds 15% padding (min 100bp).
3. **Event classification**: Read orientation determines event type:
   - Forward-Reverse → `Deletion/Normal`
   - Reverse-Forward → `Duplication`
   - Same strand → `Inversion`
4. **Coverage arrays**: `Float32Array` indexed by `position - region.start`.
5. **Read filtering**: `_shouldSkip()` filters unmapped, QC-fail, duplicate, secondary, supplementary, and low-MAPQ reads.
6. **Canvas compatibility**: The Renderer checks `typeof canvas.getBoundingClientRect === 'function'` to distinguish browser vs Node.js canvas.

## CI Pipeline

The GitHub Actions workflow (`.github/workflows/ci.yml`):

1. **test** job: Runs on every push/PR to `main`
   - `npm ci` → `npx jest --coverage` → `npm run build`
2. **generate-examples** job: Runs only on push to `main` (after tests pass)
   - Generates example PNGs → commits them back to the repo

## Adding New Features

### Adding a new SV type visualization
1. Add color mapping in `constants.js` → `COLORS`
2. Add event classification logic in `data-processor.js` → `_getEventType()`
3. Add test BAM data to `test/data/`
4. Add integration test in `test/comprehensive.test.js`
5. Add example to `test/generate-images.test.js` to auto-generate a reference image

### Adding a new rendering element
1. Add drawing method to `renderer.js`
2. Call it from `render()` at the appropriate layout position
3. Add a Renderer test in `test/comprehensive.test.js`
4. Regenerate examples: `npm run generate-examples`

## Dependencies

| Package | Purpose | Dev-only? |
|---------|---------|-----------|
| `@gmod/bam` | BAM file reading | No |
| `generic-filehandle` | File abstraction (remote/local) | No |
| `@napi-rs/canvas` | Node.js canvas for image generation | Yes |
| `jest` | Test framework | Yes |
| `jest-environment-jsdom` | DOM simulation for tests | Yes |
| `webpack` + `babel` | Bundling & transpilation | Yes |
