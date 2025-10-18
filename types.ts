/**
 * TypeScript types for Anki .apkg file generation
 * Based on genanki and Anki file format specification
 */

/**
 * Anki Model Field Definition
 */
export interface AnkiField {
  name: string;
  ord: number;
  sticky?: boolean;
  rtl?: boolean;
  font?: string;
  size?: number;
}

/**
 * Anki Card Template Definition
 */
export interface AnkiTemplate {
  name: string;
  ord: number;
  qfmt: string;  // Question format (HTML)
  afmt: string;  // Answer format (HTML)
  bqfmt?: string;
  bafmt?: string;
  did?: number | null;
}

/**
 * Anki Model Definition
 */
export interface AnkiModel {
  id: number;
  name: string;
  type?: number;  // 0 = standard, 1 = cloze
  mod?: number;
  usn?: number;
  sortf?: number;  // Sort field index
  did?: number | null;
  tmpls: AnkiTemplate[];
  flds: AnkiField[];
  css: string;
  latexPre?: string;
  latexPost?: string;
  latexsvg?: boolean;
  req?: Array<[number, string, number[]]>;  // Requirements for card generation
  tags?: string[];
  vers?: any[];
}

/**
 * Anki Deck Definition
 */
export interface AnkiDeck {
  id: number;
  name: string;
  desc?: string;
  collapsed?: boolean;
  conf?: number;
  dyn?: number;
  extendNew?: number;
  extendRev?: number;
  lrnToday?: [number, number];
  mod?: number;
  newToday?: [number, number];
  revToday?: [number, number];
  timeToday?: [number, number];
  usn?: number;
}

/**
 * Note data for adding to deck
 */
export interface AnkiNote {
  fields: string[];
  tags?: string[];
  guid?: string;  // If not provided, will be auto-generated
}

/**
 * Collection configuration
 */
export interface CollectionConfig {
  activeDecks?: number[];
  curDeck?: number;
  newSpread?: number;
  collapseTime?: number;
  timeLim?: number;
  estTimes?: boolean;
  dueCounts?: boolean;
  curModel?: number | null;
  nextPos?: number;
  sortType?: string;
  sortBackwards?: boolean;
  addToCur?: boolean;
  dayLearnFirst?: boolean;
}

/**
 * Deck configuration
 */
export interface DeckConfig {
  id: number;
  name: string;
  replayq?: boolean;
  lapse?: {
    leechFails: number;
    minInt: number;
    delays: number[];
    leechAction: number;
    mult: number;
  };
  rev?: {
    perDay: number;
    fuzz: number;
    ivlFct: number;
    maxIvl: number;
    ease4: number;
    bury: boolean;
    minSpace: number;
  };
  timer?: number;
  maxTaken?: number;
  usn?: number;
  new?: {
    perDay: number;
    delays: number[];
    ints: number[];
    initialFactor: number;
    separate: boolean;
    order: number;
    bury: boolean;
  };
  mod?: number;
  autoplay?: boolean;
}

/**
 * Media file resolver function type
 * Takes a filename and returns a Readable stream
 */
export type MediaResolver = (filename: string) => Promise<NodeJS.ReadableStream>;

/**
 * Package writer options
 */
export interface PackageWriterOptions {
  model: AnkiModel;
  deck: AnkiDeck;
  notes: AnkiNote[];
  mediaResolver: MediaResolver;
  output: NodeJS.WritableStream;
}
