/**
 * Color scheme matching Python samplot.
 * Event types are determined by paired-end read strand orientation.
 */
export const COLORS = {
  'Deletion/Normal': '#000000',
  Deletion: '#000000',
  Duplication: '#ff0000',
  Inversion: '#0000ff',
  InterChrmInversion: '#0000ff',
  InterChrm: '#000000',
};

/**
 * Coverage track colors matching Python samplot.
 */
export const COVERAGE_COLORS = {
  highQuality: 'rgba(169,169,169,0.4)', // darkgrey at alpha 0.4
  lowQuality: 'rgba(128,128,128,0.15)', // grey at alpha 0.15
};

/**
 * Read rendering styles matching Python samplot.
 */
export const READ_STYLES = {
  pair: { alpha: 0.25, lineWidth: 0.5, markerSize: 3, lineStyle: 'solid' },
  split: { alpha: 0.25, lineWidth: 1, markerSize: 3, lineStyle: 'dotted' },
  variant: { lineWidth: 8, alpha: 0.5, color: '#000000' },
};

/**
 * Default configuration values.
 */
export const DEFAULTS = {
  minMappingQuality: 1,
  separateMappingQuality: 20,
  longReadLength: 1000,
  maxDepth: 1000,
  jitter: 0.08,
  markerSize: 3,
  coverageTrackType: 'stack',
  dpi: 1, // device pixel ratio multiplier
  padding: { top: 40, right: 60, bottom: 30, left: 60 },
  sampleHeight: 250,
  variantBarHeight: 30,
  legendHeight: 40,
  backgroundColor: '#ffffff',
  axisColor: '#999999',
  fontFamily: 'Arial, Helvetica, sans-serif',
  titleFontSize: 14,
  labelFontSize: 11,
  tickFontSize: 10,
  maxCoveragePoints: 1000,
  window: 0.15,
};

/**
 * SAM flag constants.
 */
export const FLAGS = {
  PAIRED: 0x1,
  PROPER_PAIR: 0x2,
  UNMAPPED: 0x4,
  MATE_UNMAPPED: 0x8,
  REVERSE: 0x10,
  MATE_REVERSE: 0x20,
  READ1: 0x40,
  READ2: 0x80,
  SECONDARY: 0x100,
  QC_FAIL: 0x200,
  DUPLICATE: 0x400,
  SUPPLEMENTARY: 0x800,
};
