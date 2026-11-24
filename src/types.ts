export const SIGHTING_SPECIES = [
  'Smooth-coated Otter',
  'Asian Small-clawed Otter',
  'Hairy-nosed Otter',
  'Unsure',
] as const;

export type OtterSpecies = (typeof SIGHTING_SPECIES)[number];

export const SIGHTING_ACTIVITIES = [
  'Swimming',
  'Foraging',
  'Basking',
  'Grooming',
  'Crossing',
] as const;

export type OtterActivity = (typeof SIGHTING_ACTIVITIES)[number];

export const KL_CORRIDORS = [
  'Perdana Botanical Gardens',
  'Titiwangsa Lake',
  'Klang River',
  'Gombak River',
  'Taman Jaya Lake',
  'Kepong Metropolitan',
  'Other KL Waterway',
] as const;

export type KlCorridor = (typeof KL_CORRIDORS)[number];

export const VALIDATION_LIMITS = {
  AUTHOR_NAME_MIN: 1,
  AUTHOR_NAME_MAX: 80,
  TITLE_MIN: 3,
  TITLE_MAX: 120,
  LOCATION_MIN: 2,
  LOCATION_MAX: 120,
  NOTES_MAX: 600,
  COMMENT_MIN: 1,
  COMMENT_MAX: 300,
  PHOTO_MAX_CHARS: 350000,
  COUNT_MIN: 1,
  COUNT_MAX: 30,
  LAT_MIN: 2.75,
  LAT_MAX: 3.55,
  LNG_MIN: 101.30,
  LNG_MAX: 102.00,
} as const;

export interface Sighting {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  species: OtterSpecies;
  count: number;
  activity: OtterActivity;
  corridor: KlCorridor;
  locationName: string;
  lat: number;
  lng: number;
  notes: string;
  photoUrl: string;
  confirmations: number;
  visibility: 'public';
  createdAtMs: number;
  updatedAtMs: number;
  isCuratedBaseline?: boolean;
}

export interface SightingComment {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  visibility: 'public';
  createdAtMs: number;
}

export interface HotspotInfo {
  corridor: KlCorridor;
  center: { lat: number; lng: number };
  zoom: number;
  peakWindow: string;
  vantagePoint: string;
  notes: string;
}
