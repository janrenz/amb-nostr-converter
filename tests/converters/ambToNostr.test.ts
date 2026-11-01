/**
 * Tests for AMB to Nostr converter
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { nip19 } from 'nostr-tools';
import { ambToNostr } from '../../src/converters/ambToNostr';
import { nostrToAmb } from '../../src/converters/nostrToAmb';
import {
  AmbLearningResource,
  NostrEducationalKind,
  ConversionOptions,
} from '../../src/types';

// Test data directory
const TEST_DATA_DIR = join(__dirname, '../data/amb');

// Load test fixtures
let courseSample: AmbLearningResource;
let presentationSample: AmbLearningResource;
let imageSample: AmbLearningResource;
let worksheetSample: AmbLearningResource;

beforeAll(() => {
  courseSample = JSON.parse(
    readFileSync(join(TEST_DATA_DIR, 'example_1_course.json'), 'utf-8')
  );
  presentationSample = JSON.parse(
    readFileSync(join(TEST_DATA_DIR, 'example_2_presentation.json'), 'utf-8')
  );
  imageSample = JSON.parse(
    readFileSync(join(TEST_DATA_DIR, 'example_3_image.json'), 'utf-8')
  );
  worksheetSample = JSON.parse(
    readFileSync(join(TEST_DATA_DIR, 'example_4_worksheet.json'), 'utf-8')
  );
});

describe('ambToNostr', () => {
  const testPubkey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const options: ConversionOptions = {
    pubkey: testPubkey,
    timestamp: 1700000000,
  };

  describe('Course Conversion', () => {
    test('should convert course to Nostr event', () => {
      const result = ambToNostr(courseSample, options);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const event = result.data!;
      expect(event.pubkey).toBe(testPubkey);
      expect(event.kind).toBe(NostrEducationalKind.AMB);
      expect(event.created_at).toBe(1700000000);
      expect(event.tags).toBeInstanceOf(Array);
      expect(event.content).toBeDefined();
    });

    test('should include correct tags for course', () => {
      const result = ambToNostr(courseSample, options);
      const event = result.data!;

      // Check for required tags
      const dTag = event.tags.find(t => t[0] === 'd');
      expect(dTag).toBeDefined();
      expect(dTag![1]).toBe('https://oer.gitlab.io/OS'); // d tag now uses AMB ID directly

      const nameTag = event.tags.find(t => t[0] === 'name');
      expect(nameTag).toBeDefined();
      expect(nameTag![1]).toBe('Computer Structures and Operating Systems');

      const typeTags = event.tags.filter(t => t[0] === 'type');
      expect(typeTags.length).toBeGreaterThan(0);
      expect(typeTags.map(t => t[1])).toContain('Course');
    });

    test('should include creator tags', () => {
      const result = ambToNostr(courseSample, options);
      const event = result.data!;

      const creatorNameTags = event.tags.filter(t => t[0] === 'creator:name');
      expect(creatorNameTags.length).toBeGreaterThan(0);
      expect(creatorNameTags[0][1]).toBe('Jens Lechtenbörger');

      const creatorIdTags = event.tags.filter(t => t[0] === 'creator:id');
      expect(creatorIdTags.length).toBeGreaterThan(0);
      expect(creatorIdTags[0][1]).toBe('https://orcid.org/0000-0002-3064-147X');
    });

    test('should include keywords as hashtags', () => {
      const result = ambToNostr(courseSample, options);
      const event = result.data!;

      const hashtagTags = event.tags.filter(t => t[0] === 't');
      expect(hashtagTags.length).toBe(3);
      expect(hashtagTags.map(t => t[1])).toContain('Computer Science');
      expect(hashtagTags.map(t => t[1])).toContain('Operation Systems');
      expect(hashtagTags.map(t => t[1])).toContain('Computer Structures');
    });

    test('should include license information', () => {
      const result = ambToNostr(courseSample, options);
      const event = result.data!;

      const licenseTag = event.tags.find(t => t[0] === 'license:id');
      expect(licenseTag).toBeDefined();
      expect(licenseTag![1]).toBe('https://creativecommons.org/licenses/by-sa/4.0/');
    });

    test('should emit one license:id tag per entry when license is a non-standard Concept array', () => {
      // e.g. LEHRE LADEN emits CC BY-SA as two DINI AG KIM license-type concepts
      // (attribution + shareAlike) instead of a single License object.
      const resourceWithArrayLicense: AmbLearningResource = {
        ...courseSample,
        license: [
          { id: 'https://w3id.org/kim/license/attribution', type: 'Concept' },
          { id: 'https://w3id.org/kim/license/shareAlike', type: 'Concept' },
        ] as any,
      };

      const result = ambToNostr(resourceWithArrayLicense, options);
      expect(result.success).toBe(true);
      const event = result.data!;

      const licenseTags = event.tags.filter(t => t[0] === 'license:id');
      expect(licenseTags.length).toBe(2);
      expect(licenseTags.map(t => t[1])).toEqual([
        'https://w3id.org/kim/license/attribution',
        'https://w3id.org/kim/license/shareAlike',
      ]);
      expect(result.warnings?.some(w => w.includes('license is an array of Concepts'))).toBe(true);
    });

    test('should round-trip a multi-concept license array through nostrToAmb as an array', () => {
      const resourceWithArrayLicense: AmbLearningResource = {
        ...courseSample,
        license: [
          { id: 'https://w3id.org/kim/license/attribution', type: 'Concept' },
          { id: 'https://w3id.org/kim/license/shareAlike', type: 'Concept' },
        ] as any,
      };

      const forward = ambToNostr(resourceWithArrayLicense, options);
      const event = forward.data!;

      const back = nostrToAmb(event);
      expect(back.success).toBe(true);
      const amb = back.data!;

      expect(Array.isArray(amb.license)).toBe(true);
      expect((amb.license as any[]).map(l => l.id)).toEqual([
        'https://w3id.org/kim/license/attribution',
        'https://w3id.org/kim/license/shareAlike',
      ]);
    });

    test('single-object license is unchanged and does not round-trip as an array', () => {
      const result = ambToNostr(courseSample, options);
      const event = result.data!;

      const licenseTags = event.tags.filter(t => t[0] === 'license:id');
      expect(licenseTags.length).toBe(1);

      const back = nostrToAmb(event);
      expect(back.success).toBe(true);
      const amb = back.data!;
      expect(Array.isArray(amb.license)).toBe(false);
      expect(amb.license?.id).toBe('https://creativecommons.org/licenses/by-sa/4.0/');
    });

    test('nested hasPart license: object and single-entry array emit byte-identical tags', () => {
      // oersi pipeline hashes converter output, so a single-entry array must
      // not change the tags compared to the plain-object license shape.
      function baseWithHasPartLicense(license: any): AmbLearningResource {
        return {
          '@context': ['https://w3id.org/kim/amb/context.jsonld'],
          id: 'https://example.org/r1',
          type: ['LearningResource'],
          name: 'Test',
          hasPart: [
            {
              id: 'https://example.org/part1',
              license,
            },
          ],
        } as any;
      }

      const objectResult = ambToNostr(
        baseWithHasPartLicense({ id: 'https://w3id.org/kim/license/attribution' }),
        options
      );
      const arrayResult = ambToNostr(
        baseWithHasPartLicense([{ id: 'https://w3id.org/kim/license/attribution' }] as any),
        options
      );

      expect(objectResult.success).toBe(true);
      expect(arrayResult.success).toBe(true);

      const objectTags = objectResult.data!.tags.filter(t => t[0] !== 'created_at');
      const arrayTags = arrayResult.data!.tags.filter(t => t[0] !== 'created_at');
      expect(arrayTags).toEqual(objectTags);

      const hasPartLicenseTags = objectTags.filter(t => t[0] === 'hasPart:license:id');
      expect(hasPartLicenseTags).toEqual([['hasPart:license:id', 'https://w3id.org/kim/license/attribution']]);
    });

    test('nested license array on a hasPart ref emits one hasPart:license:id tag per entry and warns, without touching other refs', () => {
      const resource: AmbLearningResource = {
        '@context': ['https://w3id.org/kim/amb/context.jsonld'],
        id: 'https://example.org/r1',
        type: ['LearningResource'],
        name: 'Test',
        hasPart: [
          {
            id: 'https://example.org/part1',
            license: [
              { id: 'https://w3id.org/kim/license/attribution' },
              { id: 'https://w3id.org/kim/license/shareAlike' },
            ] as any,
          },
        ],
      } as any;

      const result = ambToNostr(resource, options);
      expect(result.success).toBe(true);
      const event = result.data!;

      const idTags = event.tags.filter(t => t[0] === 'hasPart:id');
      expect(idTags).toEqual([['hasPart:id', 'https://example.org/part1']]);

      const licenseTags = event.tags.filter(t => t[0] === 'hasPart:license:id');
      expect(licenseTags.map(t => t[1])).toEqual([
        'https://w3id.org/kim/license/attribution',
        'https://w3id.org/kim/license/shareAlike',
      ]);
      expect(result.warnings?.some(w => w.includes('hasPart.license is an array of Concepts'))).toBe(true);
    });

    test('nested round trip: two hasPart refs, each with a 2-entry license array, stay on their own ref', () => {
      const resource: AmbLearningResource = {
        '@context': ['https://w3id.org/kim/amb/context.jsonld'],
        id: 'https://example.org/r1',
        type: ['LearningResource'],
        name: 'Test',
        hasPart: [
          {
            id: 'https://example.org/part1',
            license: [
              { id: 'https://w3id.org/kim/license/attribution' },
              { id: 'https://w3id.org/kim/license/shareAlike' },
            ] as any,
          },
          {
            id: 'https://example.org/part2',
            license: [
              { id: 'https://w3id.org/kim/license/commercial' },
              { id: 'https://w3id.org/kim/license/noRestrictions' },
            ] as any,
          },
        ],
      } as any;

      const forward = ambToNostr(resource, options);
      expect(forward.success).toBe(true);
      const event = forward.data!;

      const back = nostrToAmb(event);
      expect(back.success).toBe(true);
      const amb = back.data!;

      expect(Array.isArray(amb.hasPart)).toBe(true);
      expect(amb.hasPart).toHaveLength(2);

      const [part1, part2] = amb.hasPart as any[];
      expect(part1.id).toBe('https://example.org/part1');
      expect(Array.isArray(part1.license)).toBe(true);
      expect(part1.license.map((l: any) => l.id)).toEqual([
        'https://w3id.org/kim/license/attribution',
        'https://w3id.org/kim/license/shareAlike',
      ]);

      expect(part2.id).toBe('https://example.org/part2');
      expect(Array.isArray(part2.license)).toBe(true);
      expect(part2.license.map((l: any) => l.id)).toEqual([
        'https://w3id.org/kim/license/commercial',
        'https://w3id.org/kim/license/noRestrictions',
      ]);
    });

    test('should include educational metadata with language tags', () => {
      const result = ambToNostr(courseSample, options);
      const event = result.data!;

      // about:prefLabel:de -> Informatik
      const subjectTags = event.tags.filter(t => t[0] === 'about:prefLabel:de');
      expect(subjectTags.length).toBeGreaterThan(0);
      expect(subjectTags[0][1]).toBe('Informatik');

      // educationalLevel has both de and en
      const levelTagsDe = event.tags.filter(t => t[0] === 'educationalLevel:prefLabel:de');
      expect(levelTagsDe.length).toBeGreaterThan(0);
      expect(levelTagsDe[0][1]).toBe('Bachelor oder äquivalent');
      
      const levelTagsEn = event.tags.filter(t => t[0] === 'educationalLevel:prefLabel:en');
      expect(levelTagsEn.length).toBeGreaterThan(0);
      expect(levelTagsEn[0][1]).toBe('Bachelor or equivalent');

      // audience:prefLabel:en -> student
      const audienceTags = event.tags.filter(t => t[0] === 'audience:prefLabel:en');
      expect(audienceTags.length).toBeGreaterThan(0);
      expect(audienceTags[0][1]).toBe('student');
    });

    test('should handle multi-language prefLabels correctly', () => {
      const multiLangResource = {
        ...courseSample,
        about: [
          {
            id: 'http://example.org/concept',
            type: 'Concept' as const,
            prefLabel: {
              en: 'Computer Science',
              de: 'Informatik',
              fr: 'Informatique'
            }
          }
        ]
      };

      const result = ambToNostr(multiLangResource, options);
      expect(result.success).toBe(true);
      const event = result.data!;

      const enTag = event.tags.find(t => t[0] === 'about:prefLabel:en');
      expect(enTag).toBeDefined();
      expect(enTag![1]).toBe('Computer Science');

      const deTag = event.tags.find(t => t[0] === 'about:prefLabel:de');
      expect(deTag).toBeDefined();
      expect(deTag![1]).toBe('Informatik');

      const frTag = event.tags.find(t => t[0] === 'about:prefLabel:fr');
      expect(frTag).toBeDefined();
      expect(frTag![1]).toBe('Informatique');
    });

    test('should include hierarchical relationships', () => {
      const result = ambToNostr(courseSample, options);
      const event = result.data!;

      const hasPartTags = event.tags.filter(t => t[0] === 'hasPart:id');
      expect(hasPartTags.length).toBe(5); // Course has 5 parts
      expect(hasPartTags[0][1]).toBe('https://oer.gitlab.io/OS/Operating-Systems-JiTT.html');
    });

    test('should include language tags', () => {
      const result = ambToNostr(courseSample, options);
      const event = result.data!;

      const languageTags = event.tags.filter(t => t[0] === 'inLanguage');
      expect(languageTags.length).toBe(1);
      expect(languageTags[0][1]).toBe('en');
    });

    test('should have description in content field per AMB spec', () => {
      const result = ambToNostr(courseSample, options);
      const event = result.data!;

      // Per AMB spec, content SHOULD contain description for client compatibility
      // The description tag is kept for relay queryability
      expect(event.content).toBe(courseSample.description);
    });
  });

  describe('Presentation Conversion', () => {
    test('should convert presentation to Nostr event', () => {
      const result = ambToNostr(presentationSample, options);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const event = result.data!;
      expect(event.kind).toBe(NostrEducationalKind.AMB);
    });

    test('should include image tag', () => {
      const result = ambToNostr(presentationSample, options);
      const event = result.data!;

      const imageTag = event.tags.find(t => t[0] === 'image');
      expect(imageTag).toBeDefined();
      expect(imageTag![1]).toBe('https://dini-ag-kim.github.io/amb/20231019/img/os08-image.png');
    });

    test('should include date tags', () => {
      const result = ambToNostr(presentationSample, options);
      const event = result.data!;

      const dateCreatedTag = event.tags.find(t => t[0] === 'dateCreated');
      expect(dateCreatedTag).toBeDefined();
      expect(dateCreatedTag![1]).toBe('2020-06-25');

      const publishedAtTag = event.tags.find(t => t[0] === 'datePublished');
      expect(publishedAtTag).toBeDefined();
    });

    test('should include parent and child relationships', () => {
      const result = ambToNostr(presentationSample, options);
      const event = result.data!;

      const partOfTags = event.tags.filter(t => t[0] === 'isPartOf:id');
      expect(partOfTags.length).toBe(1);
      expect(partOfTags[0][1]).toBe('https://oer.gitlab.io/OS');

      const hasPartTags = event.tags.filter(t => t[0] === 'hasPart:id');
      expect(hasPartTags.length).toBe(1);
    });
  });

  describe('Image Conversion', () => {
    test('should convert image to Nostr event', () => {
      const result = ambToNostr(imageSample, options);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const event = result.data!;
      expect(event.kind).toBe(NostrEducationalKind.AMB);
    });

    test('should include isBasedOn attribution', () => {
      const result = ambToNostr(imageSample, options);
      const event = result.data!;

      const basedOnTags = event.tags.filter(t => t[0] === 'isBasedOn:id');
      expect(basedOnTags.length).toBe(1);
      
      // All metadata is now in tags, not content
      expect(event.content).toBe('');
    });
  });

  describe('Worksheet Conversion', () => {
    test('should convert worksheet to Nostr event', () => {
      const result = ambToNostr(worksheetSample, options);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const event = result.data!;
      expect(event.kind).toBe(NostrEducationalKind.AMB);
    });

    test('should include publisher information', () => {
      const result = ambToNostr(worksheetSample, options);
      const event = result.data!;

      const publisherTags = event.tags.filter(t => t[0] === 'publisher:name');
      expect(publisherTags.length).toBe(1);
      expect(publisherTags[0][1]).toBe('Tutory');
    });
  });

  describe('Error Handling', () => {
    test('should fail for resource without id', () => {
      const invalidResource = { ...courseSample };
      delete (invalidResource as any).id;

      const result = ambToNostr(invalidResource as any, options);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('id');
    });

    test('should fail for resource without name', () => {
      const invalidResource = { ...courseSample };
      delete (invalidResource as any).name;

      const result = ambToNostr(invalidResource as any, options);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('name');
    });
  });

  describe('Options', () => {
    test('should use default pubkey when not provided', () => {
      const result = ambToNostr(courseSample, { timestamp: 1700000000 });

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain('default pubkey');
    });

    test('should have description in content regardless of options', () => {
      const result = ambToNostr(courseSample, options);

      expect(result.success).toBe(true);
      // Content SHOULD contain description per AMB spec
      expect(result.data!.content).toBe(courseSample.description);
    });

    test('should exclude relationships when option is set', () => {
      const result = ambToNostr(courseSample, {
        ...options,
        includeRelationships: false,
      });

      expect(result.success).toBe(true);
      const event = result.data!;

      const hasPartTags = event.tags.filter(t => t[0] === 'hasPart:id');
      expect(hasPartTags.length).toBe(0);
    });
  });

  describe('Deterministic IDs', () => {
    test('should generate consistent d tags for same resource', () => {
      const result1 = ambToNostr(courseSample, options);
      const result2 = ambToNostr(courseSample, options);

      const dTag1 = result1.data!.tags.find(t => t[0] === 'd');
      const dTag2 = result2.data!.tags.find(t => t[0] === 'd');

      expect(dTag1![1]).toBe(dTag2![1]);
    });

    test('should generate different d tags for different resources', () => {
      const result1 = ambToNostr(courseSample, options);
      const result2 = ambToNostr(presentationSample, options);

      const dTag1 = result1.data!.tags.find(t => t[0] === 'd');
      const dTag2 = result2.data!.tags.find(t => t[0] === 'd');

      expect(dTag1![1]).not.toBe(dTag2![1]);
    });
  });
});

describe('ext namespace emission', () => {
  test('emits concept ext tags in id, prefLabel, type order', () => {
    const resource: any = {
      '@context': ['https://w3id.org/kim/amb/context.jsonld'],
      id: 'https://example.org/r1',
      type: ['LearningResource'],
      name: 'Test',
      ext: {
        ekw: {
          gradeLevel: [
            { id: 'https://example.org/grade/5', type: 'Concept', prefLabel: { de: 'Klasse 5' } },
          ],
        },
      },
    };
    const result = ambToNostr(resource, { pubkey: 'a'.repeat(64) });
    expect(result.success).toBe(true);
    const tags = result.data!.tags;
    const ekw = tags.filter((t) => t[0].startsWith('ext:ekw:gradeLevel'));
    expect(ekw).toEqual([
      ['ext:ekw:gradeLevel:id', 'https://example.org/grade/5'],
      ['ext:ekw:gradeLevel:prefLabel:de', 'Klasse 5'],
      ['ext:ekw:gradeLevel:type', 'Concept'],
    ]);
  });

  test('emits bare tags for scalar ext facets', () => {
    const resource: any = {
      '@context': ['https://w3id.org/kim/amb/context.jsonld'],
      id: 'https://example.org/r1',
      type: ['LearningResource'],
      name: 'Test',
      ext: { ekw: { bibleReference: ['Joh 3,16', 'Ps 23'] } },
    };
    const result = ambToNostr(resource, { pubkey: 'a'.repeat(64) });
    const refs = result.data!.tags.filter((t) => t[0] === 'ext:ekw:bibleReference');
    expect(refs).toEqual([
      ['ext:ekw:bibleReference', 'Joh 3,16'],
      ['ext:ekw:bibleReference', 'Ps 23'],
    ]);
  });

  // This serializer is the only write-side enforcement point for the ext
  // grammar. A colon in a facet key produces ext:ekw:konfi:zielgruppen:id,
  // which conformant consumers must ignore — so it has to fail here rather
  // than ship a tag that silently vanishes downstream.
  test('rejects a colon-bearing facet key', () => {
    const resource: any = {
      '@context': ['https://w3id.org/kim/amb/context.jsonld'],
      id: 'https://example.org/r1',
      type: ['LearningResource'],
      name: 'Test',
      ext: { ekw: { 'konfi:zielgruppen': [{ id: 'https://example.org/zg/1', type: 'Concept' }] } },
    };
    const result = ambToNostr(resource, { pubkey: 'a'.repeat(64) });
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/must not contain ':'/);
  });

  test('rejects a colon-bearing namespace', () => {
    const resource: any = {
      '@context': ['https://w3id.org/kim/amb/context.jsonld'],
      id: 'https://example.org/r1',
      type: ['LearningResource'],
      name: 'Test',
      ext: { 'ekw:konfi': { zielgruppen: ['x'] } },
    };
    const result = ambToNostr(resource, { pubkey: 'a'.repeat(64) });
    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/must not contain ':'/);
  });

  test('accepts a reverse-DNS namespace for the same data', () => {
    const resource: any = {
      '@context': ['https://w3id.org/kim/amb/context.jsonld'],
      id: 'https://example.org/r1',
      type: ['LearningResource'],
      name: 'Test',
      ext: {
        'org.edufeed.ekw.konfi': {
          zielgruppen: [{ id: 'https://example.org/zg/1', type: 'Concept' }],
          plainLanguage: ['Leichte Sprache'],
        },
      },
    };
    const result = ambToNostr(resource, { pubkey: 'a'.repeat(64) });
    expect(result.success).toBe(true);
    const konfi = result.data!.tags.filter((t) => t[0].startsWith('ext:org.edufeed.ekw.konfi'));
    expect(konfi).toEqual([
      ['ext:org.edufeed.ekw.konfi:zielgruppen:id', 'https://example.org/zg/1'],
      ['ext:org.edufeed.ekw.konfi:zielgruppen:type', 'Concept'],
      ['ext:org.edufeed.ekw.konfi:plainLanguage', 'Leichte Sprache'],
    ]);
  });
});

describe('Nostr-native creator identities', () => {
  const pubkey = 'b'.repeat(64);

  function baseResource(overrides: any): any {
    return {
      '@context': ['https://w3id.org/kim/amb/context.jsonld'],
      id: 'https://example.org/r1',
      type: ['LearningResource'],
      name: 'Test',
      ...overrides,
    };
  }

  test('creator with nostr:npub id emits only a p tag', () => {
    const npub = nip19.npubEncode(pubkey);
    const resource = baseResource({
      creator: [{ type: 'Person', name: 'Jane Doe', id: `nostr:${npub}` }],
    });
    const result = ambToNostr(resource, { pubkey: 'a'.repeat(64) });
    expect(result.success).toBe(true);
    const tags = result.data!.tags;
    expect(tags).toContainEqual(['p', pubkey, '', 'creator']);
    expect(tags.filter((t) => t[0].startsWith('creator:'))).toEqual([]);
  });

  test('creator with nostr:nprofile id uses the embedded relay as hint', () => {
    const nprofile = nip19.nprofileEncode({ pubkey, relays: ['wss://relay.example.com'] });
    const resource = baseResource({
      creator: [{ type: 'Person', name: 'Jane Doe', id: `nostr:${nprofile}` }],
    });
    const result = ambToNostr(resource, {
      pubkey: 'a'.repeat(64),
      defaultRelayHint: 'wss://fallback.example.com',
    });
    const tags = result.data!.tags;
    expect(tags).toContainEqual(['p', pubkey, 'wss://relay.example.com', 'creator']);
    expect(tags.filter((t) => t[0].startsWith('creator:'))).toEqual([]);
  });

  test('npub id falls back to the configured default relay hint', () => {
    const npub = nip19.npubEncode(pubkey);
    const resource = baseResource({
      creator: [{ type: 'Person', name: 'Jane Doe', id: `nostr:${npub}` }],
    });
    const result = ambToNostr(resource, {
      pubkey: 'a'.repeat(64),
      defaultRelayHint: 'wss://fallback.example.com',
    });
    expect(result.data!.tags).toContainEqual(['p', pubkey, 'wss://fallback.example.com', 'creator']);
  });

  test('contributor with nostr: id emits p tag with contributor role', () => {
    const npub = nip19.npubEncode(pubkey);
    const resource = baseResource({
      contributor: [{ type: 'Person', name: 'Jane Doe', id: `nostr:${npub}` }],
    });
    const result = ambToNostr(resource, { pubkey: 'a'.repeat(64) });
    const tags = result.data!.tags;
    expect(tags).toContainEqual(['p', pubkey, '', 'contributor']);
    expect(tags.filter((t) => t[0].startsWith('contributor:'))).toEqual([]);
  });

  test('legacy nostrPubkey emits only a p tag (never both)', () => {
    const resource = baseResource({
      creator: [{ type: 'Person', name: 'Jane Doe', nostrPubkey: pubkey }],
    });
    const result = ambToNostr(resource, { pubkey: 'a'.repeat(64) });
    const tags = result.data!.tags;
    expect(tags).toContainEqual(['p', pubkey, '', 'creator']);
    expect(tags.filter((t) => t[0].startsWith('creator:'))).toEqual([]);
  });

  test('creator with external id keeps flattened tags and gets no p tag', () => {
    const resource = baseResource({
      creator: [{ type: 'Person', name: 'Jane Doe', id: 'https://orcid.org/0000-0002-3064-147X' }],
    });
    const result = ambToNostr(resource, { pubkey: 'a'.repeat(64) });
    const tags = result.data!.tags;
    expect(tags).toContainEqual(['creator:id', 'https://orcid.org/0000-0002-3064-147X']);
    expect(tags.filter((t) => t[0] === 'p')).toEqual([]);
  });

  test('undecodable nostr: id falls back to flattened tags with a warning', () => {
    const resource = baseResource({
      creator: [{ type: 'Person', name: 'Jane Doe', id: 'nostr:npub1invalid' }],
    });
    const result = ambToNostr(resource, { pubkey: 'a'.repeat(64) });
    expect(result.success).toBe(true);
    const tags = result.data!.tags;
    expect(tags.filter((t) => t[0] === 'p')).toEqual([]);
    expect(tags).toContainEqual(['creator:id', 'nostr:npub1invalid']);
    expect(result.warnings?.some((w) => w.includes('could not be decoded'))).toBe(true);
  });
});

describe('nostr: creator id round-trip', () => {
  test('identity survives AMB -> event -> AMB as a nostr: id', () => {
    const pubkey = 'c'.repeat(64);
    const npub = nip19.npubEncode(pubkey);
    const resource: any = {
      '@context': ['https://w3id.org/kim/amb/context.jsonld'],
      id: 'https://example.org/r1',
      type: ['LearningResource'],
      name: 'Test',
      creator: [{ type: 'Person', name: 'Jane Doe', id: `nostr:${npub}` }],
    };

    const forward = ambToNostr(resource, { pubkey: 'a'.repeat(64) });
    expect(forward.success).toBe(true);

    const back = nostrToAmb({ ...forward.data!, kind: 30142 });
    expect(back.success).toBe(true);
    const creators = back.data!.creator!;
    expect(creators).toHaveLength(1);
    const creator: any = creators[0];
    expect(creator.type).toBe('Person');
    // offline reverse conversion falls back to the npub as name
    expect(creator.name).toBe(npub);
    // npub input normalizes to nprofile output; same pubkey
    const decoded = nip19.decode(creator.id.replace('nostr:', ''));
    expect(decoded.type).toBe('nprofile');
    expect((decoded.data as any).pubkey).toBe(pubkey);
  });
});

describe('strict roundtrip fixes', () => {
  function base(overrides: any): any {
    return {
      '@context': ['https://w3id.org/kim/amb/context.jsonld'],
      id: 'https://example.org/r1',
      type: ['LearningResource'],
      name: 'Test',
      ...overrides,
    };
  }

  test('name-only relation emits no :id tag (no "undefined" string)', () => {
    const resource = base({ isBasedOn: [{ name: 'Some source work' }] });
    const result = ambToNostr(resource, { pubkey: 'a'.repeat(64) });
    expect(result.success).toBe(true);
    const tags = result.data!.tags;
    expect(tags.filter((t) => t[0] === 'isBasedOn:id')).toEqual([]);
    expect(tags).toContainEqual(['isBasedOn:name', 'Some source work']);
    expect(tags.some((t) => t.includes('undefined'))).toBe(false);
  });

  test('suggestedAge emits minValue/maxValue tags', () => {
    const resource = base({ suggestedAge: { minValue: 12, maxValue: 16 } });
    const result = ambToNostr(resource, { pubkey: 'a'.repeat(64) });
    const tags = result.data!.tags;
    expect(tags).toContainEqual(['suggestedAge:minValue', '12']);
    expect(tags).toContainEqual(['suggestedAge:maxValue', '16']);
  });

  test('suggestedAge with only minValue emits a single tag', () => {
    const resource = base({ suggestedAge: { minValue: 18 } });
    const result = ambToNostr(resource, { pubkey: 'a'.repeat(64) });
    const tags = result.data!.tags;
    expect(tags).toContainEqual(['suggestedAge:minValue', '18']);
    expect(tags.filter((t) => t[0] === 'suggestedAge:maxValue')).toEqual([]);
  });
});
