/**
 * Utility functions for Anki package generation
 */

import crypto from 'node:crypto';

/**
 * Base91 encoding alphabet (Anki-specific)
 */
const BASE91_TABLE = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's',
  't', 'u', 'v', 'w', 'x', 'y', 'z', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L',
  'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0', '1', '2', '3', '4',
  '5', '6', '7', '8', '9', '!', '#', '$', '%', '&', '(', ')', '*', '+', ',', '-', '.', '/', ':',
  ';', '<', '=', '>', '?', '@', '[', ']', '^', '_', '`', '{', '|', '}', '~'
];

/**
 * Convert BigInt to base91 string
 */
function toBase91(num: bigint): string {
  if (num === 0n) return BASE91_TABLE[0];

  const result: string[] = [];
  while (num > 0n) {
    result.push(BASE91_TABLE[Number(num % 91n)]);
    num = num / 91n;
  }

  return result.reverse().join('');
}

/**
 * Generate GUID for a note based on its fields
 * Anki uses first 8 bytes of SHA-256 hash converted to base91
 */
export function generateGuid(...fields: any[]): string {
  const hashStr = fields.join('__');

  // Compute SHA-256 and take first 8 bytes
  const hash = crypto.createHash('sha256').update(hashStr, 'utf8').digest();
  const hashBytes = hash.subarray(0, 8);

  // Convert to BigInt (big-endian)
  let hashInt = 0n;
  for (const byte of hashBytes) {
    hashInt = (hashInt << 8n) + BigInt(byte);
  }

  // Convert to base91
  return toBase91(hashInt);
}

/**
 * ID generator that produces sequential timestamps
 */
export class IdGenerator {
  private currentId: number;

  constructor(startTimestamp?: number) {
    this.currentId = startTimestamp ?? Date.now();
  }

  next(): number {
    return this.currentId++;
  }

  peek(): number {
    return this.currentId;
  }
}

/**
 * Generate a random deck ID (between 2^30 and 2^31)
 */
export function generateDeckId(): number {
  return Math.floor(Math.random() * (1 << 30)) + (1 << 30);
}

/**
 * Generate a random model ID
 */
export function generateModelId(): number {
  return Math.floor(Math.random() * (1 << 30)) + (1 << 30);
}

/**
 * Get current timestamp in seconds
 */
export function timestampSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Get current timestamp in milliseconds
 */
export function timestampMillis(): number {
  return Date.now();
}

/**
 * Extract media filenames from HTML content
 * Looks for [sound:filename] and <img src="filename">
 */
export function extractMediaFilenames(html: string): string[] {
  const filenames: string[] = [];

  // Match [sound:filename]
  const soundMatches = html.matchAll(/\[sound:([^\]]+)\]/g);
  for (const match of soundMatches) {
    filenames.push(match[1]);
  }

  // Match <img src="filename">
  const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
  for (const match of imgMatches) {
    filenames.push(match[1]);
  }

  return filenames;
}

/**
 * Escape SQL string value
 */
export function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Format tags for Anki (space-separated with leading/trailing spaces)
 */
export function formatTags(tags: string[]): string {
  if (tags.length === 0) return '';
  return ` ${tags.join(' ')} `;
}

/**
 * Join note fields with \x1f separator
 */
export function joinFields(fields: string[]): string {
  return fields.join('\x1f');
}

/**
 * Calculate checksum for note fields (optional, can return 0)
 * Anki uses CRC32 of first field, but it's not strictly required
 */
export function calculateChecksum(_firstField: string): number {
  // Simple implementation: return 0 (valid for new decks)
  // Full implementation would use CRC32
  return 0;
}

/**
 * Generate default collection configuration
 */
export function getDefaultCollectionConfig(): object {
  return {
    activeDecks: [1],
    curDeck: 1,
    newSpread: 0,
    collapseTime: 1200,
    timeLim: 0,
    estTimes: true,
    dueCounts: true,
    curModel: null,
    nextPos: 1,
    sortType: "noteFld",
    sortBackwards: false,
    addToCur: true,
    dayLearnFirst: false
  };
}

/**
 * Generate default deck configuration
 */
export function getDefaultDeckConfig(): object {
  return {
    "1": {
      id: 1,
      name: "Default",
      replayq: true,
      lapse: {
        leechFails: 8,
        minInt: 1,
        delays: [10],
        leechAction: 0,
        mult: 0
      },
      rev: {
        perDay: 200,
        fuzz: 0.05,
        ivlFct: 1,
        maxIvl: 36500,
        ease4: 1.3,
        bury: false,
        minSpace: 1
      },
      timer: 0,
      maxTaken: 60,
      usn: -1,
      new: {
        perDay: 20,
        delays: [1, 10],
        ints: [1, 4, 7],
        initialFactor: 2500,
        separate: true,
        order: 1,
        bury: false
      },
      mod: 0,
      autoplay: true
    }
  };
}

/**
 * Generate default LaTeX preamble
 */
export function getDefaultLatexPre(): string {
  return `\\documentclass[12pt]{article}
\\special{papersize=3in,5in}
\\usepackage[utf8]{inputenc}
\\usepackage{amssymb,amsmath}
\\pagestyle{empty}
\\setlength{\\parindent}{0in}
\\begin{document}
`;
}

/**
 * Generate default LaTeX postamble
 */
export function getDefaultLatexPost(): string {
  return '\\end{document}';
}

/**
 * Generate requirements array for card templates
 * This determines which cards are generated based on non-empty fields
 */
export function generateRequirements(templates: any[], _fields: any[]): Array<[number, string, number[]]> {
  // Simple implementation: each template requires "any" field to be non-empty
  return templates.map((_tmpl, idx) => [idx, "any", [0]] as [number, string, number[]]);
}
