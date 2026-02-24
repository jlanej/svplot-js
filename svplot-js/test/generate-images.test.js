/**
 * Generate example PNG images from real BAM data for documentation.
 *
 * Uses node-canvas to render samplot-style visualizations in Node.js,
 * producing example images that are committed to the repository and
 * displayed in the README.
 *
 * Test data originates from the samplot project:
 *   https://github.com/ryanlayer/samplot
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const { BamFile } = require('@gmod/bam');
const { LocalFile } = require('generic-filehandle');
const { DataProcessor } = require('../src/data-processor.js');
const { Renderer } = require('../src/renderer.js');
const { calculateRanges } = require('../src/utils.js');

const DATA_DIR = path.resolve(__dirname, '..', '..', 'test', 'data');
const OUTPUT_DIR = path.resolve(__dirname, '..', 'examples', 'images');

/**
 * Open a BAM file from the test data directory.
 */
function openBam(filename) {
  const bamPath = path.join(DATA_DIR, filename);
  const baiPath = `${bamPath}.bai`;
  return new BamFile({
    bamFilehandle: new LocalFile(bamPath),
    baiFilehandle: new LocalFile(baiPath),
  });
}

/**
 * Render a plot and save it as a PNG file.
 */
async function renderExample({ bamFiles, labels, chrom, start, end, svType, outputName }) {
  const processor = new DataProcessor();
  const ranges = calculateRanges(chrom, start, end, 0.15);
  const region = ranges[0];

  const sampleData = await Promise.all(
    bamFiles.map(async (filename) => {
      const bam = openBam(filename);
      await bam.getHeader();
      const records = await bam.getRecordsForRange(
        region.chrom,
        region.start,
        region.end,
      );
      return processor.processReads(records, region);
    }),
  );

  const numSamples = sampleData.length;
  const width = 800;
  const height = 40 + 30 + numSamples * 250 + 40 + 30;

  const canvas = createCanvas(width, height);
  const renderer = new Renderer(canvas);

  renderer.render({
    sampleData,
    labels,
    ranges,
    svType,
    svStart: start,
    svEnd: end,
    chrom,
  });

  const buffer = canvas.toBuffer('image/png');
  const outPath = path.join(OUTPUT_DIR, outputName);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buffer);
  return outPath;
}

/**
 * Example configurations using available test BAM data.
 */
const EXAMPLES = [
  {
    name: 'Deletion (chr4)',
    bamFiles: [
      'NA12878_restricted.bam',
      'NA12889_restricted.bam',
      'NA12890_restricted.bam',
    ],
    labels: ['NA12878', 'NA12889', 'NA12890'],
    chrom: 'chr4',
    start: 115928726,
    end: 115931880,
    svType: 'DEL',
    outputName: 'DEL_chr4_115928726_115931880.png',
  },
  {
    name: 'Deletion (chr1, hg19)',
    bamFiles: ['hg19_chr1_58343117_58343622_deletion.bam'],
    labels: ['hg19 sample'],
    chrom: 'chr1',
    start: 58343117,
    end: 58343622,
    svType: 'DEL',
    outputName: 'DEL_chr1_58343117_58343622.png',
  },
  {
    name: 'Inversion (chr21, hg19)',
    bamFiles: ['hg19_chr21_27373431_27375410_inversion.bam'],
    labels: ['hg19 sample'],
    chrom: 'chr21',
    start: 27373431,
    end: 27375410,
    svType: 'INV',
    outputName: 'INV_chr21_27373431_27375410.png',
  },
  {
    name: 'Deletion trio (HG002/HG003/HG004)',
    bamFiles: [
      'HG002_Illumina.bam',
      'HG003_Illumina.bam',
      'HG004_Illumina.bam',
    ],
    labels: ['HG002', 'HG003', 'HG004'],
    chrom: '1',
    start: 24804398,
    end: 24807302,
    svType: 'DEL',
    outputName: 'DEL_1_24804398_24807302.png',
  },
];

describe('Generate example images', () => {
  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const example of EXAMPLES) {
    test(`renders ${example.name}`, async () => {
      const outPath = await renderExample(example);
      expect(fs.existsSync(outPath)).toBe(true);
      const stats = fs.statSync(outPath);
      // A valid rendered PNG should be well above the minimum PNG header size
      expect(stats.size).toBeGreaterThan(1000);
    }, 30000);
  }
});
