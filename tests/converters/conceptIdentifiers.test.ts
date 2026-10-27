/**
 * NIP-VOCAB canonical concept identifiers (nostr:naddr1…) and companion `a` tags.
 */
import { nip19 } from 'nostr-tools';
import { ambToNostr } from '../../src/converters/ambToNostr';
import { nostrToAmb } from '../../src/converters/nostrToAmb';
import { canonicalConceptId } from '../../src/utils/conceptId';

const PK = 'd2689e2f41dabfba953da26655a94ce2aa4e029c383ee921c6a4deafab99a612';
const N56 = 'nostr:naddr1qqpn2tfkqgsdy6y79aqa40a6j576yej449xw92jwq2wrs0hfy8r2fh404wv6vysrqsqqpxe6vja26r';
const base = {
  '@context': ['https://w3id.org/kim/amb/latest/context.jsonld'],
  id: 'https://example.org/r',
  type: ['LearningResource'],
  name: 'R',
};
const convert = (amb: any, opts: any = {}) => ambToNostr({ ...base, ...amb } as any, { pubkey: PK, ...opts });
const tagsOf = (amb: any, opts: any = {}) => convert(amb, opts).data!.tags;

describe('concept identifiers (NIP-VOCAB canonical naddr)', () => {
  it('emits the canonical id verbatim plus a companion a tag with the facet marker', () => {
    const tags = tagsOf({ about: [{ id: N56, prefLabel: { de: 'Klasse 5/6' } }] }, { defaultRelayHint: 'wss://relay.edufeed.org' });
    expect(tags).toContainEqual(['about:id', N56]);
    expect(tags).toContainEqual(['about:prefLabel:de', 'Klasse 5/6']);
    expect(tags).toContainEqual(['a', `39738:${PK}:5-6`, 'wss://relay.edufeed.org', 'about']);
  });

  it('canonicalises a legacy id and a hinted naddr, keeping the hint on the a tag only', () => {
    const hinted = 'nostr:' + nip19.naddrEncode({ kind: 39738, pubkey: PK, identifier: '5-6', relays: ['wss://hint.example'] });
    const r = convert({ teaches: [{ id: `nostr:39735:${PK}:5-6` }], educationalLevel: [{ id: hinted }] });
    expect(r.data!.tags).toContainEqual(['teaches:id', N56]);
    expect(r.data!.tags).toContainEqual(['a', `39738:${PK}:5-6`, '', 'teaches']);
    expect(r.data!.tags).toContainEqual(['educationalLevel:id', N56]);
    expect(r.data!.tags).toContainEqual(['a', `39738:${PK}:5-6`, 'wss://hint.example', 'educationalLevel']);
    expect(r.warnings?.some(w => /legacy/i.test(w))).toBe(true);
  });

  it('ext concept facets get the ext:<ns>:<facet> marker', () => {
    const tags = tagsOf({ ext: { 'org.edufeed.ekw': { zeitstruktur: [{ id: N56, prefLabel: { de: 'Doppelstunde' } }] } } });
    expect(tags).toContainEqual(['ext:org.edufeed.ekw:zeitstruktur:id', N56]);
    expect(tags).toContainEqual(['a', `39738:${PK}:5-6`, '', 'ext:org.edufeed.ekw:zeitstruktur']);
  });

  it('external URIs and malformed values pass through untouched with no companion tag', () => {
    const tags = tagsOf({ about: [{ id: 'http://w3id.org/kim/schulfaecher/s1017' }, { id: 'nostr:39738:zz:x' }] });
    expect(tags).toContainEqual(['about:id', 'http://w3id.org/kim/schulfaecher/s1017']);
    expect(tags).toContainEqual(['about:id', 'nostr:39738:zz:x']);
    expect(tags.filter(t => t[0] === 'a')).toEqual([]);
  });

  it('one companion tag per concept even when the same concept appears twice in a facet', () => {
    const tags = tagsOf({ about: [{ id: N56 }, { id: `nostr:39738:${PK}:5-6` }] });
    expect(tags.filter(t => t[0] === 'a')).toEqual([['a', `39738:${PK}:5-6`, '', 'about']]);
  });

  it('conceptCompanionTags: false suppresses the a tags but keeps canonical ids', () => {
    const tags = tagsOf({ about: [{ id: `nostr:39738:${PK}:5-6` }] }, { conceptCompanionTags: false });
    expect(tags).toContainEqual(['about:id', N56]);
    expect(tags.filter(t => t[0] === 'a')).toEqual([]);
  });

  it('reverse: a facet-marked a tag is not a relation and does not duplicate the concept; legacy ids are canonicalised; relation ids are relay-less', () => {
    const ev = {
      kind: 30142, pubkey: PK, created_at: 1, id: 'x', sig: 's', content: '',
      tags: [
        ['d', 'https://example.org/r'], ['type', 'LearningResource'], ['name', 'R'],
        ['about:id', `nostr:39738:${PK}:5-6`], ['about:prefLabel:de', 'Klasse 5/6'],
        ['a', `39738:${PK}:5-6`, 'wss://relay.edufeed.org', 'about'],
        ['ext:org.edufeed.ekw:zeitstruktur:id', `urn:nostr:39738:${PK}:5-6`],
        ['a', `39738:${PK}:5-6`, 'wss://relay.edufeed.org', 'ext:org.edufeed.ekw:zeitstruktur'],
        ['a', `30142:${PK}:parent`, 'wss://relay.edufeed.org', 'isPartOf'],
      ],
    };
    const r = nostrToAmb(ev as any);
    expect(r.success).toBe(true);
    expect(r.data!.about).toEqual([{ id: N56, prefLabel: { de: 'Klasse 5/6' } }]);
    expect(r.data!.ext['org.edufeed.ekw'].zeitstruktur[0].id).toBe(N56);
    expect(r.data!.isPartOf).toHaveLength(1);
    expect(r.data!.isPartOf[0].id).toBe('nostr:' + nip19.naddrEncode({ kind: 30142, pubkey: PK, identifier: 'parent', relays: [] }));
    expect(r.data!.hasPart).toBeUndefined();
    expect(r.warnings?.some(w => /legacy/i.test(w))).toBe(true);
  });

  it('reverse: a malformed concept id is kept verbatim and nothing throws', () => {
    const ev = { kind: 30142, pubkey: PK, created_at: 1, id: 'x', sig: 's', content: '', tags: [
      ['d', 'https://example.org/r'], ['type', 'LearningResource'], ['name', 'R'], ['about:id', 'nostr:39738:zz:x'],
    ] };
    const r = nostrToAmb(ev as any);
    expect(r.success).toBe(true);
    expect(r.data!.about[0].id).toBe('nostr:39738:zz:x');
  });

  it('works without Node globals (browser bundle): no Buffer at all', () => {
    const saved = (globalThis as any).Buffer;
    (globalThis as any).Buffer = undefined;
    try {
      expect(canonicalConceptId(`nostr:39738:${PK}:5-6`).id).toBe(N56);
      const long = `nostr:39738:${PK}:${'x'.repeat(300)}`;
      expect(canonicalConceptId(long).id).toBe(long);
      expect(canonicalConceptId(`nostr:39738:${PK}:${'ü'.repeat(128)}`).id).toBe(`nostr:39738:${PK}:${'ü'.repeat(128)}`); // 256 UTF-8 bytes
    } finally {
      (globalThis as any).Buffer = saved;
    }
  });
});
