/**
 * Streaming ZIP writer for Anki .apkg files
 * Uses archiver to create ZIP in streaming manner without disk I/O
 */

import archiver from 'archiver';
import { Readable } from 'node:stream';

/**
 * Media file entry for ZIP
 */
export interface MediaEntry {
  index: number;
  filename: string;
  stream: NodeJS.ReadableStream | AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
}

/**
 * Streaming ZIP writer for .apkg files
 */
export class ApkgZipWriter {
  private archive: archiver.Archiver;
  private finalized = false;

  constructor(private output: NodeJS.WritableStream) {
    this.archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    // Pipe archive to output stream
    this.archive.pipe(output);

    // Handle errors
    this.archive.on('error', (err) => {
      throw err;
    });
  }

  /**
   * Add collection.anki2 database file
   */
  addDatabase(data: Uint8Array): Promise<void> {
    if (this.finalized) throw new Error('Archive already finalized');

    // Convert Uint8Array to Buffer for archiver
    const buffer = Buffer.from(data);

    this.archive.append(buffer, { name: 'collection.anki2' });
    return Promise.resolve();
  }

  /**
   * Add a media file with numeric name (0, 1, 2, ...)
   */
  addMediaFile(
    index: number,
    stream: NodeJS.ReadableStream | AsyncIterable<Uint8Array> | Iterable<Uint8Array>
  ): Promise<void> {
    if (this.finalized) throw new Error('Archive already finalized');

    return new Promise((resolve, reject) => {
      // Ensure stream is a Node.js Readable, not Web API ReadableStream
      const readableStream = stream instanceof Readable ? stream : Readable.from(stream);

      // Handle stream errors
      readableStream.once('error', reject);

      // Wait for stream to end before resolving
      readableStream.once('end', () => resolve());

      // archiver handles the stream internally and will queue it
      this.archive.append(readableStream, { name: index.toString() });
    });
  }

  /**
   * Add multiple media files asynchronously
   * Processes them in parallel for performance
   */
  async addMediaFiles(entries: MediaEntry[]): Promise<void> {
    if (this.finalized) throw new Error('Archive already finalized');

    // Process media files - archiver handles internal queueing
    const promises = entries.map((entry) => this.addMediaFile(entry.index, entry.stream));

    await Promise.all(promises);
  }

  /**
   * Add media manifest (media.json)
   */
  addMediaManifest(manifest: Record<string, string>): Promise<void> {
    if (this.finalized) throw new Error('Archive already finalized');

    const json = JSON.stringify(manifest);
    this.archive.append(json, { name: 'media' });
    return Promise.resolve();
  }

  /**
   * Finalize the archive (must be called after all files added)
   */
  async finalize(): Promise<void> {
    if (this.finalized) throw new Error('Archive already finalized');

    this.finalized = true;
    await this.archive.finalize();

    // Wait for output stream to finish
    return new Promise((resolve, reject) => {
      this.output.once('finish', resolve);
      this.output.once('error', reject);
    });
  }

  /**
   * Check if archive is finalized
   */
  isFinalized(): boolean {
    return this.finalized;
  }
}

/**
 * Helper function to convert async iterable to array
 */
export function collectMediaFilenames(
  fields: string[],
  extractFn: (content: string) => string[]
): Set<string> {
  const filenames = new Set<string>();

  for (const field of fields) {
    const mediaFiles = extractFn(field);
    for (const filename of mediaFiles) {
      filenames.add(filename);
    }
  }

  return filenames;
}

/**
 * Build media manifest from set of filenames
 */
export function buildMediaManifest(filenames: string[]): Record<string, string> {
  const manifest: Record<string, string> = {};

  filenames.forEach((filename, index) => {
    manifest[index.toString()] = filename;
  });

  return manifest;
}
