/**
 * Utility functions for coordinate mapping and formatting.
 * Mirrors the Python samplot coordinate system.
 */

/**
 * Maps a genome coordinate to normalized [0, 1] plot space.
 * Supports multiple ranges for translocation display.
 *
 * @param {Array<{chrom: string, start: number, end: number}>} ranges
 * @param {string} chrom - Chromosome name
 * @param {number} point - Genome position
 * @returns {number|null} Normalized position in [0, 1], or null if outside ranges
 */
export function mapGenomeToPlot(ranges, chrom, point) {
  const rangeIdx = getRangeHit(ranges, chrom, point);
  if (rangeIdx === null) return null;

  const r = ranges[rangeIdx];
  const fraction = (point - r.start) / (r.end - r.start);
  return (1.0 / ranges.length) * rangeIdx + (1.0 / ranges.length) * fraction;
}

/**
 * Find which range index a genome point falls within.
 *
 * @param {Array<{chrom: string, start: number, end: number}>} ranges
 * @param {string} chrom
 * @param {number} point
 * @returns {number|null}
 */
export function getRangeHit(ranges, chrom, point) {
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (
      stripChr(r.chrom) === stripChr(chrom) &&
      r.start <= point &&
      r.end >= point
    ) {
      return i;
    }
  }
  return null;
}

/**
 * Strip 'chr' prefix for consistent chromosome comparison.
 *
 * @param {string} chrom
 * @returns {string}
 */
export function stripChr(chrom) {
  if (chrom && chrom.startsWith('chr')) {
    return chrom.slice(3);
  }
  return chrom;
}

/**
 * Checks whether normalized plot points are within the drawable window.
 *
 * @param {number} p1
 * @param {number} p2
 * @returns {boolean}
 */
export function pointsInWindow(p1, p2) {
  if (p1 === null || p2 === null) return false;
  if (p1 < -5 || p2 < -5 || p1 > 5 || p2 > 5) return false;
  return true;
}

/**
 * Apply random jitter to a value for visual separation.
 *
 * @param {number} value
 * @param {number} bounds - Fraction of value to jitter (0 to 1)
 * @returns {number}
 */
export function jitter(value, bounds = 0.08) {
  return value * (1 + bounds * (Math.random() * 2 - 1));
}

/**
 * Format a genome size into human-readable string.
 *
 * @param {number} size - Size in base pairs
 * @returns {string}
 */
export function formatSize(size) {
  if (size > 1000000) {
    return (size / 1000000).toFixed(2) + ' mb';
  } else if (size > 1000) {
    return (size / 1000).toFixed(2) + ' kb';
  }
  return size + ' bp';
}

/**
 * Format a genome position with commas.
 *
 * @param {number} pos
 * @returns {string}
 */
export function formatPosition(pos) {
  return pos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Calculate the viewing window (ranges) for a structural variant.
 * Adds padding around the SV region.
 *
 * @param {string} chrom
 * @param {number} start
 * @param {number} end
 * @param {number} windowFraction - Fraction of SV size to pad (default 0.15)
 * @returns {Array<{chrom: string, start: number, end: number}>}
 */
export function calculateRanges(chrom, start, end, windowFraction = 0.15) {
  const svSize = end - start;
  const padding = Math.max(Math.round(svSize * windowFraction), 100);
  return [
    {
      chrom,
      start: Math.max(0, start - padding),
      end: end + padding,
    },
  ];
}
