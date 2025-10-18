# Anki .apkg Writer for TypeScript

A modern, streaming TypeScript implementation for generating Anki `.apkg` files without using disk space. Designed for Node.js 22+ with full streaming support for efficient memory usage.

## Features

- **100% Streaming**: No temporary files, everything processed in memory
- **Async Media Handling**: Fetch media from any source (S3, HTTP, filesystem) on-demand
- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Zero Dependencies on Python**: Pure TypeScript implementation based on Anki file format
- **Modern Node.js**: Built for Node.js 22+ with native ESM support
- **Memory Efficient**: Streams data directly to output without buffering entire package
- **Flexible Output**: Stream to file, HTTP response, S3, or any WritableStream

## Installation

```bash
npm install anki-apkg-writer
```

## Quick Start

```typescript
import { createAnkiPackage, generateDeckId, generateModelId } from 'anki-apkg-writer';
import { createWriteStream } from 'node:fs';

// Define model (card template)
const model = {
  id: generateModelId(),
  name: 'Basic',
  fields: [
    { name: 'Front', ord: 0 },
    { name: 'Back', ord: 1 }
  ],
  tmpls: [
    {
      name: 'Card 1',
      ord: 0,
      qfmt: '{{Front}}',
      afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}'
    }
  ],
  css: '.card { font-family: arial; font-size: 20px; }'
};

// Define deck
const deck = {
  id: generateDeckId(),
  name: 'My Deck'
};

// Define notes
const notes = [
  { fields: ['Hello', 'Привет'] },
  { fields: ['World', 'Мир'] }
];

// Media resolver (fetch from any source)
const mediaResolver = async (filename) => {
  // Return a Readable stream for the media file
  // Can be from S3, HTTP, filesystem, etc.
  return createReadStream(path.join('media', filename));
};

// Create package
await createAnkiPackage({
  model,
  deck,
  notes,
  mediaResolver,
  output: createWriteStream('deck.apkg')
});
```

## Advanced Usage

### Stream to HTTP Response (Express)

```typescript
import { createAnkiPackage } from 'anki-apkg-writer';

app.get('/export', async (req, res) => {
  res.setHeader('Content-Type', 'application/apkg');
  res.setHeader('Content-Disposition', 'attachment; filename="deck.apkg"');

  await createAnkiPackage({
    model,
    deck,
    notes,
    mediaResolver,
    output: res  // Stream directly to HTTP response
  });
});
```

### Stream to AWS S3

```typescript
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { PassThrough } from 'node:stream';

const s3 = new S3Client({ region: 'us-east-1' });
const passThrough = new PassThrough();

const upload = new Upload({
  client: s3,
  params: {
    Bucket: 'my-bucket',
    Key: 'deck.apkg',
    Body: passThrough
  }
});

await Promise.all([
  createAnkiPackage({
    model,
    deck,
    notes,
    mediaResolver,
    output: passThrough
  }),
  upload.done()
]);
```

### Fetch Media from S3

```typescript
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: 'us-east-1' });

const mediaResolver = async (filename) => {
  const command = new GetObjectCommand({
    Bucket: 'media-bucket',
    Key: `audio/${filename}`
  });

  const response = await s3.send(command);
  return response.Body as NodeJS.ReadableStream;
};
```

### Multiple Card Templates

```typescript
const model = {
  id: generateModelId(),
  name: 'German Word',
  fields: [
    { name: 'German', ord: 0 },
    { name: 'English', ord: 1 },
    { name: 'Audio', ord: 2 }
  ],
  tmpls: [
    {
      name: 'German -> English',
      ord: 0,
      qfmt: '{{German}} {{Audio}}',
      afmt: '{{German}}<hr id=answer>{{English}}'
    },
    {
      name: 'English -> German',
      ord: 1,
      qfmt: '{{English}}',
      afmt: '{{English}}<hr id=answer>{{German}} {{Audio}}'
    }
  ],
  css: '.card { font-family: arial; font-size: 20px; }'
};
```

### Media Files in Notes

```typescript
const notes = [
  {
    fields: [
      'Hund',
      'dog',
      '[sound:hund.mp3]'  // Audio file
    ]
  },
  {
    fields: [
      'Katze',
      'cat',
      '<img src="katze.jpg">'  // Image file
    ]
  }
];
```

## API Reference

### `createAnkiPackage(options)`

Creates an Anki package and streams it to the output.

**Options:**
- `model: AnkiModel` - Card model definition
- `deck: AnkiDeck` - Deck configuration
- `notes: AnkiNote[]` - Array of notes to add
- `mediaResolver: MediaResolver` - Function to resolve media files
- `output: NodeJS.WritableStream` - Output stream (file, HTTP response, etc.)

**Returns:** `Promise<void>`

### `generateDeckId()`

Generates a random deck ID (between 2^30 and 2^31).

**Returns:** `number`

### `generateModelId()`

Generates a random model ID.

**Returns:** `number`

### `generateGuid(...fields: any[])`

Generates a GUID for a note based on its fields.

**Returns:** `string`

### `extractMediaFilenames(html: string)`

Extracts media filenames from HTML content.

**Returns:** `string[]`

## Types

### `AnkiModel`

```typescript
interface AnkiModel {
  id: number;
  name: string;
  fields: AnkiField[];
  tmpls: AnkiTemplate[];
  css: string;
  type?: number;  // 0 = standard, 1 = cloze
  sortf?: number;  // Sort field index
}
```

### `AnkiField`

```typescript
interface AnkiField {
  name: string;
  ord: number;
  font?: string;
  size?: number;
  sticky?: boolean;
  rtl?: boolean;
}
```

### `AnkiTemplate`

```typescript
interface AnkiTemplate {
  name: string;
  ord: number;
  qfmt: string;  // Question format (HTML)
  afmt: string;  // Answer format (HTML)
}
```

### `AnkiDeck`

```typescript
interface AnkiDeck {
  id: number;
  name: string;
  desc?: string;
}
```

### `AnkiNote`

```typescript
interface AnkiNote {
  fields: string[];
  tags?: string[];
  guid?: string;
}
```

### `MediaResolver`

```typescript
type MediaResolver = (filename: string) => Promise<NodeJS.ReadableStream>;
```

## File Format

The `.apkg` file is a ZIP archive containing:

1. **collection.anki2** - SQLite database with:
   - `col` table: Collection metadata
   - `notes` table: Note data
   - `cards` table: Card data
   - `revlog` table: Review history
   - `graves` table: Deleted items

2. **media** - JSON mapping of media indices to filenames
   ```json
   {
     "0": "audio1.mp3",
     "1": "image1.jpg"
   }
   ```

3. **0, 1, 2, ...** - Media files with numeric names

## Architecture

- **database.ts**: SQLite database creation using sql.js (in-memory)
- **zip-writer.ts**: Streaming ZIP creation using archiver
- **utils.ts**: ID generation, GUID creation, media extraction
- **types.ts**: TypeScript type definitions
- **index.ts**: Main package writer class

## Performance

- Memory usage scales with concurrent media file processing
- Database built entirely in memory (no disk I/O)
- ZIP streaming prevents buffering entire package
- Suitable for serverless environments (AWS Lambda, etc.)

## Comparison with genanki

| Feature | genanki (Python) | anki-apkg-writer |
|---------|------------------|------------------|
| Language | Python | TypeScript |
| Disk Usage | Temporary files | Zero |
| Streaming | No | Yes |
| Memory | High | Low |
| Dependencies | Many | Few |
| Node.js Native | No | Yes |

## Requirements

- Node.js 22 or higher
- TypeScript 5.6+ (for development)

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or PR.

## Credits

Based on the Anki file format and inspired by the [genanki](https://github.com/kerrickstaley/genanki) Python package.
