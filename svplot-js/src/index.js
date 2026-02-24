/**
 * samplot.js - Browser-based interactive genomic structural variant visualization.
 *
 * Provides the same visualization as Python samplot but runs entirely in the browser.
 * Reads BAM files using @gmod/bam and renders on an HTML5 Canvas.
 *
 * @example
 * const samplot = new Samplot({
 *   container: '#samplot-container',
 *   samples: [
 *     { url: '/data/NA12878.bam', label: 'NA12878' },
 *     { url: '/data/NA12889.bam', label: 'NA12889' },
 *   ],
 *   chrom: 'chr4',
 *   start: 115928726,
 *   end: 115931880,
 *   svType: 'DEL',
 * });
 * await samplot.plot();
 */
import { BamReader } from './bam-reader.js';
import { DataProcessor } from './data-processor.js';
import { Renderer } from './renderer.js';
import { calculateRanges } from './utils.js';
import { DEFAULTS } from './constants.js';

class Samplot {
  /**
   * Create a Samplot instance.
   *
   * @param {Object} config
   * @param {string|HTMLElement} config.container - CSS selector or DOM element for the plot
   * @param {Array<Object>} config.samples - Sample configurations
   * @param {string} [config.samples[].url] - URL to BAM file
   * @param {string} [config.samples[].indexUrl] - URL to BAI index file
   * @param {File} [config.samples[].bamFile] - Local BAM File object
   * @param {File} [config.samples[].indexFile] - Local BAI File object
   * @param {string} [config.samples[].label] - Sample display name
   * @param {string} config.chrom - Chromosome
   * @param {number} config.start - SV start position
   * @param {number} config.end - SV end position
   * @param {string} [config.svType] - SV type (DEL, DUP, INV, BND)
   * @param {number} [config.window=0.15] - Fraction of SV size to pad the viewing window
   * @param {number} [config.maxDepth=1000] - Maximum number of reads to display
   * @param {number} [config.minMappingQuality=1] - Minimum mapping quality
   * @param {number} [config.separateMappingQuality=20] - Quality threshold for coverage coloring
   * @param {string} [config.coverageTrackType='stack'] - Coverage display mode
   * @param {number} [config.width] - Canvas width in pixels (default: container width)
   * @param {number} [config.height] - Canvas height in pixels (default: auto-calculated)
   */
  constructor(config) {
    this.config = { ...DEFAULTS, ...config };
    this._validateConfig();

    // Resolve container
    if (typeof config.container === 'string') {
      this.container = document.querySelector(config.container);
    } else {
      this.container = config.container;
    }

    if (!this.container) {
      throw new Error('Samplot: container element not found');
    }

    // Create BAM readers
    this.readers = this.config.samples.map(
      (sample) => new BamReader(sample),
    );

    // Create data processor
    this.processor = new DataProcessor({
      minMappingQuality: this.config.minMappingQuality,
      separateMappingQuality: this.config.separateMappingQuality,
      longReadLength: this.config.longReadLength,
      maxDepth: this.config.maxDepth,
    });

    // State
    this._canvas = null;
    this._renderer = null;
    this._sampleData = null;
    this._ranges = null;
  }

  /**
   * Validate the configuration.
   * @private
   */
  _validateConfig() {
    const { samples, chrom, start, end } = this.config;
    if (!samples || !Array.isArray(samples) || samples.length === 0) {
      throw new Error('Samplot: at least one sample is required');
    }
    if (!chrom) throw new Error('Samplot: chrom is required');
    if (start === undefined || start === null)
      throw new Error('Samplot: start is required');
    if (end === undefined || end === null)
      throw new Error('Samplot: end is required');
    if (start >= end)
      throw new Error('Samplot: start must be less than end');
  }

  /**
   * Create or recreate the canvas element.
   * @private
   */
  _createCanvas() {
    // Remove existing canvas if any
    if (this._canvas && this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas);
    }

    const canvas = document.createElement('canvas');
    const numSamples = this.config.samples.length;
    const width =
      this.config.width || this.container.clientWidth || 800;
    const height =
      this.config.height ||
      this.config.padding.top +
        this.config.padding.bottom +
        (this.config.svType ? this.config.variantBarHeight : 0) +
        numSamples * this.config.sampleHeight +
        this.config.legendHeight;

    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.style.display = 'block';
    this.container.appendChild(canvas);
    this._canvas = canvas;

    return canvas;
  }

  /**
   * Fetch and process reads from all BAM files, then render the plot.
   *
   * @param {Object} [options] - Override plot parameters
   * @param {string} [options.chrom] - Override chromosome
   * @param {number} [options.start] - Override start
   * @param {number} [options.end] - Override end
   * @param {string} [options.svType] - Override SV type
   * @returns {Promise<void>}
   */
  async plot(options = {}) {
    const chrom = options.chrom || this.config.chrom;
    const start = options.start ?? this.config.start;
    const end = options.end ?? this.config.end;
    const svType = options.svType || this.config.svType;

    // Calculate viewing ranges with padding
    const windowFraction = this.config.window;
    this._ranges = calculateRanges(chrom, start, end, windowFraction);

    // Create canvas
    const canvas = this._createCanvas();
    this._renderer = new Renderer(canvas, this.config);

    // Show loading state
    this._showLoading();

    try {
      // Fetch and process reads from each BAM file
      const region = this._ranges[0];
      this._sampleData = await Promise.all(
        this.readers.map(async (reader) => {
          const records = await reader.fetchReads(
            region.chrom,
            region.start,
            region.end,
          );
          return this.processor.processReads(records, region);
        }),
      );

      // Render
      const labels = this.config.samples.map(
        (s, i) => s.label || `Sample ${i + 1}`,
      );

      this._renderer.render({
        sampleData: this._sampleData,
        labels,
        ranges: this._ranges,
        svType,
        svStart: start,
        svEnd: end,
        chrom,
      });
    } catch (err) {
      this._showError(err.message);
      throw err;
    }
  }

  /**
   * Re-render with new region (pan/zoom) without refetching if data covers it.
   *
   * @param {string} chrom
   * @param {number} start
   * @param {number} end
   * @param {string} [svType]
   * @returns {Promise<void>}
   */
  async navigate(chrom, start, end, svType) {
    this.config.chrom = chrom;
    this.config.start = start;
    this.config.end = end;
    if (svType) this.config.svType = svType;
    await this.plot();
  }

  /**
   * Show loading indicator on canvas.
   * @private
   */
  _showLoading() {
    if (!this._canvas) return;
    const ctx = this._canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = this._canvas.width / dpr;
    const h = this._canvas.height / dpr;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#999999';
    ctx.font = `14px ${DEFAULTS.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText('Loading BAM data...', w / 2, h / 2);
    ctx.restore();
  }

  /**
   * Show error message on canvas.
   * @private
   */
  _showError(message) {
    if (!this._canvas) return;
    const ctx = this._canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = this._canvas.width / dpr;
    const h = this._canvas.height / dpr;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#cc0000';
    ctx.font = `14px ${DEFAULTS.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(`Error: ${message}`, w / 2, h / 2);
    ctx.restore();
  }

  /**
   * Get the currently loaded sample data (for programmatic access).
   *
   * @returns {Array|null}
   */
  getData() {
    return this._sampleData;
  }

  /**
   * Destroy the Samplot instance and clean up.
   */
  destroy() {
    if (this._canvas && this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas);
    }
    this._canvas = null;
    this._renderer = null;
    this._sampleData = null;
    this._ranges = null;
  }
}

// Also export sub-modules for advanced usage
export { BamReader } from './bam-reader.js';
export { DataProcessor } from './data-processor.js';
export { Renderer } from './renderer.js';
export { COLORS, DEFAULTS } from './constants.js';
export { mapGenomeToPlot, calculateRanges, formatSize } from './utils.js';

export default Samplot;
