/**
 * Processes raw BAM records into classified read data for rendering.
 * Mirrors samplot.py read classification logic.
 *
 * @gmod/bam BamRecord API:
 *   Getters: .flags, .start, .end, .name, .mq, .tags, .next_pos, .next_refid,
 *            .template_length, .CIGAR, .seq, .strand, .seq_length
 *   Methods: .isPaired(), .isMateUnmapped(), .isReverseComplemented(),
 *            .isMateReverseComplemented(), .isSecondary(), .isDuplicate(),
 *            .isSupplementary(), .isFailedQc(), .isSegmentUnmapped()
 */
import { stripChr } from './utils.js';

export class DataProcessor {
  /**
   * @param {Object} options
   * @param {number} [options.minMappingQuality=1] - Min MAPQ to include a read
   * @param {number} [options.separateMappingQuality=20] - MAPQ threshold for high/low quality coverage
   * @param {number} [options.longReadLength=1000] - Threshold to classify as long read
   * @param {number} [options.maxDepth=1000] - Max number of reads to plot
   */
  constructor(options = {}) {
    this.minMQ = options.minMappingQuality ?? 1;
    this.separateMQ = options.separateMappingQuality ?? 20;
    this.longReadLength = options.longReadLength ?? 1000;
    this.maxDepth = options.maxDepth ?? 1000;
  }

  /**
   * Process BAM records into classified read data.
   *
   * @param {Array} records - BAM records from @gmod/bam
   * @param {{chrom: string, start: number, end: number}} region - Viewing region
   * @returns {{pairs: Array, splits: Array, coverage: {high: Float32Array, low: Float32Array}, maxCoverage: number}}
   */
  processReads(records, region) {
    const regionLen = region.end - region.start;
    const covHigh = new Float32Array(regionLen);
    const covLow = new Float32Array(regionLen);
    const pairs = [];
    const splits = [];
    const seenPairNames = new Set();

    for (const record of records) {
      if (this._shouldSkip(record)) continue;

      // Coverage tracking
      this._addCoverage(record, region, covHigh, covLow);

      // Read length check - skip long reads for short-read mode
      const readLen = (record.end || 0) - (record.start || 0);
      if (readLen >= this.longReadLength) continue;

      // Split reads (SA tag present)
      const saTag = this._getTag(record, 'SA');
      if (saTag) {
        const splitData = this._processSplitRead(record, saTag, region);
        if (splitData && splits.length < this.maxDepth) {
          splits.push(splitData);
        }
      }

      // Paired-end reads
      if (record.isPaired() && !record.isMateUnmapped()) {
        const readName = record.name;
        if (!seenPairNames.has(readName)) {
          seenPairNames.add(readName);
          const pairData = this._processPairedRead(record, region);
          if (pairData && pairs.length < this.maxDepth) {
            pairs.push(pairData);
          }
        }
      }
    }

    // Calculate max coverage
    let maxCov = 0;
    for (let i = 0; i < regionLen; i++) {
      const total = covHigh[i] + covLow[i];
      if (total > maxCov) maxCov = total;
    }

    return {
      pairs,
      splits,
      coverage: { high: covHigh, low: covLow },
      maxCoverage: maxCov,
    };
  }

  /**
   * Check if a record should be skipped based on flags and quality.
   * @private
   */
  _shouldSkip(record) {
    if (record.isSegmentUnmapped()) return true;
    if (record.isFailedQc()) return true;
    if (record.isDuplicate()) return true;
    if (record.isSecondary()) return true;
    if (record.isSupplementary()) return true;
    const mq = record.mq ?? 0;
    if (mq < this.minMQ) return true;
    return false;
  }

  /**
   * Add a record's coverage to the coverage arrays.
   * @private
   */
  _addCoverage(record, region, covHigh, covLow) {
    const readStart = record.start ?? 0;
    const readEnd = record.end ?? 0;
    const start = Math.max(readStart, region.start);
    const end = Math.min(readEnd, region.end);
    const mq = record.mq ?? 0;
    const arr = mq >= this.separateMQ ? covHigh : covLow;

    for (let pos = start; pos < end; pos++) {
      const idx = pos - region.start;
      if (idx >= 0 && idx < arr.length) {
        arr[idx]++;
      }
    }
  }

  /**
   * Process a paired-end read into plotting data.
   * Matches Python samplot's get_pair_plan() / get_pair_insert_size() logic:
   * - Filters inter-chromosomal pairs
   * - Uses outer distance (abs(template_length)) as insert size
   * - Skips improperly paired reads with template_length=0
   * @private
   */
  _processPairedRead(record, region) {
    const readStart = record.start ?? 0;
    const matePos = record.next_pos;
    if (matePos === undefined || matePos === null) return null;

    // Filter inter-chromosomal pairs (Python: first.pos.chrm == second.pos.chrm)
    if (record.ref_id !== record.next_refid) return null;

    const readEnd = record.end ?? 0;

    // Use template_length (TLEN) as insert size — matches Python's outer distance
    // TLEN=0 means unmapped mate, inter-chromosomal, or unavailable — skip these
    const insertSize = Math.abs(record.template_length ?? 0);
    if (insertSize === 0) return null;

    const isReverse = record.isReverseComplemented();
    const mateIsReverse = record.isMateReverseComplemented();

    // Get strands in the samplot convention (True = forward)
    const readStrand = !isReverse;
    const mateStrand = !mateIsReverse;

    // Order by position to match Python's pair ordering
    let firstStrand, secondStrand;
    if (readStart <= matePos) {
      firstStrand = readStrand;
      secondStrand = mateStrand;
    } else {
      firstStrand = mateStrand;
      secondStrand = readStrand;
    }

    const event = this._getEventType(firstStrand, secondStrand);

    const pairStart = Math.min(readStart, matePos);
    const pairEnd = Math.max(readEnd, matePos);

    return {
      start: pairStart,
      end: pairEnd,
      insertSize,
      event,
    };
  }

  /**
   * Process a split read (SA tag) into plotting data.
   * @private
   */
  _processSplitRead(record, saTag, region) {
    const readStart = record.start ?? 0;
    const readEnd = record.end ?? 0;
    const isReverse = record.isReverseComplemented();

    // Parse SA tag: rname,pos,strand,CIGAR,mapQ,NM;...
    const entries = saTag.split(';').filter((s) => s.length > 0);
    if (entries.length === 0) return null;

    const parts = entries[0].split(',');
    if (parts.length < 3) return null;

    const saChrom = parts[0];
    const saPos = parseInt(parts[1], 10);
    const saIsReverse = parts[2] === '-';

    // Only include split reads on the same chromosome for now
    if (stripChr(saChrom) !== stripChr(region.chrom)) return null;

    const readStrand = !isReverse;
    const saStrand = !saIsReverse;

    let firstStrand, secondStrand;
    if (readStart <= saPos) {
      firstStrand = readStrand;
      secondStrand = saStrand;
    } else {
      firstStrand = saStrand;
      secondStrand = readStrand;
    }

    const event = this._getEventType(firstStrand, secondStrand);
    const splitStart = Math.min(readStart, saPos);
    const splitEnd = Math.max(readEnd, saPos);

    return {
      start: splitStart,
      end: splitEnd,
      insertSize: splitEnd - splitStart,
      event,
    };
  }

  /**
   * Determine event type from strand orientations.
   * Matches Python samplot's get_pair_event_type().
   *
   * @param {boolean} firstStrand - True if forward
   * @param {boolean} secondStrand - True if forward
   * @returns {string}
   * @private
   */
  _getEventType(firstStrand, secondStrand) {
    if (firstStrand && !secondStrand) return 'Deletion/Normal';
    if (!firstStrand && secondStrand) return 'Duplication';
    return 'Inversion';
  }

  /**
   * Get a SAM tag value from a record.
   * @private
   */
  _getTag(record, tagName) {
    try {
      const tags = record.tags;
      return tags && tags[tagName] != null ? tags[tagName] : null;
    } catch {
      return null;
    }
  }
}
