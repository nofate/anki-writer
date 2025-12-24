import { describe, expect, it } from 'vitest';

import { buildMediaManifest, collectMediaFilenames } from '../src/zip-writer.js';
import {
  IdGenerator,
  extractMediaFilenames,
  generateGuid,
  generateRequirements
} from '../src/utils.js';

describe('utils', () => {
  it('extracts media filenames from sound and image tags', () => {
    const html = `
      <div>
        [sound:audio.mp3]
        <img src="picture.png" />
        <img src='nested/photo.jpg'>
      </div>
    `;

    expect(extractMediaFilenames(html)).toEqual(['audio.mp3', 'picture.png', 'nested/photo.jpg']);
  });

  it('builds media manifest with numeric keys', () => {
    const manifest = buildMediaManifest(['first.png', 'second.mp3']);

    expect(manifest).toEqual({
      '0': 'first.png',
      '1': 'second.mp3'
    });
  });

  it('collects media filenames across fields', () => {
    const fields = ['[sound:one.mp3]', '<img src="two.png"> extra [sound:three.wav]'];
    const filenames = collectMediaFilenames(fields, extractMediaFilenames);

    expect(filenames).toEqual(new Set(['one.mp3', 'two.png', 'three.wav']));
  });

  it('generates deterministic GUIDs for note fields', () => {
    expect(generateGuid('field1', 'field2')).toBe('BE.]Z,b=Wx');
    expect(generateGuid('hello')).toBe('hZ%+.BW-%^');
  });

  it('increments IdGenerator sequentially', () => {
    const generator = new IdGenerator(1000);

    expect(generator.peek()).toBe(1000);
    expect(generator.next()).toBe(1000);
    expect(generator.peek()).toBe(1001);
    expect(generator.next()).toBe(1001);
  });

  it('creates requirements for each template', () => {
    const templates = [{}, {}, {}];
    const result = generateRequirements(templates, []);

    expect(result).toEqual([
      [0, 'any', [0]],
      [1, 'any', [0]],
      [2, 'any', [0]]
    ]);
  });
});
