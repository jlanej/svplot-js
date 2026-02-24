/**
 * @jest-environment jsdom
 */
const {
  mapGenomeToPlot,
  getRangeHit,
  stripChr,
  pointsInWindow,
  jitter,
  formatSize,
  formatPosition,
  calculateRanges,
} = require('../src/utils.js');
const { DataProcessor } = require('../src/data-processor.js');
const { COLORS, DEFAULTS } = require('../src/constants.js');

// ---- Utility tests ----

describe('stripChr', () => {
  test('strips chr prefix', () => {
    expect(stripChr('chr1')).toBe('1');
    expect(stripChr('chrX')).toBe('X');
  });

  test('leaves non-prefixed chromosomes unchanged', () => {
    expect(stripChr('1')).toBe('1');
    expect(stripChr('X')).toBe('X');
  });

  test('handles empty/null input', () => {
    expect(stripChr('')).toBe('');
    expect(stripChr(null)).toBe(null);
  });
});

describe('getRangeHit', () => {
  const ranges = [
    { chrom: 'chr4', start: 115928000, end: 115932000 },
  ];

  test('returns index for point within range', () => {
    expect(getRangeHit(ranges, 'chr4', 115929000)).toBe(0);
    expect(getRangeHit(ranges, '4', 115929000)).toBe(0);
  });

  test('returns null for point outside range', () => {
    expect(getRangeHit(ranges, 'chr4', 100000)).toBeNull();
    expect(getRangeHit(ranges, 'chr5', 115929000)).toBeNull();
  });

  test('includes boundary points', () => {
    expect(getRangeHit(ranges, 'chr4', 115928000)).toBe(0);
    expect(getRangeHit(ranges, 'chr4', 115932000)).toBe(0);
  });
});

describe('mapGenomeToPlot', () => {
  const ranges = [
    { chrom: 'chr4', start: 100000, end: 200000 },
  ];

  test('maps start to 0', () => {
    expect(mapGenomeToPlot(ranges, 'chr4', 100000)).toBeCloseTo(0, 5);
  });

  test('maps end to 1', () => {
    expect(mapGenomeToPlot(ranges, 'chr4', 200000)).toBeCloseTo(1, 5);
  });

  test('maps midpoint to 0.5', () => {
    expect(mapGenomeToPlot(ranges, 'chr4', 150000)).toBeCloseTo(0.5, 5);
  });

  test('returns null for point outside ranges', () => {
    expect(mapGenomeToPlot(ranges, 'chr4', 50000)).toBeNull();
    expect(mapGenomeToPlot(ranges, 'chr5', 150000)).toBeNull();
  });

  test('handles multiple ranges', () => {
    const multiRanges = [
      { chrom: 'chr4', start: 100000, end: 200000 },
      { chrom: 'chr4', start: 300000, end: 400000 },
    ];
    // First range start → 0
    expect(mapGenomeToPlot(multiRanges, 'chr4', 100000)).toBeCloseTo(0, 5);
    // First range end → 0.5
    expect(mapGenomeToPlot(multiRanges, 'chr4', 200000)).toBeCloseTo(0.5, 5);
    // Second range start → 0.5
    expect(mapGenomeToPlot(multiRanges, 'chr4', 300000)).toBeCloseTo(0.5, 5);
    // Second range end → 1.0
    expect(mapGenomeToPlot(multiRanges, 'chr4', 400000)).toBeCloseTo(1.0, 5);
  });
});

describe('pointsInWindow', () => {
  test('returns true for points in [0, 1]', () => {
    expect(pointsInWindow(0, 1)).toBe(true);
    expect(pointsInWindow(0.5, 0.7)).toBe(true);
  });

  test('returns false for null points', () => {
    expect(pointsInWindow(null, 0.5)).toBe(false);
    expect(pointsInWindow(0.5, null)).toBe(false);
  });

  test('returns false for extreme points', () => {
    expect(pointsInWindow(-10, 0.5)).toBe(false);
    expect(pointsInWindow(0.5, 10)).toBe(false);
  });
});

describe('jitter', () => {
  test('returns value close to input', () => {
    const value = 1000;
    const result = jitter(value, 0.1);
    expect(result).toBeGreaterThan(value * 0.9);
    expect(result).toBeLessThan(value * 1.1);
  });

  test('returns zero for zero input', () => {
    expect(jitter(0, 0.1)).toBe(0);
  });
});

describe('formatSize', () => {
  test('formats bp', () => {
    expect(formatSize(500)).toBe('500 bp');
  });

  test('formats kb', () => {
    expect(formatSize(3154)).toBe('3.15 kb');
  });

  test('formats mb', () => {
    expect(formatSize(2500000)).toBe('2.50 mb');
  });
});

describe('formatPosition', () => {
  test('adds commas to large numbers', () => {
    expect(formatPosition(115928726)).toBe('115,928,726');
  });

  test('handles small numbers', () => {
    expect(formatPosition(100)).toBe('100');
  });
});

describe('calculateRanges', () => {
  test('creates range with padding', () => {
    const ranges = calculateRanges('chr4', 115928726, 115931880, 0.15);
    expect(ranges.length).toBe(1);
    expect(ranges[0].chrom).toBe('chr4');
    expect(ranges[0].start).toBeLessThan(115928726);
    expect(ranges[0].end).toBeGreaterThan(115931880);
  });

  test('ensures minimum padding of 100bp', () => {
    const ranges = calculateRanges('chr1', 1000, 1010, 0.15);
    expect(ranges[0].start).toBeLessThanOrEqual(900);
    expect(ranges[0].end).toBeGreaterThanOrEqual(1110);
  });
});

// ---- Constants tests ----

describe('COLORS', () => {
  test('has correct event type colors', () => {
    expect(COLORS['Deletion/Normal']).toBe('#000000');
    expect(COLORS['Duplication']).toBe('#ff0000');
    expect(COLORS['Inversion']).toBe('#0000ff');
  });
});

// ---- DataProcessor tests ----

describe('DataProcessor', () => {
  /**
   * Create a mock BAM record matching @gmod/bam BamRecord interface.
   * Uses direct property getters and named methods (not .get()).
   */
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

  // SAM flag constants for test readability
  const F = {
    PAIRED: 0x1,
    UNMAPPED: 0x4,
    MATE_UNMAPPED: 0x8,
    REVERSE: 0x10,
    MATE_REVERSE: 0x20,
    SECONDARY: 0x100,
    QC_FAIL: 0x200,
    DUPLICATE: 0x400,
    SUPPLEMENTARY: 0x800,
  };

  const region = { chrom: 'chr4', start: 100, end: 300 };

  describe('_shouldSkip', () => {
    let proc;
    beforeEach(() => {
      proc = new DataProcessor();
    });

    test('skips unmapped reads', () => {
      const record = mockRecord({ flags: F.UNMAPPED });
      expect(proc._shouldSkip(record)).toBe(true);
    });

    test('skips QC fail reads', () => {
      const record = mockRecord({ flags: F.QC_FAIL });
      expect(proc._shouldSkip(record)).toBe(true);
    });

    test('skips duplicates', () => {
      const record = mockRecord({ flags: F.DUPLICATE });
      expect(proc._shouldSkip(record)).toBe(true);
    });

    test('skips secondary alignments', () => {
      const record = mockRecord({ flags: F.SECONDARY });
      expect(proc._shouldSkip(record)).toBe(true);
    });

    test('skips supplementary alignments', () => {
      const record = mockRecord({ flags: F.SUPPLEMENTARY });
      expect(proc._shouldSkip(record)).toBe(true);
    });

    test('skips low MAPQ reads', () => {
      const record = mockRecord({ mq: 0 });
      expect(proc._shouldSkip(record)).toBe(true);
    });

    test('keeps good reads', () => {
      const record = mockRecord({ flags: F.PAIRED, mq: 30 });
      expect(proc._shouldSkip(record)).toBe(false);
    });
  });

  describe('_getEventType', () => {
    let proc;
    beforeEach(() => {
      proc = new DataProcessor();
    });

    test('forward-reverse → Deletion/Normal', () => {
      expect(proc._getEventType(true, false)).toBe('Deletion/Normal');
    });

    test('reverse-forward → Duplication', () => {
      expect(proc._getEventType(false, true)).toBe('Duplication');
    });

    test('forward-forward → Inversion', () => {
      expect(proc._getEventType(true, true)).toBe('Inversion');
    });

    test('reverse-reverse → Inversion', () => {
      expect(proc._getEventType(false, false)).toBe('Inversion');
    });
  });

  describe('processReads', () => {
    test('computes coverage from records', () => {
      const proc = new DataProcessor();
      const records = [
        mockRecord({
          start: 100,
          end: 200,
          flags: F.PAIRED,
          mq: 30,
          matePos: 250,
        }),
        mockRecord({
          name: 'read2',
          start: 150,
          end: 250,
          flags: F.PAIRED,
          mq: 30,
          matePos: 100,
        }),
      ];

      const result = proc.processReads(records, region);

      // Coverage should have values
      expect(result.coverage.high.length).toBe(200); // region.end - region.start
      expect(result.maxCoverage).toBeGreaterThan(0);

      // Overlap region [150, 200) should have coverage of 2
      expect(result.coverage.high[50]).toBe(2); // pos 150 - region.start(100) = 50
    });

    test('classifies paired-end reads', () => {
      const proc = new DataProcessor();
      // Normal FR pair: read forward, mate reverse
      const records = [
        mockRecord({
          start: 120,
          end: 270,
          name: 'pair1',
          flags: F.PAIRED | F.MATE_REVERSE, // read forward, mate reverse
          mq: 30,
          matePos: 250,
          template_length: 280,
        }),
      ];

      const result = proc.processReads(records, region);
      expect(result.pairs.length).toBe(1);
      expect(result.pairs[0].event).toBe('Deletion/Normal');
      expect(result.pairs[0].insertSize).toBe(280);
    });

    test('classifies split reads', () => {
      const proc = new DataProcessor();
      const records = [
        mockRecord({
          start: 120,
          end: 200,
          name: 'split1',
          flags: F.PAIRED,
          mq: 30,
          matePos: 250,
          SA: 'chr4,250,+,75M,30,0;',
        }),
      ];

      const result = proc.processReads(records, region);
      expect(result.splits.length).toBe(1);
    });

    test('separates high and low quality coverage', () => {
      const proc = new DataProcessor({ separateMappingQuality: 20 });
      const records = [
        mockRecord({
          start: 100,
          end: 200,
          flags: F.PAIRED,
          mq: 30,
          matePos: 250,
        }),
        mockRecord({
          name: 'lowq',
          start: 100,
          end: 200,
          flags: F.PAIRED,
          mq: 10,
          matePos: 250,
        }),
      ];

      const result = proc.processReads(records, region);
      // High quality at pos 0 should be 1
      expect(result.coverage.high[0]).toBe(1);
      // Low quality at pos 0 should be 1
      expect(result.coverage.low[0]).toBe(1);
    });

    test('respects maxDepth limit', () => {
      const proc = new DataProcessor({ maxDepth: 5 });
      const records = [];
      for (let i = 0; i < 20; i++) {
        records.push(
          mockRecord({
            name: `pair${i}`,
            start: 120 + i,
            end: 200 + i,
            flags: F.PAIRED | F.MATE_REVERSE,
            mq: 30,
            matePos: 250 + i,
            template_length: 280,
          }),
        );
      }

      const result = proc.processReads(records, region);
      expect(result.pairs.length).toBeLessThanOrEqual(5);
    });

    test('skips long reads in short-read mode', () => {
      const proc = new DataProcessor({ longReadLength: 1000 });
      const records = [
        mockRecord({
          start: 100,
          end: 1200, // 1100bp read, classified as long read
          flags: F.PAIRED | F.MATE_REVERSE,
          mq: 30,
          matePos: 250,
          template_length: 1200,
        }),
      ];

      const result = proc.processReads(records, region);
      expect(result.pairs.length).toBe(0);
    });

    test('skips inter-chromosomal pairs', () => {
      const proc = new DataProcessor();
      const records = [
        mockRecord({
          start: 120,
          end: 220,
          name: 'interchrom1',
          flags: F.PAIRED | F.MATE_REVERSE,
          mq: 30,
          matePos: 50000000,
          refId: 4,
          mateRefId: 6, // different chromosome
          template_length: 0,
        }),
      ];

      const result = proc.processReads(records, region);
      expect(result.pairs.length).toBe(0);
    });

    test('skips pairs with template_length=0', () => {
      const proc = new DataProcessor();
      const records = [
        mockRecord({
          start: 120,
          end: 220,
          name: 'badpair',
          flags: F.PAIRED | F.MATE_REVERSE,
          mq: 30,
          matePos: 120,
          refId: 4,
          mateRefId: 4,
          template_length: 0,
        }),
      ];

      const result = proc.processReads(records, region);
      expect(result.pairs.length).toBe(0);
    });
  });
});
