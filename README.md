# AMB-Nostr Converter

A TypeScript library for converting between AMB ("Allgemeines Metadatenprofil für Bildungsressourcen" - General Metadata Profile for Learning Resources) and Nostr educational events ([`kind:30142`](https://github.com/edufeed-org/nips/blob/edufeed-amb/edufeed.md)).

## Overview

Bidirectional conversion between:
- **AMB**: JSON-LD based metadata format for educational resources (used by European OER initiatives)
- **Nostr**: Decentralized protocol for social media and content distribution

Usable as a library or CLI tool.

Ships one **source adapter** that converts a foreign metadata API into AMB, so
the core converter only ever deals with AMB itself: [SODIX](#source-adapter-sodix--amb).

## Installation

```bash
npm install amb-nostr-converter --registry=https://git.edufeed.org/api/packages/edufeed/npm/
```

For the latest development build (published on every push to main):
```bash
npm install amb-nostr-converter@dev --registry=https://git.edufeed.org/api/packages/edufeed/npm/
```

## Quick Start

### As a Library

```typescript
import { ambToNostr, nostrToAmb, AmbLearningResource } from 'amb-nostr-converter';

const resource: AmbLearningResource = {
  "@context": ["https://w3id.org/kim/amb/context.jsonld"],
  "id": "https://example.org/course123",
  "type": ["LearningResource", "Course"],
  "name": "Introduction to TypeScript",
  "creator": [{ "type": "Person", "name": "Jane Smith" }],
  "description": "Learn TypeScript fundamentals",
  "keywords": ["TypeScript", "Programming"],
  "license": { "id": "https://creativecommons.org/licenses/by-sa/4.0/" }
};

// Convert to Nostr event
const result = ambToNostr(resource, { pubkey: 'your-nostr-public-key-hex' });

if (result.success) {
  console.log('Nostr Event:', result.data);

  // Convert back to AMB
  const ambResult = nostrToAmb(result.data!);
}
```

### Creator identities (Nostr-native vs. external)

Per [NIP-AMB](https://git.edufeed.org/edufeed/nips/src/branch/edufeed-amb/AMB.md), each creator/contributor gets exactly one representation in the event — never both:

- **Nostr identity**: set the person's `id` to a `nostr:npub…` or `nostr:nprofile…` URI ([NIP-21](https://github.com/nostr-protocol/nips/blob/master/21.md)). `ambToNostr` decodes it and emits a `["p", <pubkey-hex>, <relay-hint>, "creator"|"contributor"]` tag; no flattened `creator:*` tags are written for that person. Relay hint precedence: nprofile-embedded relay → `defaultRelayHint` option → empty. (The legacy `nostrPubkey` field still works but is deprecated.)
- **External identity**: any other `id` (e.g. an ORCID URL) — or no `id` — produces flattened `creator:name`/`creator:type`/`creator:id`/… tags.

```typescript
const resource: AmbLearningResource = {
  // ...
  "creator": [
    { "type": "Person", "name": "Jane Smith", "id": "nostr:npub1..." },          // → p tag
    { "type": "Person", "name": "John Doe", "id": "https://orcid.org/0000-..." } // → creator:* tags
  ],
};
```

On reverse conversion, `nostrToAmb` maps each creator/contributor `p` tag to `{ name, type: "Person", id: "nostr:<nprofile>" }`. Because the AMB schema requires `name` and the base converter is offline, `name` falls back to the npub encoding; use `nostrToAmbWithProfiles` to resolve real names from kind:0 profiles (it replaces the npub fallback).

For events whose `d` tag is not an absolute URI (e.g. a slug), `nostrToAmb` derives the AMB `id` as `nostr:<naddr>` from the event's kind, pubkey, and `d` value.

### As a CLI Tool

```bash
# AMB → Nostr
amb-convert amb:nostr course.json -o event.json

# Nostr → AMB
amb-convert nostr:amb event.json -o recovered.json

# Pretty-print and pipe
amb-convert amb:nostr course.json -p | jq .tags

# Sign events with private key
amb-convert amb:nostr course.json --nsec nsec1...

# Batch convert JSONL
amb-convert amb:nostr resources.jsonl --nsec $NOSTR_NSEC -o events.jsonl

# SODIX → AMB (source adapter)
amb-convert sodix:amb sodix-records.jsonl --sodix-filter open-license -o amb.jsonl
```

## CLI Reference

| Option | Description | Direction |
|--------|-------------|-----------|
| `<direction>` | `amb:nostr`, `nostr:amb` or `sodix:amb` | Required |
| `[input]` | Input file path (omit for stdin) | Both |
| `-o, --output <file>` | Output file path (omit for stdout) | Both |
| `-p, --pretty` | Pretty-print JSON | Both |
| `--tags` | Output only tags array | AMB→Nostr |
| `--nsec <key>` | Sign with private key (nsec or hex) | AMB→Nostr |
| `--private-key <key>` | Sign with private key (hex or nsec) | AMB→Nostr |
| `--sodix-filter <name>` | Subset to keep: `open-license` (default), `free`, `activated`, `all` | SODIX→AMB |
| `--sodix-id-scheme <name>` | AMB `id` derivation: `urn` (default) or `media` | SODIX→AMB |

### Batch Processing (JSONL)

JSONL input (one JSON object per line) is auto-detected. Errors on individual lines are reported with line numbers and don't stop processing of remaining lines.

```bash
cat resources.jsonl | amb-convert amb:nostr --nsec $NOSTR_NSEC -o events.jsonl
```

When converting multiple events, each event gets an incrementing `created_at` timestamp (base time + 1 second per event). This ensures relay clients that use cursor-based pagination on `created_at` can load all events correctly.

### Event Signing

When `--nsec` or `--private-key` is provided (both accept nsec1 or hex format):
- Public key is automatically derived
- Event ID and Schnorr signature are generated
- Output includes `id`, `sig`, and correct `pubkey` fields

## External URL tags (`r`)

Every absolute external URL a resource points at is additionally emitted as a
Nostr-native `r` tag, per [NIP-AMB](https://git.edufeed.org/edufeed/nips/src/branch/edufeed-amb/AMB.md).
`r` is what relays and clients actually index — a URL that lives only in a
flattened `encoding:contentUrl` tag is effectively invisible to full-text
search.

Collected from `mainEntityOfPage[].id`, `encoding[].contentUrl`,
`encoding[].embedUrl`, `trailer.contentUrl`, `trailer.embedUrl` and `image`,
then deduplicated — the same URL commonly appears in more than one role.

```json
["encoding:contentUrl", "https://cdn.example.org/a.mp4"]
["r", "https://cdn.example.org/a.mp4"]
```

The flattened AMB-core tags are unchanged, so round-tripping is unaffected:
`r` is additive, and `nostrToAmb` ignores it (the spec maps it to no AMB
property). Values that are not absolute references are skipped, since a bare
slug is not resolvable by a client.

## Source adapter: SODIX → AMB

[SODIX](https://sodix.de) is the German federal-state media platform for
educational resources. Its GraphQL API v3 predates AMB, so this is a real
mapping rather than a renaming.

```bash
amb-convert sodix:amb records.jsonl --sodix-filter open-license -o amb.jsonl
amb-convert amb:nostr amb.jsonl --nsec $NOSTR_NSEC -o events.jsonl
```

```typescript
import { sodix } from 'amb-nostr-converter';

const result = sodix.sodixToAmb(record);
if (result.success) console.log(result.data);
```

### Which subset to publish

`--sodix-filter` is the most consequential option, because the corpus is mostly
not openly licensed. Measured over 203809 records of the live API (August 2026):

| | Share |
|---|---|
| CC license URI (genuinely open) | 18.6 % |
| "Copyright, freier Zugang" (copyrighted, free *access*) | 53.0 % |
| "Copyright, lizenzpflichtig" (license required) | 25.1 % |
| `paymentType: PAID` | 23.5 % |
| `downloadRight: false` | 29.5 % |

`open-license` is therefore the default. Distributing metadata is the normal
case for AMB/OERSI — titles, descriptions and links travel, not the media files
— but whether a given source's terms of use permit it is a legal question.

### The AMB `id` is a one-way decision

`--sodix-id-scheme` determines the AMB `id`, which becomes the Nostr `d` tag. For
an addressable event (`kind:pubkey:d`) that is the identity across all future
updates; changing the scheme later produces a second, unlinked event per record
rather than an update.

| Scheme | Value | Trade-off |
|---|---|---|
| `urn` (default) | `urn:sodix:SODIX-0001234` | Stable; departs from AMB's recommendation of a dereferenceable HTTP URI |
| `media` | the media URL | Dereferenceable, but a moved file yields a new event |

### Mapping decisions worth knowing

**SODIX serves vocabulary names in mixed languages.** `lrts`,
`educationLevels`, `schoolTypes`, `costs` and most `hubbs` vocabularies are
English, `subjects` and `competences` are German, and `lands` mixes both within
one list ("Baden-Württemberg" next to "Bavaria"). KIM-mapped concepts therefore
carry the authoritative German label from the KIM SKOS scheme itself, `ext`
concepts carry the SODIX name tagged with the language that vocabulary actually
uses, and where the language is not determinable no `prefLabel` is claimed.

**Competences do not go to `teaches`.** AMB requires a URI as `id` there, while
SODIX supplies internal numeric keys (`40004020201`). They surface as
`ext:de.sodix:kompetenz`.

**Six "languages" are not languages.** `WITHOUT_LANGUAGE`, `AUDIO_DESCRIPTION`,
`PLAIN_LANGUAGE`, `SIMPLE_LANGUAGE`, `ORIGINAL_VERSION_WITH_SUBTITLES` and
`SUBTITLES_FOR_THE_HEARING_IMPAIRED` are version or accessibility markers. They
go to `ext:de.sodix:sprachfassung`, not `inLanguage`.

**`/deed.de` is not `/de/`.** In CC URLs, `…/by-sa/4.0/deed.de` is only the
German-language view of the same license and is normalised away.
`…/by-nc-nd/3.0/de/` is the ported German license — a different license, which is
preserved.

**Every lossy mapping keeps the original.** 48 SODIX resource types collapse onto
26 HCRT concepts and 2043 subjects onto 61 KIM subjects, so the SODIX value is
always additionally emitted as `ext:de.sodix:ressourcentyp` / `…:fach`.
Simplifying is fine; silently dropping data is not.

Target vocabularies are verified against the live SKOS schemes: HCRT (26
concepts), ISCED-1997 (7 levels) and KIM school subjects (61 subjects).

## Development

```bash
npm install
npm run build
npm test
```

## Related Projects

- [AMB Sitemap Parser](https://git.edufeed.org/edufeed/amb-sitemap-parser) - Parse sitemaps and extract AMB educational metadata from web pages
- [AMB Specification](https://w3id.org/kim/amb/) - General Metadata Profile for Learning Resources
- [AMB-NIP (kind 30142)](https://github.com/edufeed-org/nips/blob/edufeed-amb/edufeed.md) - Nostr event spec for AMB
- [Nostr Protocol](https://github.com/nostr-protocol/nostr) - Notes and Other Stuff Transmitted by Relays
