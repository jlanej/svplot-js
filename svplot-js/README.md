# samplot.js

Browser-based interactive structural variant visualization, ported from [samplot](https://github.com/ryanlayer/samplot).

samplot.js reads indexed BAM files directly in the browser and renders samplot-style visualizations on an HTML5 Canvas — no server-side processing required.

## Features

- **Browser-native BAM reading** via [@gmod/bam](https://github.com/GMOD/bam-js)
- **Canvas rendering** matching Python samplot's visual style
- Coverage tracks with high/low mapping quality separation
- Paired-end read visualization colored by event type (DEL/DUP/INV)
- Split-read visualization
- Variant bar with SV size annotation
- Interactive navigation (zoom, pan)
- Support for remote BAM URLs and local file selection
- Multi-sample display

## Quick Start

### Using the UMD bundle

```html
<div id="samplot-container" style="width:800px;"></div>
<script src="samplot.js"></script>
<script>
  const viewer = new Samplot({
    container: '#samplot-container',
    samples: [
      { url: '/data/NA12878.bam', label: 'NA12878' },
      { url: '/data/NA12889.bam', label: 'NA12889' },
      { url: '/data/NA12890.bam', label: 'NA12890' },
    ],
    chrom: 'chr4',
    start: 115928726,
    end: 115931880,
    svType: 'DEL',
  });
  viewer.plot();
</script>
```

### Using ES modules

```javascript
import Samplot from 'samplot-js';

const viewer = new Samplot({
  container: document.getElementById('my-container'),
  samples: [
    { url: 'https://example.com/sample.bam', label: 'Sample 1' },
  ],
  chrom: 'chr4',
  start: 115928726,
  end: 115931880,
  svType: 'DEL',
});

await viewer.plot();
```

### Using local files

```javascript
const viewer = new Samplot({
  container: '#container',
  samples: [
    {
      bamFile: bamFileObject,      // File from <input type="file">
      indexFile: baiFileObject,    // Corresponding .bai file
      label: 'My Sample',
    },
  ],
  chrom: 'chr4',
  start: 115928726,
  end: 115931880,
  svType: 'DEL',
});

await viewer.plot();
```

## API

### `new Samplot(config)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `container` | `string \| HTMLElement` | required | CSS selector or DOM element |
| `samples` | `Array<Object>` | required | Sample configurations (see below) |
| `chrom` | `string` | required | Chromosome name |
| `start` | `number` | required | SV start position |
| `end` | `number` | required | SV end position |
| `svType` | `string` | `undefined` | SV type: `'DEL'`, `'DUP'`, `'INV'` |
| `window` | `number` | `0.15` | Fraction of SV size to pad the viewing window |
| `maxDepth` | `number` | `1000` | Maximum number of reads to display |
| `minMappingQuality` | `number` | `1` | Minimum mapping quality filter |
| `separateMappingQuality` | `number` | `20` | MAPQ threshold for coverage coloring |

#### Sample configuration

Each sample object accepts either remote URLs or local File objects:

```javascript
// Remote BAM
{ url: 'https://...bam', indexUrl: 'https://...bam.bai', label: 'Name' }

// Local files
{ bamFile: File, indexFile: File, label: 'Name' }
```

### `samplot.plot(options?)`

Fetch reads and render the plot. Returns a `Promise<void>`.

Optional `options` can override `chrom`, `start`, `end`, `svType`.

### `samplot.navigate(chrom, start, end, svType?)`

Navigate to a new region (refetches data).

### `samplot.getData()`

Returns the processed sample data for programmatic access.

### `samplot.destroy()`

Clean up the instance and remove the canvas.

## Visual Elements

The visualization matches Python samplot's output:

| Element | Style | Color |
|---------|-------|-------|
| **Paired-end reads** | Solid line with square markers | Black (Del/Normal), Red (Dup), Blue (Inv) |
| **Split reads** | Dotted line with circle markers | Same as paired-end |
| **Coverage (high MAPQ)** | Filled area | Dark grey, alpha 0.4 |
| **Coverage (low MAPQ)** | Filled area (stacked) | Light grey, alpha 0.15 |
| **Variant bar** | Thick horizontal line | Black, alpha 0.5 |

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build UMD bundle
npm run build

# Development build (unminified)
npm run build:dev
```

## Architecture

```
src/
├── index.js          # Main Samplot class and public API
├── bam-reader.js     # BAM file reading via @gmod/bam
├── data-processor.js # Read classification and coverage computation
├── renderer.js       # Canvas-based rendering engine
├── constants.js      # Colors, defaults, flag constants
└── utils.js          # Coordinate mapping and formatting utilities
```

## Comparison with Python samplot

This JavaScript port focuses on **short-read WGS** visualization. The following features from Python samplot are supported:

- ✅ Multi-sample BAM visualization
- ✅ Paired-end read display with event type coloring
- ✅ Split-read display
- ✅ Coverage tracks (stacked high/low quality)
- ✅ Variant bar with size annotation
- ✅ Coordinate axes and legends

Features not yet ported:
- ❌ Long-read visualization (PacBio, ONT)
- ❌ Linked-read (10X) visualization
- ❌ Annotation tracks (BED, GFF)
- ❌ Transcript tracks
- ❌ CRAM file support
- ❌ VCF batch processing

## License

MIT — see [LICENSE](../LICENSE)
