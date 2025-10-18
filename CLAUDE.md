# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a streaming TypeScript library for generating Anki `.apkg` files without disk I/O. It creates flashcard decks entirely in memory, streaming the output to any destination (file, HTTP response, S3, etc.). The library is designed for Node.js 22+ with native ESM support.

## Development Commands

### Build and Development
```bash
npm run build          # Compile TypeScript to dist/
npm run dev           # Watch mode for development
npm run example       # Run example.ts to test functionality
```

### Code Quality
```bash
npm run lint          # Run ESLint on TypeScript files
npm run format        # Format code with Prettier
```

### Testing
Run the example script to verify functionality:
```bash
npm run example
```
This generates a test `.apkg` file that can be imported into Anki for verification.

## Architecture

### Core Data Flow

The package generation follows this sequence:

1. **Initialize SQLite database** (in-memory using sql.js)
2. **Create schema** (col, notes, cards, revlog, graves tables)
3. **Add model and deck** to collection metadata
4. **Scan notes** for media references (`[sound:file.mp3]`, `<img src="file.jpg">`)
5. **Insert notes** into database (with GUID generation)
6. **Generate cards** for each note × template combination
7. **Export database** as Uint8Array
8. **Stream media files** to ZIP (fetched via MediaResolver)
9. **Add database** to ZIP as `collection.anki2`
10. **Add media manifest** JSON to ZIP
11. **Finalize ZIP** and stream to output

### Module Responsibilities

- **[types.ts](types.ts)**: TypeScript interfaces for models, decks, notes, and configuration
- **[utils.ts](utils.ts)**: ID generation, GUID creation (SHA-256 + Base91), media extraction, timestamp utilities
- **[database.ts](database.ts)**: SQLite schema creation and data insertion using sql.js (in-memory)
- **[zip-writer.ts](zip-writer.ts)**: Streaming ZIP creation using archiver library
- **[index.ts](index.ts)**: Main `AnkiPackageWriter` class that orchestrates the flow

### Key Design Patterns

**Streaming Architecture**: Everything processes in memory without temporary files. Media files are streamed directly from source (via `MediaResolver`) into the ZIP archive.

**MediaResolver Pattern**: Async function `(filename: string) => Promise<NodeJS.ReadableStream>` allows fetching media from any source (filesystem, S3, HTTP).

**ID Generation**: Uses `IdGenerator` class starting from `Date.now()` and incrementing for sequential, timestamp-based IDs. Deck and model IDs are random in range 2^30 to 2^31.

**GUID Generation**: SHA-256 hash of note fields (first 8 bytes) encoded in Anki's Base91 alphabet for note deduplication.

### Anki .apkg File Structure

An `.apkg` file is a ZIP archive containing:

```
deck.apkg/
├── collection.anki2    # SQLite database with col, notes, cards, revlog, graves tables
├── media               # JSON: {"0": "audio.mp3", "1": "image.jpg"}
├── 0                   # Renamed media file
├── 1                   # Renamed media file
└── ...
```

**Important**: Media files are renamed to numeric indices (0, 1, 2...) in the ZIP, with the mapping stored in the `media` JSON file.

## Database Schema Details

The `collection.anki2` SQLite database contains:

- **col table**: Collection metadata with JSON fields for `models`, `decks`, `dconf`, and `conf`
- **notes table**: Note data with `flds` (fields joined with `\x1f`), `guid`, `mid` (model ID)
- **cards table**: Card instances linking notes to decks, with `nid` (note ID), `did` (deck ID), `ord` (template ordinal)
- **revlog table**: Review history (empty for new decks)
- **graves table**: Deleted items tracking (empty for new decks)

## Working with Models and Templates

**Model (Note Type)**: Defines the structure of notes with fields and card templates.

```typescript
const model = {
  id: generateModelId(),
  name: 'Basic',
  flds: [
    { name: 'Front', ord: 0 },
    { name: 'Back', ord: 1 }
  ],
  tmpls: [
    {
      name: 'Card 1',
      ord: 0,
      qfmt: '{{Front}}',              // Question format
      afmt: '{{FrontSide}}<hr>{{Back}}'  // Answer format
    }
  ],
  css: '.card { font-size: 20px; }'
};
```

**Template System**: Each template (`tmpls`) generates one card per note. For bidirectional cards, add a second template. The `req` field (auto-generated) determines which cards are created based on non-empty fields.

## TypeScript Configuration

- **Module**: ES2022 with `"type": "module"` in package.json
- **Target**: ES2022 for modern Node.js features
- **Module Resolution**: `bundler` mode
- **Strict Mode**: Enabled with all strict checks
- **Output**: Compiled to `dist/` with declarations and source maps

## Dependencies

**Production**:
- `sql.js` - WebAssembly SQLite for in-memory database
- `archiver` - Streaming ZIP creation

**Development**:
- `tsx` - TypeScript execution for examples
- ESLint + TypeScript plugin
- Prettier for formatting

## Common Patterns

### Adding Media to Notes
```typescript
const note = {
  fields: [
    'Question text',
    '[sound:audio.mp3]',      // Audio
    '<img src="image.jpg">'   // Image
  ]
};
```

### Custom MediaResolver
```typescript
// From filesystem
const mediaResolver = async (filename) => {
  return createReadStream(path.join('media', filename));
};

// From S3
const mediaResolver = async (filename) => {
  const response = await s3.send(new GetObjectCommand({
    Bucket: 'bucket',
    Key: filename
  }));
  return response.Body;
};
```

### Streaming Output
```typescript
// To file
const output = createWriteStream('deck.apkg');

// To HTTP response (Express)
app.get('/export', async (req, res) => {
  res.setHeader('Content-Type', 'application/apkg');
  await createAnkiPackage({ model, deck, notes, mediaResolver, output: res });
});

// To S3
const passThrough = new PassThrough();
const upload = new Upload({ client: s3, params: { Body: passThrough } });
await Promise.all([
  createAnkiPackage({ ..., output: passThrough }),
  upload.done()
]);
```

## Code Conventions

- Use `.js` extensions in imports for ESM compatibility (e.g., `import { foo } from './utils.js'`)
- Database operations use parameterized queries (never string concatenation)
- All IDs are numbers (TypeScript `number` type, JavaScript safe integers)
- Media filenames extracted via regex from HTML/field content
- Field separator in database: `\x1f` (ASCII Unit Separator)

## Important Constraints

- **Node.js 22+** required for modern stream APIs
- **No disk I/O** - everything streams through memory
- **sql.js limitation**: Database built entirely in memory, then exported as Uint8Array
- **Media files**: Must be provided via MediaResolver, no automatic file discovery
- **Field count**: Note fields must exactly match model field count
