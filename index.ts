/**
 * Main Anki .apkg package writer
 * Streaming implementation that avoids disk I/O
 */

import { AnkiDatabase } from './database.js';
import { ApkgZipWriter, MediaEntry, buildMediaManifest } from './zip-writer.js';
import { extractMediaFilenames } from './utils.js';
import type { AnkiModel, AnkiDeck, AnkiNote, MediaResolver } from './types.js';

/**
 * Options for creating Anki package
 */
export interface CreatePackageOptions {
  model: AnkiModel;
  deck: AnkiDeck;
  notes: AnkiNote[];
  mediaResolver: MediaResolver;
  output: NodeJS.WritableStream;
}

/**
 * Anki package writer with streaming API
 */
export class AnkiPackageWriter {
  private db: AnkiDatabase;
  private zipWriter: ApkgZipWriter;
  private model: AnkiModel;
  private deck: AnkiDeck;
  private notes: AnkiNote[];
  private mediaResolver: MediaResolver;
  private mediaFiles: Set<string> = new Set();

  constructor(options: CreatePackageOptions) {
    this.model = options.model;
    this.deck = options.deck;
    this.notes = options.notes;
    this.mediaResolver = options.mediaResolver;

    this.db = new AnkiDatabase();
    this.zipWriter = new ApkgZipWriter(options.output);
  }

  /**
   * Create the package (main entry point)
   */
  async create(): Promise<void> {
    try {
      // Step 1: Initialize database
      await this.db.init();

      // Step 2: Add model and deck
      this.db.addModel(this.model);
      this.db.addDeck(this.deck);

      // Step 3: Add notes and collect media filenames
      this.collectMediaFilenames();

      // Step 4: Add notes to database
      for (const note of this.notes) {
        this.db.addNote(note, this.model.id, this.deck.id);
      }

      // Step 5: Export database
      const dbData = this.db.export();

      // Step 6: Write media files to ZIP (asynchronously)
      await this.writeMediaFiles();

      // Step 7: Add database to ZIP
      await this.zipWriter.addDatabase(dbData);

      // Step 8: Add media manifest
      await this.writeMediaManifest();

      // Step 9: Finalize ZIP
      await this.zipWriter.finalize();

      // Step 10: Clean up
      this.db.close();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  /**
   * Collect all media filenames from notes
   */
  private collectMediaFilenames(): void {
    for (const note of this.notes) {
      for (const field of note.fields) {
        const filenames = extractMediaFilenames(field);
        for (const filename of filenames) {
          this.mediaFiles.add(filename);
        }
      }
    }
  }

  /**
   * Write media files to ZIP asynchronously
   */
  private async writeMediaFiles(): Promise<void> {
    const filenames = Array.from(this.mediaFiles);

    if (filenames.length === 0) {
      return;
    }

    // Create media entries with streams
    const mediaEntries: MediaEntry[] = [];

    for (let i = 0; i < filenames.length; i++) {
      const filename = filenames[i];
      const stream = await this.mediaResolver(filename);

      mediaEntries.push({
        index: i,
        filename,
        stream
      });
    }

    // Write all media files to ZIP
    // The ZIP writer will handle parallel processing
    await this.zipWriter.addMediaFiles(mediaEntries);
  }

  /**
   * Write media manifest to ZIP
   */
  private async writeMediaManifest(): Promise<void> {
    const filenames = Array.from(this.mediaFiles);
    const manifest = buildMediaManifest(filenames);
    await this.zipWriter.addMediaManifest(manifest);
  }
}

/**
 * Convenience function to create an Anki package
 */
export async function createAnkiPackage(options: CreatePackageOptions): Promise<void> {
  const writer = new AnkiPackageWriter(options);
  await writer.create();
}

// Re-export types and utilities
export type {
  AnkiModel,
  AnkiDeck,
  AnkiNote,
  AnkiField,
  AnkiTemplate,
  MediaResolver,
  CollectionConfig,
  DeckConfig
} from './types.js';

export {
  generateDeckId,
  generateModelId,
  generateGuid,
  extractMediaFilenames
} from './utils.js';
