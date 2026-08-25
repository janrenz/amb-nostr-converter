import { ambToNostr } from '../../src/converters/ambToNostr';

const PUBKEY = 'a'.repeat(64);

const base = {
  '@context': ['https://w3id.org/kim/amb/context.jsonld'],
  id: 'urn:example:1',
  type: ['LearningResource'],
  name: 'Teichschichtung',
};

const rTags = (resource: any): string[] => {
  const result = ambToNostr(resource, { pubkey: PUBKEY });
  if (!result.success || !result.data) throw new Error(result.error?.message ?? 'conversion failed');
  return result.data.tags.filter((tag) => tag[0] === 'r').map((tag) => tag[1] as string);
};

describe('Nostr-native r tags for external URLs', () => {
  it('emits the encoding contentUrl', () => {
    expect(
      rTags({
        ...base,
        encoding: [{ type: 'MediaObject', contentUrl: 'https://cdn.example.org/a.mp4' }],
      })
    ).toEqual(['https://cdn.example.org/a.mp4']);
  });

  it('emits embedUrl alongside contentUrl', () => {
    expect(
      rTags({
        ...base,
        encoding: [
          {
            type: 'MediaObject',
            contentUrl: 'https://cdn.example.org/a.mp4',
            embedUrl: 'https://player.example.org/a',
          },
        ],
      })
    ).toEqual(['https://cdn.example.org/a.mp4', 'https://player.example.org/a']);
  });

  it('covers every encoding in the array', () => {
    expect(
      rTags({
        ...base,
        encoding: [
          { type: 'MediaObject', contentUrl: 'https://cdn.example.org/a.mp4' },
          { type: 'MediaObject', contentUrl: 'https://cdn.example.org/a.webm' },
        ],
      })
    ).toEqual(['https://cdn.example.org/a.mp4', 'https://cdn.example.org/a.webm']);
  });

  it('emits the image and the trailer', () => {
    expect(
      rTags({
        ...base,
        image: 'https://img.example.org/thumb.jpg',
        trailer: { type: 'VideoObject', contentUrl: 'https://cdn.example.org/trailer.mp4' },
      })
    ).toEqual(['https://cdn.example.org/trailer.mp4', 'https://img.example.org/thumb.jpg']);
  });

  it('still emits mainEntityOfPage, as before', () => {
    expect(
      rTags({
        ...base,
        mainEntityOfPage: [{ id: 'https://oersi.org/resources/xyz', type: 'WebContent' }],
      })
    ).toEqual(['https://oersi.org/resources/xyz']);
  });

  it('deduplicates a URL that appears in several roles', () => {
    // A record whose landing page and media URL coincide must not yield the
    // same r tag twice.
    expect(
      rTags({
        ...base,
        mainEntityOfPage: [{ id: 'https://example.org/x', type: 'WebContent' }],
        encoding: [{ type: 'MediaObject', contentUrl: 'https://example.org/x' }],
      })
    ).toEqual(['https://example.org/x']);
  });

  it('skips values that are not absolute references', () => {
    // A bare slug cannot be resolved by a client, so it does not belong in r.
    expect(
      rTags({
        ...base,
        image: '/local/thumb.jpg',
        encoding: [{ type: 'MediaObject', contentUrl: 'relative/path.mp4' }],
      })
    ).toEqual([]);
  });

  it('accepts non-http schemes such as DOI URNs', () => {
    expect(
      rTags({ ...base, encoding: [{ type: 'MediaObject', contentUrl: 'urn:isbn:978-3-16-148410-0' }] })
    ).toEqual(['urn:isbn:978-3-16-148410-0']);
  });

  it('emits nothing when the resource carries no external URL', () => {
    expect(rTags(base)).toEqual([]);
  });

  it('keeps the flattened encoding tags as well', () => {
    const result = ambToNostr(
      { ...base, encoding: [{ type: 'MediaObject', contentUrl: 'https://cdn.example.org/a.mp4' }] },
      { pubkey: PUBKEY }
    );
    const keys = result.data!.tags.map((tag) => tag[0]);
    // r is additive: the AMB-core tag must survive for round-tripping.
    expect(keys).toContain('encoding:contentUrl');
    expect(keys).toContain('r');
  });
});
