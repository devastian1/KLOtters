import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Camera, Crosshair, MapPin, Upload, X } from 'lucide-react';
import { CURATED_BASELINE_SIGHTINGS, KL_HOTSPOTS } from '../data/klOtterData';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  KL_CORRIDORS,
  KlCorridor,
  OtterActivity,
  OtterSpecies,
  SIGHTING_ACTIVITIES,
  SIGHTING_SPECIES,
  VALIDATION_LIMITS,
} from '../types';
import { clampKlLatLng, formatCoordinates, isWithinKlBounds } from '../utils/formatters';
import { compressImageToDataUrl } from '../utils/imageCompression';
import { ResilientImage } from './ResilientImage';

interface ReportSightingModalProps {
  isOpen: boolean;
  user: User | null;
  pickedCoords: { lat: number; lng: number } | null;
  isPickingOnMap: boolean;
  onStartMapPick: () => void;
  onClose: () => void;
  onSignIn: () => Promise<User | null>;
  onCreated: (sightingId: string) => void;
}

export function ReportSightingModal({
  isOpen,
  user,
  pickedCoords,
  isPickingOnMap,
  onStartMapPick,
  onClose,
  onSignIn,
  onCreated,
}: ReportSightingModalProps) {
  const [title, setTitle] = useState('');
  const [species, setSpecies] = useState<OtterSpecies>('Smooth-coated Otter');
  const [count, setCount] = useState<number>(2);
  const [activity, setActivity] = useState<OtterActivity>('Swimming');
  const [corridor, setCorridor] = useState<KlCorridor>('Perdana Botanical Gardens');
  const [locationName, setLocationName] = useState('Perdana East Lake Boardwalk');
  const [lat, setLat] = useState<number>(3.1432);
  const [lng, setLng] = useState<number>(101.6848);
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string>(CURATED_BASELINE_SIGHTINGS[0].photoUrl);
  const [photoLabel, setPhotoLabel] = useState<string>('Corridor field frame (upload your own below)');
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (pickedCoords) {
      const clamped = clampKlLatLng(pickedCoords.lat, pickedCoords.lng);
      setLat(clamped.lat);
      setLng(clamped.lng);
    }
  }, [pickedCoords]);

  if (!isOpen || isPickingOnMap) return null;

  const handleCorridorChange = (nextCorridor: KlCorridor) => {
    setCorridor(nextCorridor);
    const hotspot = KL_HOTSPOTS.find((h) => h.corridor === nextCorridor);
    if (hotspot) {
      setLat(hotspot.center.lat);
      setLng(hotspot.center.lng);
      setLocationName(hotspot.vantagePoint.split('&')[0].trim());
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setIsCompressing(true);
    try {
      const compressed = await compressImageToDataUrl(file);
      setPhotoUrl(compressed);
      setPhotoLabel(`${file.name} (${Math.round(compressed.length / 1024)} KB ready)`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to process image.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported in this browser.');
      return;
    }
    setErrorMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextLat = pos.coords.latitude;
        const nextLng = pos.coords.longitude;
        if (!isWithinKlBounds(nextLat, nextLng)) {
          setErrorMsg('Detected GPS is outside Greater Kuala Lumpur. Choose a KL corridor or pick on map.');
          return;
        }
        const clamped = clampKlLatLng(nextLat, nextLng);
        setLat(clamped.lat);
        setLng(clamped.lng);
      },
      () => {
        setErrorMsg('Could not access GPS location. Try picking directly on the KL map.');
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedTitle = title.trim();
    const trimmedLocation = locationName.trim();
    const trimmedNotes = notes.trim();

    if (trimmedTitle.length < VALIDATION_LIMITS.TITLE_MIN || trimmedTitle.length > VALIDATION_LIMITS.TITLE_MAX) {
      setErrorMsg(`Headline must be between ${VALIDATION_LIMITS.TITLE_MIN} and ${VALIDATION_LIMITS.TITLE_MAX} characters.`);
      return;
    }
    if (trimmedLocation.length < VALIDATION_LIMITS.LOCATION_MIN || trimmedLocation.length > VALIDATION_LIMITS.LOCATION_MAX) {
      setErrorMsg(`Spot name must be between ${VALIDATION_LIMITS.LOCATION_MIN} and ${VALIDATION_LIMITS.LOCATION_MAX} characters.`);
      return;
    }
    if (!isWithinKlBounds(lat, lng)) {
      setErrorMsg('Coordinates must fall within Greater Kuala Lumpur / Klang Valley.');
      return;
    }
    if (count < VALIDATION_LIMITS.COUNT_MIN || count > VALIDATION_LIMITS.COUNT_MAX) {
      setErrorMsg(`Otter count must be between ${VALIDATION_LIMITS.COUNT_MIN} and ${VALIDATION_LIMITS.COUNT_MAX}.`);
      return;
    }
    if (photoUrl.length > VALIDATION_LIMITS.PHOTO_MAX_CHARS) {
      setErrorMsg('Photo payload exceeds size limit. Please upload a smaller image.');
      return;
    }

    let activeUser = user;
    if (!activeUser) {
      activeUser = await onSignIn();
      if (!activeUser) return;
    }

    setIsSubmitting(true);
    const sightingId = `kl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const authorName = (activeUser.displayName || activeUser.email?.split('@')[0] || 'KL Spotter').slice(
      0,
      VALIDATION_LIMITS.AUTHOR_NAME_MAX
    );

    const payload = {
      authorId: activeUser.uid,
      authorName,
      title: trimmedTitle,
      species,
      count: Math.round(count),
      activity,
      corridor,
      locationName: trimmedLocation,
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
      notes: trimmedNotes.slice(0, VALIDATION_LIMITS.NOTES_MAX),
      photoUrl,
      confirmations: 0,
      visibility: 'public' as const,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, 'sightings', sightingId), payload);
      setTitle('');
      setNotes('');
      onCreated(sightingId);
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `sightings/${sightingId}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#141E1A]/55 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-sighting-heading"
    >
      <div className="bg-white border border-[#D7E0D6] rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto thin-scrollbar shadow-2xl">
        <div className="px-6 py-4 border-b border-[#DCE3DA] flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 id="report-sighting-heading" className="font-display text-xl font-semibold text-[#141E1A]">
              Report Kuala Lumpur Otter Sighting
            </h2>
            <p className="text-xs text-[#5D6D64] mt-0.5">
              Broadcasts live to the map and photo stream for fellow KL spotters
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[#5D6D64] hover:text-[#141E1A] hover:bg-[#F3F6F3] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {!user && (
            <div className="p-3.5 rounded-lg bg-[#F1F6F4] border border-[#CFE0D9] flex items-center justify-between gap-3">
              <p className="text-xs text-[#23473C]">
                Sign in with your Google account to publish sightings and share photos live.
              </p>
              <button
                type="button"
                onClick={() => void onSignIn()}
                className="px-3.5 py-2 text-xs font-medium bg-[#0D6E59] text-white rounded-lg hover:bg-[#095444] transition-colors whitespace-nowrap shrink-0"
              >
                Sign In with Google
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-lg bg-[#FDF1F0] border border-[#EBC6C2] text-xs text-[#8D261D]">
              {errorMsg}
            </div>
          )}

          {/* Photo Upload Zone */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#141E1A]">
              Sighting Photo
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 items-center">
              <div className="h-36 w-full rounded-lg overflow-hidden border border-[#DCE3DA] bg-[#F1F4F0]">
                <ResilientImage
                  src={photoUrl}
                  alt="Sighting preview"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="space-y-2.5">
                <label className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium bg-[#F3F6F3] text-[#141E1A] border border-[#DCE3DA] rounded-lg hover:bg-[#E9EFEA] cursor-pointer transition-colors">
                  <Upload className="w-4 h-4 text-[#0D6E59]" />
                  <span>{isCompressing ? 'Optimizing photo...' : 'Upload Camera Photo'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    onChange={handleFileChange}
                    className="sr-only"
                    disabled={isCompressing}
                  />
                </label>
                <p className="text-xs text-[#5D6D64]">{photoLabel}</p>
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <span className="text-[11px] text-[#5D6D64]">Quick fallback:</span>
                  {CURATED_BASELINE_SIGHTINGS.slice(0, 3).map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setPhotoUrl(item.photoUrl);
                        setPhotoLabel(`KL field archive #${idx + 1}`);
                      }}
                      className="text-[11px] font-medium text-[#0D6E59] hover:underline"
                    >
                      Frame {idx + 1}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Headline */}
          <div className="space-y-1.5">
            <label htmlFor="sighting-title" className="block text-xs font-semibold text-[#141E1A]">
              Sighting Headline
            </label>
            <input
              id="sighting-title"
              type="text"
              required
              maxLength={VALIDATION_LIMITS.TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Family of 4 swimming past Masjid Jamek steps"
              className="w-full h-10 px-3 text-sm bg-white border border-[#DCE3DA] rounded-lg focus:outline-none focus:border-[#0D6E59]"
            />
          </div>

          {/* Species / Count / Activity */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="sighting-species" className="block text-xs font-semibold text-[#141E1A]">
                Species
              </label>
              <select
                id="sighting-species"
                value={species}
                onChange={(e) => setSpecies(e.target.value as OtterSpecies)}
                className="w-full h-10 px-3 text-sm bg-white border border-[#DCE3DA] rounded-lg focus:outline-none focus:border-[#0D6E59]"
              >
                {SIGHTING_SPECIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="sighting-count" className="block text-xs font-semibold text-[#141E1A]">
                Otters Counted
              </label>
              <input
                id="sighting-count"
                type="number"
                min={VALIDATION_LIMITS.COUNT_MIN}
                max={VALIDATION_LIMITS.COUNT_MAX}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-white border border-[#DCE3DA] rounded-lg focus:outline-none focus:border-[#0D6E59]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="sighting-activity" className="block text-xs font-semibold text-[#141E1A]">
                Behaviour
              </label>
              <select
                id="sighting-activity"
                value={activity}
                onChange={(e) => setActivity(e.target.value as OtterActivity)}
                className="w-full h-10 px-3 text-sm bg-white border border-[#DCE3DA] rounded-lg focus:outline-none focus:border-[#0D6E59]"
              >
                {SIGHTING_ACTIVITIES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Corridor & Specific Spot */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="sighting-corridor" className="block text-xs font-semibold text-[#141E1A]">
                Waterway Corridor
              </label>
              <select
                id="sighting-corridor"
                value={corridor}
                onChange={(e) => handleCorridorChange(e.target.value as KlCorridor)}
                className="w-full h-10 px-3 text-sm bg-white border border-[#DCE3DA] rounded-lg focus:outline-none focus:border-[#0D6E59]"
              >
                {KL_CORRIDORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="sighting-location" className="block text-xs font-semibold text-[#141E1A]">
                Specific Spot / Landmark
              </label>
              <input
                id="sighting-location"
                type="text"
                required
                maxLength={VALIDATION_LIMITS.LOCATION_MAX}
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="e.g., Bridge near Laman Perdana"
                className="w-full h-10 px-3 text-sm bg-white border border-[#DCE3DA] rounded-lg focus:outline-none focus:border-[#0D6E59]"
              />
            </div>
          </div>

          {/* Coordinates Bar */}
          <div className="p-3.5 rounded-lg bg-[#F8F9F7] border border-[#DCE3DA] flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-[#141E1A]">Pinned Coordinates</div>
              <div className="text-xs font-mono tabular-nums text-[#4A5A52]">
                {formatCoordinates(lat, lng)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleUseGps}
                className="px-3 py-2 text-xs font-medium bg-white border border-[#DCE3DA] rounded-lg hover:bg-[#F3F6F3] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Crosshair className="w-3.5 h-3.5 text-[#0D6E59]" />
                <span>Use GPS</span>
              </button>
              <button
                type="button"
                onClick={onStartMapPick}
                className="px-3 py-2 text-xs font-medium bg-white border border-[#DCE3DA] rounded-lg hover:bg-[#F3F6F3] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <MapPin className="w-3.5 h-3.5 text-[#C26D1F]" />
                <span>Pick on Map</span>
              </button>
            </div>
          </div>

          {/* Field Notes */}
          <div className="space-y-1.5">
            <label htmlFor="sighting-notes" className="block text-xs font-semibold text-[#141E1A]">
              Field Notes & Direction of Travel
            </label>
            <textarea
              id="sighting-notes"
              rows={3}
              maxLength={VALIDATION_LIMITS.NOTES_MAX}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Share which direction they are heading, pups present, or water conditions..."
              className="w-full p-3 text-sm bg-white border border-[#DCE3DA] rounded-lg focus:outline-none focus:border-[#0D6E59] resize-none"
            />
            <div className="text-right text-[11px] font-mono tabular-nums text-[#74847B]">
              {notes.length}/{VALIDATION_LIMITS.NOTES_MAX}
            </div>
          </div>

          <div className="pt-2 border-t border-[#EDF1EC] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[#4A5A52] hover:text-[#141E1A] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isCompressing}
              className="px-5 py-2.5 text-sm font-medium bg-[#0D6E59] text-white rounded-lg hover:bg-[#095444] disabled:opacity-50 transition-colors inline-flex items-center gap-2 whitespace-nowrap"
            >
              <Camera className="w-4 h-4" />
              <span>{isSubmitting ? 'Publishing...' : 'Publish Live Sighting'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
