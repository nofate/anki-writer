/**
 * SQLite database creation and management for Anki collection.anki2
 * Uses sql.js for in-memory database to avoid disk I/O
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import type { AnkiModel, AnkiDeck, AnkiNote } from './types.js';
import {
  IdGenerator,
  generateGuid,
  timestampSeconds,
  timestampMillis,
  formatTags,
  joinFields,
  calculateChecksum,
  getDefaultCollectionConfig,
  getDefaultDeckConfig,
  getDefaultLatexPre,
  getDefaultLatexPost,
  generateRequirements
} from './utils.js';

/**
 * SQL schema for Anki collection database
 */
const SCHEMA_SQL = `
-- Collection metadata
CREATE TABLE col (
  id INTEGER PRIMARY KEY,
  crt INTEGER NOT NULL,
  mod INTEGER NOT NULL,
  scm INTEGER NOT NULL,
  ver INTEGER NOT NULL,
  dty INTEGER NOT NULL,
  usn INTEGER NOT NULL,
  ls INTEGER NOT NULL,
  conf TEXT NOT NULL,
  models TEXT NOT NULL,
  decks TEXT NOT NULL,
  dconf TEXT NOT NULL,
  tags TEXT NOT NULL
);

-- Notes table
CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  guid TEXT NOT NULL,
  mid INTEGER NOT NULL,
  mod INTEGER NOT NULL,
  usn INTEGER NOT NULL,
  tags TEXT NOT NULL,
  flds TEXT NOT NULL,
  sfld TEXT NOT NULL,
  csum INTEGER NOT NULL,
  flags INTEGER NOT NULL,
  data TEXT NOT NULL
);

CREATE INDEX ix_notes_usn ON notes (usn);
CREATE INDEX ix_notes_csum ON notes (csum);

-- Cards table
CREATE TABLE cards (
  id INTEGER PRIMARY KEY,
  nid INTEGER NOT NULL,
  did INTEGER NOT NULL,
  ord INTEGER NOT NULL,
  mod INTEGER NOT NULL,
  usn INTEGER NOT NULL,
  type INTEGER NOT NULL,
  queue INTEGER NOT NULL,
  due INTEGER NOT NULL,
  ivl INTEGER NOT NULL,
  factor INTEGER NOT NULL,
  reps INTEGER NOT NULL,
  lapses INTEGER NOT NULL,
  left INTEGER NOT NULL,
  odue INTEGER NOT NULL,
  odid INTEGER NOT NULL,
  flags INTEGER NOT NULL,
  data TEXT NOT NULL
);

CREATE INDEX ix_cards_usn ON cards (usn);
CREATE INDEX ix_cards_sched ON cards (did, queue, due);
CREATE INDEX ix_cards_nid ON cards (nid);

-- Review log
CREATE TABLE revlog (
  id INTEGER PRIMARY KEY,
  cid INTEGER NOT NULL,
  usn INTEGER NOT NULL,
  ease INTEGER NOT NULL,
  ivl INTEGER NOT NULL,
  lastIvl INTEGER NOT NULL,
  factor INTEGER NOT NULL,
  time INTEGER NOT NULL,
  type INTEGER NOT NULL
);

CREATE INDEX ix_revlog_usn ON revlog (usn);
CREATE INDEX ix_revlog_cid ON revlog (cid);

-- Graves (deleted items)
CREATE TABLE graves (
  usn INTEGER NOT NULL,
  oid INTEGER NOT NULL,
  type INTEGER NOT NULL
);

CREATE INDEX ix_graves_usn ON graves (usn);
`;

/**
 * Anki collection database builder
 */
export class AnkiDatabase {
  private db: SqlJsDatabase | null = null;
  private idGen: IdGenerator;
  private models: Map<number, AnkiModel> = new Map<number, AnkiModel>();
  private decks: Map<number, AnkiDeck> = new Map<number, AnkiDeck>();
  private initialized = false;

  constructor() {
    this.idGen = new IdGenerator();
  }

  /**
   * Initialize the database with schema
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    const SQL = await initSqlJs();
    this.db = new SQL.Database();

    // Create schema
    this.db.exec(SCHEMA_SQL);

    // Insert initial collection row
    const now = timestampMillis();
    const nowSec = timestampSeconds();

    const conf = getDefaultCollectionConfig();
    const dconf = getDefaultDeckConfig();

    this.db.run(`
      INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      1,
      nowSec,
      now,
      now,
      11,  // Anki version
      0,   // dirty flag
      -1,  // update sequence number
      0,   // last sync
      JSON.stringify(conf),
      '{}',  // models (will be updated)
      '{}',  // decks (will be updated)
      JSON.stringify(dconf),
      '{}'   // tags
    ]);

    this.initialized = true;
  }

  /**
   * Add a model to the collection
   */
  addModel(model: AnkiModel): void {
    if (!this.db) throw new Error('Database not initialized');

    // Fill in field defaults
    const fullFields = model.flds.map(field => ({
      ...field,
      sticky: field.sticky ?? false,
      rtl: field.rtl ?? false,
      font: field.font ?? 'Arial',
      size: field.size ?? 20
    }));

    // Fill in template defaults
    const fullTemplates = model.tmpls.map(tmpl => ({
      ...tmpl,
      bqfmt: tmpl.bqfmt ?? '',
      bafmt: tmpl.bafmt ?? '',
      did: tmpl.did ?? null
    }));

    // Fill in model defaults
    const fullModel: AnkiModel = {
      ...model,
      flds: fullFields,
      tmpls: fullTemplates,
      type: model.type ?? 0,
      mod: model.mod ?? timestampSeconds(),
      usn: model.usn ?? -1,
      sortf: model.sortf ?? 0,
      did: model.did ?? null,
      latexPre: model.latexPre ?? getDefaultLatexPre(),
      latexPost: model.latexPost ?? getDefaultLatexPost(),
      latexsvg: model.latexsvg ?? false,
      req: model.req ?? generateRequirements(model.tmpls, model.flds),
      tags: model.tags ?? [],
      vers: model.vers ?? []
    };

    this.models.set(model.id, fullModel);
    this.updateCollectionModels();
  }

  /**
   * Add a deck to the collection
   */
  addDeck(deck: AnkiDeck): void {
    if (!this.db) throw new Error('Database not initialized');

    const now = timestampSeconds();
    const fullDeck: AnkiDeck = {
      ...deck,
      desc: deck.desc ?? '',
      collapsed: deck.collapsed ?? false,
      conf: deck.conf ?? 1,
      dyn: deck.dyn ?? 0,
      extendNew: deck.extendNew ?? 0,
      extendRev: deck.extendRev ?? 50,
      lrnToday: deck.lrnToday ?? [0, 0],
      mod: deck.mod ?? now,
      newToday: deck.newToday ?? [0, 0],
      revToday: deck.revToday ?? [0, 0],
      timeToday: deck.timeToday ?? [0, 0],
      usn: deck.usn ?? -1
    };

    this.decks.set(deck.id, fullDeck);
    this.updateCollectionDecks();
  }

  /**
   * Add a note to the database
   */
  addNote(note: AnkiNote, modelId: number, deckId: number): number {
    if (!this.db) throw new Error('Database not initialized');

    const model = this.models.get(modelId);
    if (!model) throw new Error(`Model ${modelId} not found`);

    if (note.fields.length !== model.flds.length) {
      throw new Error(`Note has ${note.fields.length} fields, but model expects ${model.flds.length}`);
    }

    const noteId = this.idGen.next();
    const guid = note.guid ?? generateGuid(...note.fields);
    const tags = formatTags(note.tags ?? []);
    const flds = joinFields(note.fields);
    const sfld = note.fields[model.sortf ?? 0];
    const csum = calculateChecksum(note.fields[0]);
    const mod = timestampSeconds();

    // Insert note
    this.db.run(`
      INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [noteId, guid, modelId, mod, -1, tags, flds, sfld, csum, 0, '']);

    // Generate cards for each template
    for (let ord = 0; ord < model.tmpls.length; ord++) {
      this.addCard(noteId, deckId, ord);
    }

    return noteId;
  }

  /**
   * Add a card to the database
   */
  private addCard(noteId: number, deckId: number, ord: number): number {
    if (!this.db) throw new Error('Database not initialized');

    const cardId = this.idGen.next();
    const mod = timestampSeconds();

    this.db.run(`
      INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      cardId,
      noteId,
      deckId,
      ord,
      mod,
      -1,   // usn
      0,    // type (new)
      0,    // queue (new)
      cardId,  // due (use card ID for new cards)
      0,    // ivl
      0,    // factor
      0,    // reps
      0,    // lapses
      0,    // left
      0,    // odue
      0,    // odid
      0,    // flags
      ''    // data
    ]);

    return cardId;
  }

  /**
   * Update models JSON in collection
   */
  private updateCollectionModels(): void {
    if (!this.db) throw new Error('Database not initialized');

    const modelsObj: Record<string, AnkiModel> = {};
    for (const [id, model] of this.models.entries()) {
      modelsObj[id.toString()] = model;
    }

    this.db.run(
      'UPDATE col SET models = ? WHERE id = 1',
      [JSON.stringify(modelsObj)]
    );
  }

  /**
   * Update decks JSON in collection
   */
  private updateCollectionDecks(): void {
    if (!this.db) throw new Error('Database not initialized');

    const decksObj: Record<string, AnkiDeck> = {};
    for (const [id, deck] of this.decks.entries()) {
      decksObj[id.toString()] = deck;
    }

    this.db.run(
      'UPDATE col SET decks = ? WHERE id = 1',
      [JSON.stringify(decksObj)]
    );
  }

  /**
   * Export database as Uint8Array
   */
  export(): Uint8Array {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.export();
  }

  /**
   * Close the database
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
