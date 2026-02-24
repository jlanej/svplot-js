/**
 * BAM file reader using @gmod/bam for browser-based access.
 * Supports remote URLs and local File objects.
 */
import { BamFile } from '@gmod/bam';
import { RemoteFile, LocalFile } from 'generic-filehandle';

export class BamReader {
  /**
   * Create a BamReader instance.
   *
   * @param {Object} config
   * @param {string} [config.url] - URL to BAM file (for remote access)
   * @param {string} [config.indexUrl] - URL to BAI index file
   * @param {File} [config.bamFile] - Local File object (for file input)
   * @param {File} [config.indexFile] - Local BAI File object
   * @param {string} [config.label] - Display name for this sample
   */
  constructor(config) {
    this.label = config.label || '';

    const bamOpts = {};
    if (config.url) {
      bamOpts.bamFilehandle = new RemoteFile(config.url);
      bamOpts.baiFilehandle = new RemoteFile(
        config.indexUrl || config.url + '.bai',
      );
    } else if (config.bamFile) {
      bamOpts.bamFilehandle = new LocalFile(config.bamFile);
      bamOpts.baiFilehandle = new LocalFile(config.indexFile);
    }

    this.bam = new BamFile(bamOpts);
    this._headerPromise = null;
  }

  /**
   * Get the BAM header (cached).
   *
   * @returns {Promise<string>}
   */
  async getHeader() {
    if (!this._headerPromise) {
      this._headerPromise = this.bam.getHeader();
    }
    return this._headerPromise;
  }

  /**
   * Fetch reads from a genomic region.
   *
   * @param {string} chrom - Chromosome name
   * @param {number} start - Start position (0-based)
   * @param {number} end - End position
   * @returns {Promise<Array>} Array of BAM records
   */
  async fetchReads(chrom, start, end) {
    // Ensure header is loaded first
    await this.getHeader();

    const records = await this.bam.getRecordsForRange(chrom, start, end);
    return records;
  }
}
