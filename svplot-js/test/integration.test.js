/**
 * Integration test using real BAM files from the samplot project.
 *
 * This test mirrors the samplot CLI invocation:
 *
 *   samplot plot \
 *     -n NA12878 NA12889 NA12890 \
 *     -b samplot/test/data/NA12878_restricted.bam \
 *       samplot/test/data/NA12889_restricted.bam \
 *       samplot/test/data/NA12890_restricted.bam \
 *     -o 4_115928726_115931880.png \
 *     -c chr4 \
 *     -s 115928726 \
 *     -e 115931880 \
 *     -t DEL
 *
 * Test data originates from the samplot project:
 *   https://github.com/ryanlayer/samplot
 *
 * Citation:
 *   Belyeu, J.R., Nicholas, T.J., Pedersen, B.S. et al.
 *   SV-plaudit: A cloud-based framework for manually curating
 *   thousands of structural variants. GigaScience, 7(7), 2018.
 */

const path = require('path');
const { BamFile } = require('@gmod/bam');
const { LocalFile } = require('generic-filehandle');
const { DataProcessor } = require('../src/data-processor.js');
const { calculateRanges } = require('../src/utils.js');

const DATA_DIR = path.resolve(__dirname, '..', '..', 'test', 'data');

const SAMPLES = ['NA12878', 'NA12889', 'NA12890'];
const CHROM = 'chr4';
const START = 115928726;
const END = 115931880;
const SV_TYPE = 'DEL';

/**
 * Open a BAM file from the test data directory.
 */
function openBam(sampleName) {
  const bamPath = path.join(DATA_DIR, `${sampleName}_restricted.bam`);
  const baiPath = `${bamPath}.bai`;
  return new BamFile({
    bamFilehandle: new LocalFile(bamPath),
    baiFilehandle: new LocalFile(baiPath),
  });
}

describe('Integration: chr4 DEL (NA12878, NA12889, NA12890)', () => {
  const ranges = calculateRanges(CHROM, START, END, 0.15);
  const region = ranges[0];
  let sampleResults;

  beforeAll(async () => {
    const processor = new DataProcessor();

    sampleResults = await Promise.all(
      SAMPLES.map(async (name) => {
        const bam = openBam(name);
        await bam.getHeader();
        const records = await bam.getRecordsForRange(
          region.chrom,
          region.start,
          region.end,
        );
        return {
          name,
          records,
          processed: processor.processReads(records, region),
        };
      }),
    );
  });

  test('reads records from all three samples', () => {
    for (const sample of sampleResults) {
      expect(sample.records.length).toBeGreaterThan(0);
    }
  });

  test('produces coverage data for each sample', () => {
    for (const sample of sampleResults) {
      const { coverage, maxCoverage } = sample.processed;
      expect(coverage.high.length).toBe(region.end - region.start);
      expect(coverage.low.length).toBe(region.end - region.start);
      expect(maxCoverage).toBeGreaterThan(0);
    }
  });

  test('identifies paired-end reads in each sample', () => {
    for (const sample of sampleResults) {
      expect(sample.processed.pairs.length).toBeGreaterThan(0);
    }
  });

  test('paired reads include Deletion/Normal events consistent with DEL SV type', () => {
    for (const sample of sampleResults) {
      const delPairs = sample.processed.pairs.filter(
        (p) => p.event === 'Deletion/Normal',
      );
      expect(delPairs.length).toBeGreaterThan(0);
    }
  });

  test('viewing region covers the SV breakpoints with padding', () => {
    expect(region.chrom).toBe(CHROM);
    expect(region.start).toBeLessThan(START);
    expect(region.end).toBeGreaterThan(END);
  });

  test('coverage drops within the deletion interval for NA12878', () => {
    const na12878 = sampleResults.find((s) => s.name === 'NA12878');
    const { coverage } = na12878.processed;

    // Average coverage in the flanking regions vs inside the deletion
    const flankSize = Math.min(200, START - region.start);
    let flankSum = 0;
    for (let i = 0; i < flankSize; i++) {
      flankSum += coverage.high[i] + coverage.low[i];
    }
    const flankAvg = flankSum / flankSize;

    const delOffset = START - region.start;
    const delLen = END - START;
    let delSum = 0;
    for (let i = delOffset; i < delOffset + delLen; i++) {
      delSum += coverage.high[i] + coverage.low[i];
    }
    const delAvg = delSum / delLen;

    // For a heterozygous or homozygous deletion the coverage inside the
    // deletion should be noticeably lower than the flanking regions.
    expect(delAvg).toBeLessThan(flankAvg);
  });
});
