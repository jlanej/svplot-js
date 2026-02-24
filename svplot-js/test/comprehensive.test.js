/**
 * Comprehensive tests for the Renderer and BamReader modules,
 * plus additional edge-case and multi-variant integration tests.
 */

const path = require('path');
const { BamFile } = require('@gmod/bam');
const { LocalFile } = require('generic-filehandle');
const { DataProcessor } = require('../src/data-processor.js');
const { Renderer } = require('../src/renderer.js');
const {
  calculateRanges,
  mapGenomeToPlot,
  stripChr,
  formatSize,
  formatPosition,
} = require('../src/utils.js');
const { COLORS, DEFAULTS, COVERAGE_COLORS, READ_STYLES } = require('../src/constants.js');

const DATA_DIR = path.resolve(__dirname, '..', '..', 'test', 'data');

function openBam(filename) {
  const bamPath = path.join(DATA_DIR, filename);
  const baiPath = `${bamPath}.bai`;
  return new BamFile({
    bamFilehandle: new LocalFile(bamPath),
    baiFilehandle: new LocalFile(baiPath),
  });
}

// ---- Renderer tests (using @napi-rs/canvas for Node.js) ----

let createCanvas;
try {
  createCanvas = require('@napi-rs/canvas').createCanvas;
} catch {
  // Skip renderer tests if canvas is not available
  createCanvas = null;
}

const describeIfCanvas = createCanvas ? describe : describe.skip;

describeIfCanvas('Renderer', () => {
  test('constructs with node-canvas (no getBoundingClientRect)', () => {
    const canvas = createCanvas(800, 600);
    const renderer = new Renderer(canvas);
    expect(renderer.width).toBe(800);
    expect(renderer.height).toBe(600);
    expect(renderer.ctx).toBeTruthy();
  });

  test('uses default options when none provided', () => {
    const canvas = createCanvas(800, 600);
    const renderer = new Renderer(canvas);
    expect(renderer.options.backgroundColor).toBe(DEFAULTS.backgroundColor);
    expect(renderer.options.fontFamily).toBe(DEFAULTS.fontFamily);
    expect(renderer.options.maxCoveragePoints).toBe(DEFAULTS.maxCoveragePoints);
  });

  test('merges custom options with defaults', () => {
    const canvas = createCanvas(800, 600);
    const renderer = new Renderer(canvas, { backgroundColor: '#eeeeee' });
    expect(renderer.options.backgroundColor).toBe('#eeeeee');
    expect(renderer.options.fontFamily).toBe(DEFAULTS.fontFamily);
  });

  test('renders without error for single sample', () => {
    const canvas = createCanvas(800, 400);
    const renderer = new Renderer(canvas);
    const ranges = calculateRanges('chr1', 1000, 2000, 0.15);
    const sampleData = [{
      pairs: [],
      splits: [],
      coverage: {
        high: new Float32Array(ranges[0].end - ranges[0].start),
        low: new Float32Array(ranges[0].end - ranges[0].start),
      },
      maxCoverage: 0,
    }];

    expect(() => {
      renderer.render({
        sampleData,
        labels: ['Sample 1'],
        ranges,
        svType: 'DEL',
        svStart: 1000,
        svEnd: 2000,
        chrom: 'chr1',
      });
    }).not.toThrow();
  });

  test('renders without svType (no variant bar)', () => {
    const canvas = createCanvas(800, 400);
    const renderer = new Renderer(canvas);
    const ranges = calculateRanges('chr1', 1000, 2000, 0.15);
    const sampleData = [{
      pairs: [],
      splits: [],
      coverage: {
        high: new Float32Array(ranges[0].end - ranges[0].start),
        low: new Float32Array(ranges[0].end - ranges[0].start),
      },
      maxCoverage: 0,
    }];

    expect(() => {
      renderer.render({
        sampleData,
        labels: ['Sample 1'],
        ranges,
        svType: undefined,
        svStart: 1000,
        svEnd: 2000,
        chrom: 'chr1',
      });
    }).not.toThrow();
  });

  test('renders with coverage data', () => {
    const canvas = createCanvas(800, 400);
    const renderer = new Renderer(canvas);
    const ranges = calculateRanges('chr1', 1000, 2000, 0.15);
    const regionLen = ranges[0].end - ranges[0].start;
    const covHigh = new Float32Array(regionLen);
    const covLow = new Float32Array(regionLen);
    // Simulate a coverage peak in the middle of the region
    for (let i = 0; i < regionLen; i++) {
      covHigh[i] = Math.max(0, 30 - Math.abs(i - regionLen / 2) * 0.1);
      covLow[i] = 5;
    }
    const sampleData = [{
      pairs: [],
      splits: [],
      coverage: { high: covHigh, low: covLow },
      maxCoverage: 35,
    }];

    expect(() => {
      renderer.render({
        sampleData,
        labels: ['Coverage Test'],
        ranges,
        svType: 'DEL',
        svStart: 1000,
        svEnd: 2000,
        chrom: 'chr1',
      });
    }).not.toThrow();
  });

  test('renders with paired-end and split read data', () => {
    const canvas = createCanvas(800, 400);
    const renderer = new Renderer(canvas);
    const ranges = calculateRanges('chr1', 1000, 2000, 0.15);
    const regionLen = ranges[0].end - ranges[0].start;
    const sampleData = [{
      pairs: [
        { start: 1100, end: 1800, insertSize: 700, event: 'Deletion/Normal' },
        { start: 1200, end: 1600, insertSize: 400, event: 'Duplication' },
        { start: 1300, end: 1900, insertSize: 600, event: 'Inversion' },
      ],
      splits: [
        { start: 1050, end: 1700, insertSize: 650, event: 'Deletion/Normal' },
      ],
      coverage: {
        high: new Float32Array(regionLen).fill(20),
        low: new Float32Array(regionLen).fill(5),
      },
      maxCoverage: 25,
    }];

    expect(() => {
      renderer.render({
        sampleData,
        labels: ['Reads Test'],
        ranges,
        svType: 'DEL',
        svStart: 1000,
        svEnd: 2000,
        chrom: 'chr1',
      });
    }).not.toThrow();
  });

  test('renders multi-sample plot', () => {
    const canvas = createCanvas(800, 900);
    const renderer = new Renderer(canvas);
    const ranges = calculateRanges('chr4', 100000, 200000, 0.15);
    const regionLen = ranges[0].end - ranges[0].start;
    const makeSample = () => ({
      pairs: [
        { start: 120000, end: 180000, insertSize: 500, event: 'Deletion/Normal' },
      ],
      splits: [],
      coverage: {
        high: new Float32Array(regionLen).fill(10),
        low: new Float32Array(regionLen).fill(2),
      },
      maxCoverage: 12,
    });

    expect(() => {
      renderer.render({
        sampleData: [makeSample(), makeSample(), makeSample()],
        labels: ['S1', 'S2', 'S3'],
        ranges,
        svType: 'DUP',
        svStart: 100000,
        svEnd: 200000,
        chrom: 'chr4',
      });
    }).not.toThrow();
  });
});

// ---- DataProcessor edge-case tests ----

describe('DataProcessor edge cases', () => {
  function mockRecord(opts) {
    const flags = opts.flags || 0;
    return {
      get start() { return opts.start || 0; },
      get end() { return opts.end || (opts.start || 0) + 150; },
      get name() { return opts.name || 'read1'; },
      get mq() { return opts.mq !== undefined ? opts.mq : 30; },
      get template_length() { return opts.template_length !== undefined ? opts.template_length : 300; },
      get next_pos() { return opts.matePos; },
      get ref_id() { return opts.refId ?? 0; },
      get next_refid() { return opts.mateRefId ?? opts.refId ?? 0; },
      get flags() { return flags; },
      get tags() { return opts.SA ? { SA: opts.SA } : {}; },
      isPaired: () => !!(flags & 0x1),
      isSegmentUnmapped: () => !!(flags & 0x4),
      isMateUnmapped: () => !!(flags & 0x8),
      isReverseComplemented: () => !!(flags & 0x10),
      isMateReverseComplemented: () => !!(flags & 0x20),
      isSecondary: () => !!(flags & 0x100),
      isFailedQc: () => !!(flags & 0x200),
      isDuplicate: () => !!(flags & 0x400),
      isSupplementary: () => !!(flags & 0x800),
    };
  }

  const F = {
    PAIRED: 0x1,
    REVERSE: 0x10,
    MATE_REVERSE: 0x20,
  };

  test('handles empty records array', () => {
    const proc = new DataProcessor();
    const region = { chrom: 'chr1', start: 100, end: 200 };
    const result = proc.processReads([], region);
    expect(result.pairs.length).toBe(0);
    expect(result.splits.length).toBe(0);
    expect(result.maxCoverage).toBe(0);
    expect(result.coverage.high.length).toBe(100);
    expect(result.coverage.low.length).toBe(100);
  });

  test('handles reads entirely outside region', () => {
    const proc = new DataProcessor();
    const region = { chrom: 'chr1', start: 1000, end: 2000 };
    const records = [
      mockRecord({
        start: 100, end: 200, flags: F.PAIRED | F.MATE_REVERSE,
        mq: 30, matePos: 150, template_length: 100,
      }),
    ];
    const result = proc.processReads(records, region);
    // Coverage should be zero within the region
    expect(result.maxCoverage).toBe(0);
  });

  test('handles reads partially overlapping region boundary', () => {
    const proc = new DataProcessor();
    const region = { chrom: 'chr1', start: 100, end: 300 };
    const records = [
      mockRecord({
        start: 50, end: 150, flags: F.PAIRED | F.MATE_REVERSE,
        mq: 30, matePos: 200, template_length: 200,
      }),
    ];
    const result = proc.processReads(records, region);
    // Coverage should exist for positions 100-150
    expect(result.coverage.high[0]).toBe(1);  // pos 100
    expect(result.coverage.high[49]).toBe(1); // pos 149
    expect(result.coverage.high[50]).toBe(0); // pos 150
  });

  test('classifies Duplication event (RF orientation)', () => {
    const proc = new DataProcessor();
    const region = { chrom: 'chr1', start: 100, end: 400 };
    const records = [
      mockRecord({
        start: 150, end: 300, name: 'dup1',
        flags: F.PAIRED | F.REVERSE, // read reverse, mate forward
        mq: 30, matePos: 250, template_length: 300,
      }),
    ];
    const result = proc.processReads(records, region);
    expect(result.pairs.length).toBe(1);
    expect(result.pairs[0].event).toBe('Duplication');
  });

  test('classifies Inversion event (FF orientation)', () => {
    const proc = new DataProcessor();
    const region = { chrom: 'chr1', start: 100, end: 400 };
    const records = [
      mockRecord({
        start: 150, end: 300, name: 'inv1',
        flags: F.PAIRED, // both forward (no REVERSE, no MATE_REVERSE)
        mq: 30, matePos: 250, template_length: 300,
      }),
    ];
    const result = proc.processReads(records, region);
    expect(result.pairs.length).toBe(1);
    expect(result.pairs[0].event).toBe('Inversion');
  });

  test('deduplicates paired reads by name', () => {
    const proc = new DataProcessor();
    const region = { chrom: 'chr1', start: 100, end: 400 };
    const records = [
      mockRecord({
        start: 150, end: 300, name: 'same_read',
        flags: F.PAIRED | F.MATE_REVERSE, mq: 30, matePos: 250, template_length: 300,
      }),
      mockRecord({
        start: 250, end: 350, name: 'same_read',
        flags: F.PAIRED | F.REVERSE, mq: 30, matePos: 150, template_length: -300,
      }),
    ];
    const result = proc.processReads(records, region);
    expect(result.pairs.length).toBe(1);
  });

  test('handles split read with SA tag on different chromosome', () => {
    const proc = new DataProcessor();
    const region = { chrom: 'chr1', start: 100, end: 400 };
    const records = [
      mockRecord({
        start: 150, end: 250, name: 'split_inter',
        flags: F.PAIRED, mq: 30, matePos: 200,
        SA: 'chr5,1000,+,75M,30,0;',
      }),
    ];
    const result = proc.processReads(records, region);
    // Inter-chromosomal split should be filtered
    expect(result.splits.length).toBe(0);
  });

  test('handles SA tag with multiple entries', () => {
    const proc = new DataProcessor();
    const region = { chrom: 'chr1', start: 100, end: 500 };
    const records = [
      mockRecord({
        start: 150, end: 250, name: 'multi_split',
        flags: F.PAIRED, mq: 30, matePos: 300,
        SA: 'chr1,350,+,75M,30,0;chr1,400,-,50M,25,1;',
      }),
    ];
    const result = proc.processReads(records, region);
    // Should process at least the first SA entry
    expect(result.splits.length).toBe(1);
  });

  test('custom minMappingQuality filters reads', () => {
    const proc = new DataProcessor({ minMappingQuality: 20 });
    const region = { chrom: 'chr1', start: 100, end: 300 };
    const records = [
      mockRecord({ start: 150, end: 200, flags: F.PAIRED | F.MATE_REVERSE, mq: 15, matePos: 200, template_length: 200 }),
      mockRecord({ name: 'r2', start: 150, end: 200, flags: F.PAIRED | F.MATE_REVERSE, mq: 25, matePos: 200, template_length: 200 }),
    ];
    const result = proc.processReads(records, region);
    // Only the mq=25 read should pass
    expect(result.pairs.length).toBe(1);
  });
});

// ---- Multi-variant integration tests ----

describe('Integration: chr1 Deletion (hg19, long-read)', () => {
  const CHROM = 'chr1';
  const START = 58343117;
  const END = 58343622;
  const ranges = calculateRanges(CHROM, START, END, 0.15);
  const region = ranges[0];
  let result;
  let records;

  beforeAll(async () => {
    const bam = openBam('hg19_chr1_58343117_58343622_deletion.bam');
    await bam.getHeader();
    records = await bam.getRecordsForRange(region.chrom, region.start, region.end);
    const processor = new DataProcessor();
    result = processor.processReads(records, region);
  });

  test('reads records from BAM', () => {
    expect(records.length).toBeGreaterThan(0);
  });

  test('produces coverage data', () => {
    expect(result.maxCoverage).toBeGreaterThan(0);
    expect(result.coverage.high.length).toBe(region.end - region.start);
  });

  test('contains long unpaired reads (long-read data)', () => {
    const unpaired = records.filter(r => !r.isPaired());
    expect(unpaired.length).toBeGreaterThan(0);
  });
});

describe('Integration: chr21 Inversion (hg19, long-read)', () => {
  const CHROM = 'chr21';
  const START = 27373431;
  const END = 27375410;
  const ranges = calculateRanges(CHROM, START, END, 0.15);
  const region = ranges[0];
  let result;
  let records;

  beforeAll(async () => {
    const bam = openBam('hg19_chr21_27373431_27375410_inversion.bam');
    await bam.getHeader();
    records = await bam.getRecordsForRange(region.chrom, region.start, region.end);
    const processor = new DataProcessor();
    result = processor.processReads(records, region);
  });

  test('reads records from BAM', () => {
    expect(records.length).toBeGreaterThan(0);
  });

  test('produces coverage data', () => {
    expect(result.maxCoverage).toBeGreaterThan(0);
  });

  test('contains long unpaired reads (long-read data)', () => {
    const unpaired = records.filter(r => !r.isPaired());
    expect(unpaired.length).toBeGreaterThan(0);
  });
});

describe('Integration: chr1 DEL trio (HG002/HG003/HG004)', () => {
  const CHROM = '1';
  const START = 24804398;
  const END = 24807302;
  const ranges = calculateRanges(CHROM, START, END, 0.15);
  const region = ranges[0];
  const SAMPLES = [
    { name: 'HG002', file: 'HG002_Illumina.bam' },
    { name: 'HG003', file: 'HG003_Illumina.bam' },
    { name: 'HG004', file: 'HG004_Illumina.bam' },
  ];
  let sampleResults;

  beforeAll(async () => {
    const processor = new DataProcessor();
    sampleResults = await Promise.all(
      SAMPLES.map(async (s) => {
        const bam = openBam(s.file);
        await bam.getHeader();
        const records = await bam.getRecordsForRange(region.chrom, region.start, region.end);
        return { name: s.name, processed: processor.processReads(records, region) };
      }),
    );
  });

  test('reads records from all three samples', () => {
    for (const s of sampleResults) {
      expect(s.processed.maxCoverage).toBeGreaterThan(0);
    }
  });

  test('produces paired-end reads for each sample', () => {
    for (const s of sampleResults) {
      expect(s.processed.pairs.length).toBeGreaterThan(0);
    }
  });

  test('coverage arrays match region length', () => {
    const regionLen = region.end - region.start;
    for (const s of sampleResults) {
      expect(s.processed.coverage.high.length).toBe(regionLen);
      expect(s.processed.coverage.low.length).toBe(regionLen);
    }
  });
});

// ---- Utility edge-case tests ----

describe('Utility edge cases', () => {
  test('calculateRanges with very small region uses minimum padding', () => {
    const ranges = calculateRanges('chrX', 500, 510, 0.15);
    expect(ranges[0].start).toBeLessThanOrEqual(400);
    expect(ranges[0].end).toBeGreaterThanOrEqual(610);
  });

  test('calculateRanges clamps start to 0', () => {
    const ranges = calculateRanges('chr1', 10, 50, 0.15);
    expect(ranges[0].start).toBeGreaterThanOrEqual(0);
  });

  test('formatSize handles zero', () => {
    expect(formatSize(0)).toBe('0 bp');
  });

  test('formatPosition handles zero', () => {
    expect(formatPosition(0)).toBe('0');
  });

  test('mapGenomeToPlot returns null for empty ranges', () => {
    expect(mapGenomeToPlot([], 'chr1', 1000)).toBeNull();
  });

  test('stripChr handles undefined', () => {
    expect(stripChr(undefined)).toBeUndefined();
  });
});

// ---- Constants tests ----

describe('Constants completeness', () => {
  test('COLORS has all event types', () => {
    expect(COLORS['Deletion/Normal']).toBeDefined();
    expect(COLORS['Duplication']).toBeDefined();
    expect(COLORS['Inversion']).toBeDefined();
  });

  test('COVERAGE_COLORS has high and low quality', () => {
    expect(COVERAGE_COLORS.highQuality).toBeDefined();
    expect(COVERAGE_COLORS.lowQuality).toBeDefined();
  });

  test('READ_STYLES has pair, split, and variant', () => {
    expect(READ_STYLES.pair).toBeDefined();
    expect(READ_STYLES.split).toBeDefined();
    expect(READ_STYLES.variant).toBeDefined();
  });

  test('DEFAULTS has all required fields', () => {
    expect(DEFAULTS.padding).toBeDefined();
    expect(DEFAULTS.sampleHeight).toBeGreaterThan(0);
    expect(DEFAULTS.variantBarHeight).toBeGreaterThan(0);
    expect(DEFAULTS.legendHeight).toBeGreaterThan(0);
  });
});
