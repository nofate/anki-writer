# Quick Start Guide

## Installation

```bash
npm install anki-apkg-writer
```

## 5-Minute Tutorial

### Step 1: Import the package

```typescript
import { createAnkiPackage, generateDeckId, generateModelId } from 'anki-apkg-writer';
import { createWriteStream, createReadStream } from 'node:fs';
import path from 'node:path';
```

### Step 2: Define your card model

```typescript
const model = {
  id: generateModelId(),
  name: 'Basic (with audio)',
  fields: [
    { name: 'Front', ord: 0 },
    { name: 'Back', ord: 1 },
    { name: 'Audio', ord: 2 }
  ],
  tmpls: [
    {
      name: 'Card 1',
      ord: 0,
      qfmt: '<div>{{Front}}</div>{{Audio}}',
      afmt: '{{FrontSide}}<hr id=answer><div>{{Back}}</div>'
    }
  ],
  css: `
    .card {
      font-family: arial;
      font-size: 20px;
      text-align: center;
      color: black;
      background-color: white;
    }
  `
};
```

### Step 3: Create a deck

```typescript
const deck = {
  id: generateDeckId(),
  name: 'My First Deck'
};
```

### Step 4: Add notes

```typescript
const notes = [
  {
    fields: ['Hello', 'Привет', '[sound:hello.mp3]'],
    tags: ['greetings']
  },
  {
    fields: ['Goodbye', 'До свидания', '[sound:goodbye.mp3]'],
    tags: ['greetings']
  }
];
```

### Step 5: Create media resolver

```typescript
// Option 1: From filesystem
const mediaResolver = async (filename) => {
  return createReadStream(path.join('media', filename));
};

// Option 2: From S3 (if using AWS SDK)
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
const s3 = new S3Client({ region: 'us-east-1' });

const mediaResolver = async (filename) => {
  const response = await s3.send(new GetObjectCommand({
    Bucket: 'my-bucket',
    Key: `audio/${filename}`
  }));
  return response.Body;
};
```

### Step 6: Generate the package

```typescript
const output = createWriteStream('my-deck.apkg');

await createAnkiPackage({
  model,
  deck,
  notes,
  mediaResolver,
  output
});

console.log('Done! Import my-deck.apkg into Anki');
```

## Complete Example

```typescript
import { createAnkiPackage, generateDeckId, generateModelId } from 'anki-apkg-writer';
import { createWriteStream, createReadStream } from 'node:fs';
import path from 'node:path';

async function createMyDeck() {
  // Model
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
        afmt: '{{FrontSide}}<hr id=answer>{{Back}}'
      }
    ],
    css: '.card { font-family: arial; font-size: 20px; text-align: center; }'
  };

  // Deck
  const deck = {
    id: generateDeckId(),
    name: 'My Vocabulary'
  };

  // Notes
  const notes = [
    { fields: ['apple', 'яблоко'] },
    { fields: ['book', 'книга'] },
    { fields: ['cat', 'кошка'] }
  ];

  // Media resolver (no media in this example)
  const mediaResolver = async (filename) => {
    return createReadStream(path.join('media', filename));
  };

  // Output
  const output = createWriteStream('vocabulary.apkg');

  // Create
  await createAnkiPackage({
    model,
    deck,
    notes,
    mediaResolver,
    output
  });

  console.log('✓ Created vocabulary.apkg');
}

createMyDeck().catch(console.error);
```

## Common Use Cases

### Two-Way Cards (Front→Back and Back→Front)

```typescript
const model = {
  id: generateModelId(),
  name: 'Basic (and reversed)',
  fields: [
    { name: 'Front', ord: 0 },
    { name: 'Back', ord: 1 }
  ],
  tmpls: [
    {
      name: 'Front → Back',
      ord: 0,
      qfmt: '{{Front}}',
      afmt: '{{FrontSide}}<hr id=answer>{{Back}}'
    },
    {
      name: 'Back → Front',
      ord: 1,
      qfmt: '{{Back}}',
      afmt: '{{FrontSide}}<hr id=answer>{{Front}}'
    }
  ],
  css: '.card { font-family: arial; font-size: 20px; text-align: center; }'
};
```

### Cards with Images

```typescript
const notes = [
  {
    fields: [
      'Apple',
      '<img src="apple.jpg">'
    ]
  }
];

const mediaResolver = async (filename) => {
  // Return stream for apple.jpg
  return createReadStream(path.join('images', filename));
};
```

### Cards with Audio

```typescript
const notes = [
  {
    fields: [
      'Bonjour',
      'Hello',
      '[sound:bonjour.mp3]'
    ]
  }
];
```

### Stream to HTTP Response (Express)

```typescript
import express from 'express';

const app = express();

app.get('/export', async (req, res) => {
  res.setHeader('Content-Type', 'application/apkg');
  res.setHeader('Content-Disposition', 'attachment; filename="deck.apkg"');

  await createAnkiPackage({
    model,
    deck,
    notes,
    mediaResolver,
    output: res
  });
});
```

### Stream to AWS Lambda Response

```typescript
import { PassThrough } from 'node:stream';
import { Upload } from '@aws-sdk/lib-storage';
import { S3Client } from '@aws-sdk/client-s3';

export const handler = async (event) => {
  const passThrough = new PassThrough();
  const s3 = new S3Client({ region: 'us-east-1' });

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

  return { statusCode: 200, body: 'Deck created' };
};
```

## Troubleshooting

### Error: "Database not initialized"
Make sure you're using `await` when calling `createAnkiPackage()`.

### Error: "Model X not found"
Check that `model.id` matches the ID used when creating notes.

### Media files not working
- Verify media resolver returns a valid Readable stream
- Check that filenames in notes match exactly
- Use `extractMediaFilenames()` to debug

### Cards not showing in Anki
- Verify model has at least one template
- Check that note fields match model field count
- Ensure deck ID is valid (use `generateDeckId()`)

## Next Steps

- Read [README.md](./README.md) for full API documentation
- Check [example.ts](./example.ts) for more examples
- See [IMPLEMENTATION.md](./IMPLEMENTATION.md) for internals

## Need Help?

Open an issue on GitHub with:
- Code snippet
- Error message
- Node.js version
- Expected vs actual behavior
