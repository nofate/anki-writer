# Anki .apkg Writer - Implementation Details

## Overview

This is a modern TypeScript implementation for generating Anki `.apkg` files with full streaming support, designed for Node.js 22+. Unlike traditional implementations (including Python's genanki), this version processes everything in memory without using disk space.

## Key Design Decisions

### 1. Streaming Architecture

**Why streaming?**
- Zero disk I/O (crucial for serverless/Lambda environments)
- Low memory footprint (media files streamed directly to ZIP)
- Can handle large decks without buffering entire package
- Direct streaming to any destination (file, HTTP, S3)

**How it works:**
1. SQLite database created in memory using sql.js
2. Media files fetched on-demand via `MediaResolver`
3. ZIP created with archiver, streaming directly to output
4. Database added at the end after all media files

### 2. In-Memory SQLite

**sql.js vs better-sqlite3:**
- `sql.js`: Compiled to WebAssembly, runs entirely in memory
- No native bindings, works in any environment
- Perfect for streaming use case (export as Uint8Array)

**Schema:**
- Complete Anki 2.1.x schema implemented
- All required tables: col, notes, cards, revlog, graves
- Proper indexes for Anki compatibility

### 3. Async Media Resolution

**MediaResolver Pattern:**
```typescript
type MediaResolver = (filename: string) => Promise<NodeJS.ReadableStream>;
```

**Benefits:**
- Fetch from any source (S3, HTTP, filesystem)
- Lazy loading (only fetch when needed)
- Parallel processing (multiple streams at once)
- No temporary storage

### 4. ID Generation

**Timestamp-based IDs:**
- Start with `Date.now()` for first ID
- Increment for subsequent IDs
- Ensures uniqueness and proper ordering
- Compatible with Anki's expectations

**GUID Generation:**
- SHA-256 hash of fields (first 8 bytes)
- Base91 encoding with Anki's alphabet
- Ensures note deduplication in Anki

## File Structure

```
anki-writer/
├── types.ts          # TypeScript type definitions
├── utils.ts          # Utility functions (ID gen, GUID, etc.)
├── database.ts       # SQLite database creation
├── zip-writer.ts     # Streaming ZIP writer
├── index.ts          # Main package writer class
├── example.ts        # Usage examples
├── package.json      # Dependencies
├── tsconfig.json     # TypeScript config
└── README.md         # Documentation
```

## Dependencies

### Production
- **sql.js** (^1.11.0): In-memory SQLite database
- **archiver** (^7.0.1): Streaming ZIP creation

### Development
- **typescript** (^5.6.0): TypeScript compiler
- **tsx** (^4.0.0): TypeScript execution for examples
- **@types/** packages for type definitions

## Data Flow

```
Input (model, deck, notes, mediaResolver)
  ↓
[1] Initialize sql.js database
  ↓
[2] Create schema (col, notes, cards, revlog, graves)
  ↓
[3] Add model and deck to collection
  ↓
[4] Scan notes for media filenames
  ↓
[5] Insert notes into database
  ↓
[6] Generate cards for each note/template
  ↓
[7] Export database as Uint8Array
  ↓
[8] Stream media files to ZIP (async)
  │   ├─ Call mediaResolver(filename)
  │   ├─ Write to ZIP as "0", "1", "2", ...
  │   └─ Process multiple files in parallel
  ↓
[9] Add database to ZIP as "collection.anki2"
  ↓
[10] Add media manifest as "media"
  ↓
[11] Finalize ZIP
  ↓
Output (.apkg file streamed to destination)
```

## Anki File Format Details

### .apkg Structure (ZIP Archive)

```
deck.apkg
├── collection.anki2     # SQLite database
├── media                # JSON: {"0": "file1.mp3", "1": "file2.jpg"}
├── 0                    # Media file (renamed to index)
├── 1                    # Media file
└── 2                    # Media file
```

### collection.anki2 Schema

**col table** (1 row):
```sql
id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags
```
- `conf`: JSON configuration
- `models`: JSON object of models (key = model ID)
- `decks`: JSON object of decks (key = deck ID)
- `dconf`: JSON deck configurations

**notes table**:
```sql
id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data
```
- `flds`: Fields joined with `\x1f` separator
- `sfld`: Sort field (used for sorting/searching)
- `guid`: Base91-encoded hash for deduplication

**cards table**:
```sql
id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data
```
- `ord`: Template ordinal (which card template)
- `type`: 0=new, 1=learning, 2=review
- `queue`: -1=suspended, 0=new, 1=learning, 2=review

### Model Structure

```typescript
{
  id: number,              // Unique model ID
  name: string,            // Display name
  flds: [                  // Fields
    { name: string, ord: number, font: string, size: number }
  ],
  tmpls: [                 // Card templates
    { name: string, ord: number, qfmt: string, afmt: string }
  ],
  css: string,             // Styling
  req: [[ord, "any", [field_ords]]]  // Card generation rules
}
```

## Performance Characteristics

### Memory Usage
- SQLite database: ~1-5 MB for typical decks
- Media streaming: ~10-50 MB buffer (archiver internal)
- Total: O(notes) for database + O(1) for streaming

### Time Complexity
- Database creation: O(n) where n = number of notes
- Media processing: O(m) where m = number of media files
- ZIP creation: O(n + m)
- Overall: O(n + m)

### Scalability
- ✅ Suitable for serverless (AWS Lambda)
- ✅ Can handle large decks (10k+ notes)
- ✅ Parallel media fetching
- ✅ Streaming prevents memory bloat

## Usage Patterns

### 1. File Output
```typescript
const output = createWriteStream('deck.apkg');
await createAnkiPackage({ model, deck, notes, mediaResolver, output });
```

### 2. HTTP Response
```typescript
res.setHeader('Content-Type', 'application/apkg');
await createAnkiPackage({ ..., output: res });
```

### 3. S3 Upload
```typescript
const passThrough = new PassThrough();
const upload = new Upload({ ..., Body: passThrough });
await Promise.all([
  createAnkiPackage({ ..., output: passThrough }),
  upload.done()
]);
```

### 4. In-Memory Buffer
```typescript
const chunks: Buffer[] = [];
const output = new Writable({
  write(chunk, encoding, callback) {
    chunks.push(chunk);
    callback();
  }
});
await createAnkiPackage({ ..., output });
const buffer = Buffer.concat(chunks);
```

## Compatibility

### Anki Versions
- ✅ Anki 2.1.x (current)
- ✅ AnkiDroid
- ✅ AnkiMobile
- ✅ AnkiWeb

### Node.js
- Requires Node.js 22+ (for native ESM, modern APIs)
- Uses native `node:stream`, `node:crypto`

### TypeScript
- Written in TypeScript 5.6+
- Full type safety
- Declaration files included

## Future Enhancements

### Possible Additions
1. **Progress callbacks**: Report progress during generation
2. **Validation**: Validate model/deck structure before writing
3. **Cloze support**: Enhanced support for cloze deletion cards
4. **Media deduplication**: Detect duplicate media files
5. **Deck merging**: Merge multiple decks into one package
6. **Import support**: Read and parse .apkg files

### Performance Optimizations
1. **Worker threads**: Parallel SQLite operations
2. **Streaming JSON**: Stream large model/deck definitions
3. **Compression tuning**: Adjust ZIP compression levels
4. **Media caching**: Cache frequently used media files

## Testing Recommendations

### Unit Tests
- ID generation uniqueness
- GUID generation consistency
- Media filename extraction
- SQL injection prevention

### Integration Tests
- Complete package creation
- Media resolution with mocks
- Database schema validation
- ZIP structure verification

### End-to-End Tests
- Import generated .apkg into Anki
- Verify cards display correctly
- Test media playback
- Check scheduling works

## Security Considerations

### SQL Injection
- All values parameterized (no string concatenation)
- sql.js uses prepared statements

### Path Traversal
- Media filenames should be validated
- Recommend using basename only
- No directory traversal allowed

### Memory Exhaustion
- Media resolver should implement timeouts
- Consider rate limiting for concurrent fetches
- Set memory limits in production

## References

- [Anki File Format Documentation](https://github.com/ankidroid/Anki-Android/wiki/Database-Structure)
- [genanki Python Library](https://github.com/kerrickstaley/genanki)
- [sql.js Documentation](https://sql.js.org/)
- [archiver Documentation](https://www.archiverjs.com/)

## License

MIT License - See LICENSE file for details
