/**
 * NIP-VOCAB concept identifiers.
 *
 * A concept published on Nostr without an external `i` URI is identified by its
 * canonical Nostr URI: `nostr:` + the NIP-19 naddr of (published kind, pubkey,
 * byte-exact d) with no relay entries. Producers MUST NOT emit the legacy
 * `nostr:<kind>:<pubkey>:<d>` form; consumers accept it (and `urn:nostr:…`) and
 * canonicalise. See VOCAB.md "Canonical Nostr URI".
 */
import { nip19 } from 'nostr-tools';

const HEX64 = /^[0-9a-f]{64}$/i;
const DRAFT_TO_PUBLISHED: Record<number, number> = { 39736: 39737, 39735: 39738, 39734: 39739 };

export interface CanonicalConceptId {
  /** The identifier to emit: canonical Nostr URI, or the input unchanged. */
  id: string;
  /** `kind:pubkey:d` of the concept event when the id is a Nostr identifier. */
  address?: string;
  /** First relay hint carried by a received naddr, if any. */
  relayHint?: string;
  /** Set when the input used a legacy form and was rewritten. */
  warning?: string;
}

function publishedKind(kind: number): number {
  return DRAFT_TO_PUBLISHED[kind] ?? kind;
}

function fromTriple(kind: number, pubkey: string, d: string, relays: string[] = []): { kind: number; pubkey: string; d: string; relays: string[] } | null {
  if (!Number.isInteger(kind) || kind <= 0 || !HEX64.test(pubkey) || typeof d !== 'string') return null;
  if (Buffer.byteLength(d, 'utf8') > 255) return null; // no naddr can carry it (one-byte TLV length)
  return { kind: publishedKind(kind), pubkey: pubkey.toLowerCase(), d, relays };
}

/**
 * Canonicalise a concept identifier. Never throws; non-Nostr and unparseable
 * values are returned as given with no address.
 */
export function canonicalConceptId(value: string): CanonicalConceptId {
  if (typeof value !== 'string') return { id: value as unknown as string };
  let rest: string;
  let legacy = false;
  if (value.startsWith('urn:nostr:')) { rest = value.slice('urn:nostr:'.length); legacy = true; }
  else if (value.startsWith('nostr:')) { rest = value.slice('nostr:'.length); }
  else return { id: value };

  let triple: { kind: number; pubkey: string; d: string; relays: string[] } | null = null;
  try {
    if (/^naddr1/i.test(rest)) {
      const decoded = nip19.decode(rest.toLowerCase());
      if (decoded.type !== 'naddr') return { id: value };
      const { kind, pubkey, identifier, relays } = decoded.data as { kind: number; pubkey: string; identifier: string; relays?: string[] };
      triple = fromTriple(kind, pubkey, identifier, relays ?? []);
    } else {
      const first = rest.indexOf(':');
      const second = first > 0 ? rest.indexOf(':', first + 1) : -1;
      if (second <= first + 1) return { id: value };
      triple = fromTriple(Number(rest.slice(0, first)), rest.slice(first + 1, second), rest.slice(second + 1));
      legacy = true;
    }
  } catch {
    return { id: value };
  }
  if (!triple) return { id: value };

  let naddr: string;
  try {
    naddr = nip19.naddrEncode({ kind: triple.kind, pubkey: triple.pubkey, identifier: triple.d, relays: [] });
  } catch {
    return { id: value };
  }
  const out: CanonicalConceptId = { id: `nostr:${naddr}`, address: `${triple.kind}:${triple.pubkey}:${triple.d}` };
  if (triple.relays[0]) out.relayHint = triple.relays[0];
  if (legacy) out.warning = `legacy concept identifier "${value}" canonicalised to ${out.id}`;
  return out;
}
