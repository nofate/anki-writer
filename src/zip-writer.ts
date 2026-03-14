/**
 * Streaming ZIP writer for Anki .apkg files
 * Uses fflate to create ZIP in streaming manner without disk I/O
 */

import { Zip, ZipDeflate, ZipPassThrough } from 'fflate/browser';
import { once } from 'node:events';
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
  private zip: Zip;
  private finalized = false;
  private writeChain: Promise<void> = Promise.resolve();
  private zipDone: Promise<void>;
  private zipDoneResolve?: () => void;
  private zipDoneReject?: (err: Error) => void;
  private zipDoneSettled = false;

  constructor(private output: NodeJS.WritableStream) {
    this.zipDone = new Promise((resolve, reject) => {
      this.zipDoneResolve = resolve;
      this.zipDoneReject = reject;
    });

    this.output.once('error', (err) => {
      this.rejectZipDone(err instanceof Error ? err : new Error(String(err)));
    });

    this.zip = new Zip((err, data, final) => {
      if (err) {
        this.rejectZipDone(err);
        return;
      }

      if (data && data.length > 0) {
        this.enqueueWrite(data);
      }

      if (final) {
        this.resolveZipDone();
      }
    });
  }

  /**
   * Add collection.anki2 database file
   */
  addDatabase(data: Uint8Array): Promise<void> {
    if (this.finalized) throw new Error('Archive already finalized');

    const entry = this.createEntry('collection.anki2');
    entry.push(data, true);
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
      const entry = this.createMediaEntry(index.toString());

      const readableStream = stream instanceof Readable ? stream : Readable.from(stream);

      const pump = async (): Promise<void> => {
        try {
          for await (const chunk of readableStream) {
            if (typeof chunk === 'string') {
              entry.push(Buffer.from(chunk), false);
            } else {
              entry.push(chunk as Uint8Array, false);
            }
          }
          entry.push(new Uint8Array(0), true);
          resolve();
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Failed to read media stream'));
        }
      };

      readableStream.once('error', (err) => {
        reject(err);
      });

      void pump();
    });
  }

  /**
   * Add multiple media files asynchronously
   * Processes them in parallel for performance
   */
  async addMediaFiles(entries: MediaEntry[]): Promise<void> {
    if (this.finalized) throw new Error('Archive already finalized');

    // Process media files in parallel to keep throughput
    const promises = entries.map((entry) => this.addMediaFile(entry.index, entry.stream));

    await Promise.all(promises);
  }

  /**
   * Add media manifest (media.json)
   */
  addMediaManifest(manifest: Record<string, string>): Promise<void> {
    if (this.finalized) throw new Error('Archive already finalized');

    const json = JSON.stringify(manifest);
    const entry = this.createEntry('media');
    entry.push(Buffer.from(json), true);
    return Promise.resolve();
  }

  /**
   * Finalize the archive (must be called after all files added)
   */
  async finalize(): Promise<void> {
    if (this.finalized) throw new Error('Archive already finalized');

    this.finalized = true;

    this.zip.end();

    await this.zipDone;
    await this.writeChain;

    this.output.end();
    await once(this.output, 'finish');
  }

  /**
   * Check if archive is finalized
   */
  isFinalized(): boolean {
    return this.finalized;
  }

  private createEntry(name: string): ZipDeflate {
    const entry = new ZipDeflate(name, { level: 9 });
    this.zip.add(entry);
    return entry;
  }

  private createMediaEntry(name: string): ZipPassThrough {
    const entry = new ZipPassThrough(name);
    this.zip.add(entry);
    return entry;
  }

  private enqueueWrite(data: Uint8Array): void {
    this.writeChain = this.writeChain.then(() => this.writeChunk(data));
  }

  private async writeChunk(data: Uint8Array): Promise<void> {
    if (!this.output.write(data)) {
      await once(this.output, 'drain');
    }
  }

  private resolveZipDone(): void {
    if (this.zipDoneSettled) return;
    this.zipDoneSettled = true;
    this.zipDoneResolve?.();
  }

  private rejectZipDone(err: Error): void {
    if (this.zipDoneSettled) return;
    this.zipDoneSettled = true;
    this.zipDoneReject?.(err);
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
