/**
 * Canvas-based renderer for samplot visualizations.
 * Renders coverage, paired-end reads, split reads, and variant bars
 * matching the visual style of Python samplot.
 */
import {
  COLORS,
  COVERAGE_COLORS,
  READ_STYLES,
  DEFAULTS,
} from './constants.js';
import {
  mapGenomeToPlot,
  jitter,
  formatSize,
  formatPosition,
  pointsInWindow,
} from './utils.js';

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} options
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = { ...DEFAULTS, ...options };
    this._setupCanvas();
  }

  /**
   * Set up canvas dimensions with device pixel ratio for sharp rendering.
   * @private
   */
  _setupCanvas() {
    const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
    if (typeof this.canvas.getBoundingClientRect === 'function') {
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.ctx.scale(dpr, dpr);
      this.width = rect.width;
      this.height = rect.height;
    } else {
      // Node.js canvas — dimensions are already set
      this.width = this.canvas.width;
      this.height = this.canvas.height;
    }
  }

  /**
   * Render the complete samplot visualization.
   *
   * @param {Object} params
   * @param {Array<{pairs, splits, coverage, maxCoverage}>} params.sampleData - Per-sample processed data
   * @param {Array<string>} params.labels - Sample names
   * @param {Array<{chrom, start, end}>} params.ranges - Viewing ranges
   * @param {string} [params.svType] - SV type (DEL, DUP, INV)
   * @param {number} params.svStart - SV start position
   * @param {number} params.svEnd - SV end position
   * @param {string} params.chrom - Chromosome
   */
  render(params) {
    const {
      sampleData,
      labels,
      ranges,
      svType,
      svStart,
      svEnd,
      chrom,
    } = params;

    const pad = this.options.padding;
    const numSamples = sampleData.length;

    // Calculate layout
    const variantBarH = svType ? this.options.variantBarHeight : 0;
    const legendH = this.options.legendHeight;
    const availableH = this.height - pad.top - pad.bottom - variantBarH - legendH;
    const sampleH = availableH / numSamples;
    const plotW = this.width - pad.left - pad.right;

    // Clear canvas
    this.ctx.fillStyle = this.options.backgroundColor;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Draw variant bar
    let yOffset = pad.top;
    if (svType) {
      this._drawVariantBar(
        pad.left,
        yOffset,
        plotW,
        variantBarH,
        ranges,
        chrom,
        svStart,
        svEnd,
        svType,
      );
      yOffset += variantBarH;
    }

    // Find global max coverage for consistent scaling
    const globalMaxCov = Math.max(
      ...sampleData.map((s) => s.maxCoverage),
      1,
    );

    // Find global max insert size using 99.5th percentile for robust scaling
    const allInsertSizes = [];
    for (const sample of sampleData) {
      for (const p of sample.pairs) allInsertSizes.push(p.insertSize);
      for (const s of sample.splits) allInsertSizes.push(s.insertSize);
    }
    let globalMaxInsert;
    if (allInsertSizes.length > 0) {
      allInsertSizes.sort((a, b) => a - b);
      const pctIdx = Math.min(
        Math.floor(allInsertSizes.length * 0.995),
        allInsertSizes.length - 1,
      );
      globalMaxInsert = allInsertSizes[pctIdx];
    }
    if (!globalMaxInsert || globalMaxInsert === 0) globalMaxInsert = 1000;

    // Draw each sample
    for (let i = 0; i < numSamples; i++) {
      const sampleY = yOffset + i * sampleH;
      const label = labels[i] || `Sample ${i + 1}`;

      this._drawSamplePanel(
        pad.left,
        sampleY,
        plotW,
        sampleH,
        sampleData[i],
        label,
        ranges,
        globalMaxCov,
        globalMaxInsert,
        i < numSamples - 1, // not last panel
      );
    }

    // Draw genomic coordinate axis on last panel
    const lastPanelY = yOffset + (numSamples - 1) * sampleH;
    this._drawXAxis(pad.left, lastPanelY + sampleH, plotW, ranges);

    // Draw legend
    this._drawLegend(
      pad.left,
      this.height - legendH - pad.bottom + 10,
      plotW,
      legendH,
      sampleData,
    );
  }

  /**
   * Draw the variant bar at the top of the plot.
   * @private
   */
  _drawVariantBar(x, y, w, h, ranges, chrom, svStart, svEnd, svType) {
    const ctx = this.ctx;
    const midY = y + h / 2;

    // Map SV coordinates to plot space
    const p1 = mapGenomeToPlot(ranges, chrom, svStart);
    const p2 = mapGenomeToPlot(ranges, chrom, svEnd);

    if (p1 !== null && p2 !== null) {
      const x1 = x + p1 * w;
      const x2 = x + p2 * w;

      ctx.save();
      ctx.strokeStyle = READ_STYLES.variant.color;
      ctx.lineWidth = READ_STYLES.variant.lineWidth;
      ctx.globalAlpha = READ_STYLES.variant.alpha;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(x1, midY);
      ctx.lineTo(x2, midY);
      ctx.stroke();
      ctx.restore();
    }

    // Draw SV title
    const svSize = Math.abs(svEnd - svStart);
    const svTitle = `${formatSize(svSize)} ${svType.toLowerCase()}`;
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.font = `${this.options.titleFontSize}px ${this.options.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(svTitle, x + w / 2, y + 14);
    ctx.restore();
  }

  /**
   * Draw a single sample panel with coverage and reads.
   * @private
   */
  _drawSamplePanel(
    x,
    y,
    w,
    h,
    sampleData,
    label,
    ranges,
    maxCoverage,
    maxInsertSize,
    drawBorder,
  ) {
    const ctx = this.ctx;
    const coverageH = h * 0.3;
    const readsH = h * 0.65;
    const labelH = h * 0.05;
    const coverageY = y + labelH;
    const readsY = coverageY + coverageH;

    // Draw sample label
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${this.options.labelFontSize}px ${this.options.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 4, y + labelH);
    ctx.restore();

    // Draw coverage
    this._drawCoverage(x, coverageY, w, coverageH, sampleData.coverage, ranges, maxCoverage);

    // Draw reads
    this._drawReads(x, readsY, w, readsH, sampleData, ranges, maxInsertSize);

    // Draw coverage Y-axis label
    this._drawCoverageAxis(x + w, coverageY, coverageH, maxCoverage);

    // Draw insert size Y-axis label
    this._drawInsertAxis(x + w, readsY, readsH, maxInsertSize);

    // Draw panel border
    if (drawBorder) {
      ctx.save();
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x + w, y + h);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Draw coverage track as filled area chart.
   * @private
   */
  _drawCoverage(x, y, w, h, coverage, ranges, maxCoverage) {
    const ctx = this.ctx;
    const { high, low } = coverage;
    const regionLen = high.length;

    if (regionLen === 0 || maxCoverage === 0) return;

    // Downsample for performance
    const maxPoints = this.options.maxCoveragePoints;
    const step = Math.max(1, Math.floor(regionLen / maxPoints));

    // Draw high-quality coverage
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y + h);

    for (let i = 0; i < regionLen; i += step) {
      const normX = i / regionLen;
      const px = x + normX * w;
      const depth = high[i];
      const normDepth = Math.min(depth / maxCoverage, 1);
      const py = y + h - normDepth * h;
      ctx.lineTo(px, py);
    }

    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fillStyle = COVERAGE_COLORS.highQuality;
    ctx.fill();
    ctx.restore();

    // Draw low-quality coverage stacked on top
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y + h);

    for (let i = 0; i < regionLen; i += step) {
      const normX = i / regionLen;
      const px = x + normX * w;
      const totalDepth = high[i] + low[i];
      const highDepth = high[i];
      const normTotal = Math.min(totalDepth / maxCoverage, 1);
      const normHigh = Math.min(highDepth / maxCoverage, 1);

      // Low quality is drawn from high quality level to total level
      const pyBottom = y + h - normHigh * h;
      const pyTop = y + h - normTotal * h;
      ctx.lineTo(px, pyTop);
    }

    // Go back along the high-quality line
    for (let i = regionLen - 1; i >= 0; i -= step) {
      const normX = i / regionLen;
      const px = x + normX * w;
      const depth = high[i];
      const normDepth = Math.min(depth / maxCoverage, 1);
      const py = y + h - normDepth * h;
      ctx.lineTo(px, py);
    }

    ctx.closePath();
    ctx.fillStyle = COVERAGE_COLORS.lowQuality;
    ctx.fill();
    ctx.restore();

    // Draw coverage outline
    ctx.save();
    ctx.strokeStyle = 'rgba(100,100,100,0.3)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draw paired-end and split reads.
   * @private
   */
  _drawReads(x, y, w, h, sampleData, ranges, maxInsertSize) {
    const ctx = this.ctx;
    const { pairs, splits } = sampleData;
    const range = ranges[0]; // Primary range
    const jitterBounds = this.options.jitter;

    // Draw paired-end reads
    for (const pair of pairs) {
      const p1 = mapGenomeToPlot(ranges, range.chrom, pair.start);
      const p2 = mapGenomeToPlot(ranges, range.chrom, pair.end);

      if (!pointsInWindow(p1, p2)) continue;
      if (p1 === null || p2 === null) continue;

      const px1 = x + Math.max(0, Math.min(1, p1)) * w;
      const px2 = x + Math.max(0, Math.min(1, p2)) * w;
      const insertY = jitter(pair.insertSize, jitterBounds);
      const normY = Math.min(insertY / maxInsertSize, 1);
      const py = y + h - normY * h;

      const color = COLORS[pair.event] || COLORS['Deletion/Normal'];
      const style = READ_STYLES.pair;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = style.alpha;
      ctx.lineWidth = style.lineWidth;

      // Draw line
      ctx.beginPath();
      ctx.moveTo(px1, py);
      ctx.lineTo(px2, py);
      ctx.stroke();

      // Draw square markers at ends
      const ms = style.markerSize;
      ctx.fillStyle = color;
      ctx.fillRect(px1 - ms / 2, py - ms / 2, ms, ms);
      ctx.fillRect(px2 - ms / 2, py - ms / 2, ms, ms);

      ctx.restore();
    }

    // Draw split reads
    for (const split of splits) {
      const p1 = mapGenomeToPlot(ranges, range.chrom, split.start);
      const p2 = mapGenomeToPlot(ranges, range.chrom, split.end);

      if (!pointsInWindow(p1, p2)) continue;
      if (p1 === null || p2 === null) continue;

      const px1 = x + Math.max(0, Math.min(1, p1)) * w;
      const px2 = x + Math.max(0, Math.min(1, p2)) * w;
      const insertY = jitter(split.insertSize, jitterBounds);
      const normY = Math.min(insertY / maxInsertSize, 1);
      const py = y + h - normY * h;

      const color = COLORS[split.event] || COLORS['Deletion/Normal'];
      const style = READ_STYLES.split;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = style.alpha;
      ctx.lineWidth = style.lineWidth;

      // Draw dotted line
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(px1, py);
      ctx.lineTo(px2, py);
      ctx.stroke();

      // Draw circle markers at ends
      const ms = style.markerSize;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px1, py, ms / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px2, py, ms / 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  /**
   * Draw the genomic coordinate X-axis.
   * @private
   */
  _drawXAxis(x, y, w, ranges) {
    const ctx = this.ctx;
    const range = ranges[0];

    ctx.save();
    ctx.strokeStyle = this.options.axisColor;
    ctx.fillStyle = '#666666';
    ctx.lineWidth = 1;
    ctx.font = `${this.options.tickFontSize}px ${this.options.fontFamily}`;
    ctx.textAlign = 'center';

    // Draw axis line
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();

    // Draw ticks
    const numTicks = 5;
    for (let i = 0; i <= numTicks; i++) {
      const frac = i / numTicks;
      const px = x + frac * w;
      const genomePos = Math.round(range.start + frac * (range.end - range.start));

      // Tick mark
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(px, y + 5);
      ctx.stroke();

      // Label
      ctx.fillText(formatPosition(genomePos), px, y + 16);
    }

    // Chromosome label
    ctx.font = `bold ${this.options.tickFontSize}px ${this.options.fontFamily}`;
    const chromLabel = range.chrom.startsWith('chr')
      ? range.chrom
      : 'chr' + range.chrom;
    ctx.fillText(chromLabel, x + w / 2, y + 28);

    ctx.restore();
  }

  /**
   * Draw coverage Y-axis scale.
   * @private
   */
  _drawCoverageAxis(x, y, h, maxCoverage) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = '#999999';
    ctx.font = `${this.options.tickFontSize - 1}px ${this.options.fontFamily}`;
    ctx.textAlign = 'left';

    ctx.fillText(Math.round(maxCoverage).toString(), x + 4, y + 10);
    ctx.fillText('0', x + 4, y + h - 2);

    ctx.restore();
  }

  /**
   * Draw insert size Y-axis scale.
   * @private
   */
  _drawInsertAxis(x, y, h, maxInsertSize) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = '#999999';
    ctx.font = `${this.options.tickFontSize - 1}px ${this.options.fontFamily}`;
    ctx.textAlign = 'left';

    const label = maxInsertSize > 1000
      ? `${(maxInsertSize / 1000).toFixed(1)}k`
      : maxInsertSize.toString();
    ctx.fillText(label, x + 4, y + 10);

    ctx.restore();
  }

  /**
   * Draw the legend showing read type colors.
   * @private
   */
  _drawLegend(x, y, w, h, sampleData) {
    const ctx = this.ctx;

    // Determine which read types are present
    const readTypes = new Set();
    for (const sample of sampleData) {
      for (const p of sample.pairs) readTypes.add(p.event);
      for (const s of sample.splits) readTypes.add(s.event);
    }

    const hasPairs = sampleData.some((s) => s.pairs.length > 0);
    const hasSplits = sampleData.some((s) => s.splits.length > 0);

    ctx.save();
    ctx.font = `${this.options.tickFontSize}px ${this.options.fontFamily}`;
    let legendX = x;
    const legendY = y + h / 2;
    const spacing = 20;
    const swatchSize = 10;

    // Event type legend
    for (const eventType of readTypes) {
      const color = COLORS[eventType] || '#000000';

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(legendX, legendY - swatchSize / 2, swatchSize, swatchSize);
      ctx.globalAlpha = 1.0;

      ctx.fillStyle = '#333333';
      const displayName =
        eventType === 'Deletion/Normal' ? 'Normal/Del' : eventType;
      ctx.textAlign = 'left';
      ctx.fillText(displayName, legendX + swatchSize + 4, legendY + 4);
      legendX += ctx.measureText(displayName).width + swatchSize + spacing;
    }

    // Read type legend
    if (hasPairs) {
      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(legendX, legendY);
      ctx.lineTo(legendX + swatchSize, legendY);
      ctx.stroke();
      ctx.fillStyle = '#333333';
      ctx.fillRect(legendX - 2, legendY - 2, 4, 4);
      ctx.fillRect(legendX + swatchSize - 2, legendY - 2, 4, 4);
      ctx.globalAlpha = 1.0;

      ctx.fillStyle = '#333333';
      ctx.fillText('Paired-end', legendX + swatchSize + 4, legendY + 4);
      legendX +=
        ctx.measureText('Paired-end').width + swatchSize + spacing;
    }

    if (hasSplits) {
      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(legendX, legendY);
      ctx.lineTo(legendX + swatchSize, legendY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(legendX, legendY, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(legendX + swatchSize, legendY, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      ctx.fillStyle = '#333333';
      ctx.fillText('Split-read', legendX + swatchSize + 4, legendY + 4);
    }

    ctx.restore();
  }
}
