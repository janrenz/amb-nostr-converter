import { ambToNostr } from '../../src/converters/ambToNostr';
import { nostrToAmb } from '../../src/converters/nostrToAmb';
import {
  sodixToAmb,
  SODIX_FILTERS,
  openLicense,
  durationToIso8601,
  normalizeLicenseUrl,
  isOpenLicense,
} from '../../src/sources/sodix/index';
import type { SodixRecord } from '../../src/sources/sodix/types';

/** A realistically shaped record, modelled on live API v3 output. */
const record: SodixRecord = {
  sodixId: 'SODIX-0000001739',
  recordStatus: 'ACTIVATED',
  paymentType: 'NOT_PAID',
  createdAt: '2009-01-01T00:00:00.000Z',
  updateTime: '2024-02-06T17:40:57.122Z',
  general: {
    title: 'Teichschichtung',
    description: 'Trennung von Oberflächenwasser, Sprungschicht und Tiefenwasser.',
    keywords: ['Sprungschicht', 'Tiefenwasser', 'Sprungschicht'],
    languages: [{ id: 'GERMAN', name: 'German' }, { id: 'AUDIO_DESCRIPTION', name: 'Audio description' }],
  },
  lifeCycle: { author: ['Wolfgang Dukorn'], producer: 'FWU', publishedTime: '2010-05-01T00:00:00.000Z' },
  source: { id: '6051d519a1bd7e33fd4abaeb', name: 'LehrplanPLUS', website: 'https://example.org/quelle' },
  educational: {
    learningResourceType: [{ id: 'VIDEO', name: 'Video' }, { id: 'ENTDECKENDES', name: 'Discovery Learning' }],
    educationalLevel: [{ id: 'SEKUNDARSTUFE_I', name: 'Secondary school I' }],
    schoolType: [{ id: 'GYMNASIUM', name: 'High school' }],
    classLevel: [{ id: '11', name: '11th class' }],
    subject: [{ id: '100', name: 'Chemie' }, { id: '180', name: 'Freizeit' }],
    competence: [{ id: '40004020201', name: 'Dateien und Links teilen' }],
  },
  media: {
    url: 'https://download.sodix.de/api/content/data/SODIX-0000001739.mp4',
    thumbnail: 'https://images.sodix.de/thumb.jpg',
    duration: '00:01:09',
    dataType: 'video/mp4',
    size: '12345',
  },
  rights: {
    cost: { id: 'FREE', name: 'free' },
    license: { name: 'CC BY', url: 'https://creativecommons.org/licenses/by/4.0/' },
    downloadRight: true,
  },
  hubbs: { federalState: [{ id: 'BAVARIA', name: 'Bavaria' }] },
};

const mapped = () => {
  const result = sodixToAmb(record);
  if (!result.success) throw new Error(result.error);
  return result.data as any;
};

describe('sodixToAmb', () => {
  it('maps the AMB core fields', () => {
    const amb = mapped();
    expect(amb.id).toBe('urn:sodix:SODIX-0000001739');
    expect(amb.name).toBe('Teichschichtung');
    expect(amb.type).toEqual(['LearningResource', 'VideoObject']);
    expect(amb.isAccessibleForFree).toBe(true);
    expect(amb.license).toEqual({ id: 'https://creativecommons.org/licenses/by/4.0/' });
    expect(amb.encoding).toEqual([
      {
        type: 'MediaObject',
        contentUrl: 'https://download.sodix.de/api/content/data/SODIX-0000001739.mp4',
        encodingFormat: 'video/mp4',
        contentSize: '12345',
      },
    ]);
  });

  it('deduplicates keywords', () => {
    expect(mapped().keywords).toEqual(['Sprungschicht', 'Tiefenwasser']);
  });

  it('converts HH:MM:SS to an ISO 8601 duration', () => {
    expect(mapped().duration).toBe('PT1M9S');
    expect(durationToIso8601('01:02:03')).toBe('PT1H2M3S');
    expect(durationToIso8601('00:00:00')).toBeNull();
    expect(durationToIso8601('nonsense')).toBeNull();
  });

  it('requires sodixId and title, and reports what is missing', () => {
    expect(sodixToAmb({ ...record, sodixId: null })).toEqual({ success: false, error: 'missing sodixId' });
    expect(sodixToAmb({ ...record, general: { title: '  ' } })).toEqual({
      success: false,
      error: 'missing title',
    });
  });

  describe('id scheme', () => {
    it('defaults to a stable urn', () => {
      expect(mapped().id).toBe('urn:sodix:SODIX-0000001739');
    });

    it('can use the media URL instead', () => {
      const result = sodixToAmb(record, { idScheme: 'media' });
      expect(result.success && (result.data as any).id).toBe(
        'https://download.sodix.de/api/content/data/SODIX-0000001739.mp4'
      );
    });

    it('falls back to the urn when the record carries no media URL', () => {
      const result = sodixToAmb({ ...record, media: { thumbnail: 'x' } }, { idScheme: 'media' });
      expect(result.success && (result.data as any).id).toBe('urn:sodix:SODIX-0000001739');
    });
  });

  describe('vocabulary mapping', () => {
    it('uses authoritative German KIM labels, not the SODIX names', () => {
      const amb = mapped();
      // SODIX serves "Secondary school I" (English) for this level; emitting
      // that as prefLabel.de would be a false language claim.
      expect(amb.educationalLevel).toEqual([
        { id: 'https://w3id.org/kim/isced-1997/level2', type: 'Concept', prefLabel: { de: 'Sekundarbereich I' } },
      ]);
      // ENTDECKENDES has no HCRT counterpart and lands on hcrt/other; the
      // precise SODIX type is preserved in ext (asserted below).
      expect(amb.learningResourceType).toEqual([
        { id: 'https://w3id.org/kim/hcrt/video', type: 'Concept', prefLabel: { de: 'Video' } },
        { id: 'https://w3id.org/kim/hcrt/other', type: 'Concept', prefLabel: { de: 'Sonstiges' } },
      ]);
      expect(amb.about).toEqual([
        { id: 'http://w3id.org/kim/schulfaecher/s1002', type: 'Concept', prefLabel: { de: 'Chemie' } },
      ]);
    });

    it('keeps the SODIX original for every lossy mapping', () => {
      const ext = mapped().ext['de.sodix'];
      // HCRT has no counterpart for ENTDECKENDES, and KIM none for "Freizeit".
      expect(ext.ressourcentyp).toEqual([
        { id: 'VIDEO', type: 'Concept', prefLabel: { en: 'Video' } },
        { id: 'ENTDECKENDES', type: 'Concept', prefLabel: { en: 'Discovery Learning' } },
      ]);
      expect(ext.fach).toEqual([{ id: '180', type: 'Concept', prefLabel: { de: 'Freizeit' } }]);
    });

    it('claims no prefLabel where the SODIX vocabulary mixes languages', () => {
      // `lands` holds "Baden-Württemberg" next to "Bavaria" in one list.
      expect(mapped().ext['de.sodix'].bundesland).toEqual([{ id: 'BAVARIA', type: 'Concept' }]);
    });
  });

  describe('language handling', () => {
    it('maps real language codes to inLanguage', () => {
      expect(mapped().inLanguage).toEqual(['de']);
    });

    it('routes version markers to ext instead of inLanguage', () => {
      // AUDIO_DESCRIPTION is an accessibility feature, not a language.
      expect(mapped().ext['de.sodix'].sprachfassung).toEqual(['Audio description']);
    });

    it('corrects the typos in the SODIX language list', () => {
      const withTypos = sodixToAmb({
        ...record,
        general: { title: 'x', languages: [{ id: 'ALBANINAN' }, { id: 'CHROATIAN' }, { id: 'IRIS' }] },
      });
      expect(withTypos.success && (withTypos.data as any).inLanguage).toEqual(['sq', 'hr', 'ga']);
    });
  });

  it('does not put competences in teaches, because SODIX keys are not URIs', () => {
    const amb = mapped();
    expect(amb.teaches).toBeUndefined();
    expect(amb.ext['de.sodix'].kompetenz).toEqual([
      { id: '40004020201', type: 'Concept', prefLabel: { de: 'Dateien und Links teilen' } },
    ]);
  });

  it('honours a custom ext namespace', () => {
    const result = sodixToAmb(record, { extNamespace: 'org.example' });
    expect(result.success && Object.keys((result.data as any).ext)).toEqual(['org.example']);
  });
});

describe('license normalisation', () => {
  it('strips the deed language view', () => {
    expect(normalizeLicenseUrl('https://creativecommons.org/licenses/by-sa/4.0/deed.de')).toBe(
      'https://creativecommons.org/licenses/by-sa/4.0/'
    );
  });

  it('preserves a ported jurisdiction license', () => {
    // /de/ is a different license, not a translation of the same one.
    expect(normalizeLicenseUrl('https://creativecommons.org/licenses/by-nc-nd/3.0/de/')).toBe(
      'https://creativecommons.org/licenses/by-nc-nd/3.0/de/'
    );
  });

  it('rejects non-URL values', () => {
    expect(normalizeLicenseUrl('Copyright, freier Zugang')).toBeNull();
    expect(isOpenLicense('Copyright, freier Zugang')).toBe(false);
    expect(isOpenLicense(null)).toBe(false);
  });

  it('does not claim a license URI when SODIX supplies only a name', () => {
    const result = sodixToAmb({
      ...record,
      rights: { license: { name: 'Copyright, freier Zugang' } },
    });
    expect(result.success && (result.data as any).license).toBeUndefined();
    expect(result.success && (result.data as any).ext['de.sodix'].lizenzname).toEqual([
      'Copyright, freier Zugang',
    ]);
  });
});

describe('filters', () => {
  it('accepts only activated records with a real CC URI', () => {
    expect(openLicense(record)).toBe(true);
    expect(openLicense({ ...record, recordStatus: 'UNAVAILABLE' })).toBe(false);
    expect(openLicense({ ...record, rights: { license: { name: 'Copyright, freier Zugang' } } })).toBe(false);
  });

  it('exposes every filter by name', () => {
    expect(Object.keys(SODIX_FILTERS).sort()).toEqual(['activated', 'all', 'free', 'open-license']);
    expect(SODIX_FILTERS['free']?.({ recordStatus: 'ACTIVATED', paymentType: 'PAID' })).toBe(false);
    expect(SODIX_FILTERS['all']?.({})).toBe(true);
  });
});

describe('SODIX → AMB → Nostr → AMB round trip', () => {
  it('survives the conversion without losing fields', () => {
    const amb = mapped();
    const event = ambToNostr(amb, { pubkey: 'a'.repeat(64) });
    expect(event.success).toBe(true);
    expect(event.data?.kind).toBe(30142);

    const back = nostrToAmb(event.data!);
    expect(back.success).toBe(true);
    const recovered = back.data as any;

    expect(recovered.id).toBe(amb.id);
    expect(recovered.name).toBe(amb.name);
    expect(recovered.license).toEqual(amb.license);
    expect(recovered.keywords).toEqual(amb.keywords);
    expect(recovered.inLanguage).toEqual(amb.inLanguage);
    expect(recovered.about).toEqual(amb.about);
    expect(recovered.educationalLevel).toEqual(amb.educationalLevel);
    expect(recovered.ext).toEqual(amb.ext);
  });

  it('emits keywords as Nostr-native t tags', () => {
    const event = ambToNostr(mapped(), { pubkey: 'a'.repeat(64) });
    const tags = event.data!.tags.filter((tag) => tag[0] === 't').map((tag) => tag[1]);
    expect(tags).toEqual(['Sprungschicht', 'Tiefenwasser']);
  });
});
