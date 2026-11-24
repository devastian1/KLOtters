import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { collection, limit, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import {
  Camera,
  CheckCircle2,
  Clock,
  Compass,
  LogIn,
  LogOut,
  MapPin,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { OfflineIndicator } from './components/OfflineIndicator';
import { OtterMap } from './components/OtterMap';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ReportSightingModal } from './components/ReportSightingModal';
import { ResilientImage } from './components/ResilientImage';
import { SightingDetailModal } from './components/SightingDetailModal';
import { WeeklyActivityChart } from './components/WeeklyActivityChart';
import {
  CURATED_BASELINE_SIGHTINGS,
  KL_ETIQUETTE_RULES,
  KL_HOTSPOTS,
  SPECIES_FIELD_GUIDE,
} from './data/klOtterData';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { KlCorridor, OtterSpecies, Sighting, SIGHTING_SPECIES } from './types';
import { formatRelativeTime } from './utils/formatters';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

export default function App() {
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [liveSightings, setLiveSightings] = useState<Sighting[]>([]);
  const [isLoadingSightings, setIsLoadingSightings] = useState(true);

  const [activeCorridor, setActiveCorridor] = useState<KlCorridor | 'All'>('All');
  const [speciesFilter, setSpeciesFilter] = useState<OtterSpecies | 'All'>('All');
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedSighting, setSelectedSighting] = useState<Sighting | null>(null);
  const [hoveredSightingId, setHoveredSightingId] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<{
    center: { lat: number; lng: number };
    zoom: number;
    nonce: number;
  } | null>(null);

  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isPickingOnMap, setIsPickingOnMap] = useState(false);
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const handleQuota = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const sightingsPath = 'sightings';
    const sightingsQuery = query(
      collection(db, sightingsPath),
      where('visibility', '==', 'public'),
      limit(100)
    );

    const unsubscribe = onSnapshot(
      sightingsQuery,
      (snapshot) => {
        const docs: Sighting[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const createdAtMs =
            data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now();
          const updatedAtMs =
            data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : createdAtMs;

          return {
            id: docSnap.id,
            authorId: String(data.authorId || ''),
            authorName: String(data.authorName || 'KL Spotter'),
            title: String(data.title || 'Otter sighting'),
            species: (data.species as OtterSpecies) || 'Smooth-coated Otter',
            count: Number(data.count) || 1,
            activity: data.activity || 'Swimming',
            corridor: data.corridor || 'Other KL Waterway',
            locationName: String(data.locationName || 'Kuala Lumpur'),
            lat: Number(data.lat) || 3.1492,
            lng: Number(data.lng) || 101.6945,
            notes: String(data.notes || ''),
            photoUrl: String(data.photoUrl || ''),
            confirmations: Number(data.confirmations) || 0,
            visibility: 'public',
            createdAtMs,
            updatedAtMs,
            isCuratedBaseline: false,
          };
        });
        docs.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setLiveSightings(docs);
        setIsLoadingSightings(false);
      },
      (err) => {
        setIsLoadingSightings(false);
        handleFirestoreError(err, OperationType.LIST, sightingsPath);
      }
    );

    return () => unsubscribe();
  }, []);

  const allSightings = useMemo(() => {
    return [...liveSightings, ...CURATED_BASELINE_SIGHTINGS].sort(
      (a, b) => b.createdAtMs - a.createdAtMs
    );
  }, [liveSightings]);

  // Keep selectedSighting synced when live confirmations or notes update
  const activeDetailSighting = useMemo(() => {
    if (!selectedSighting) return null;
    return allSightings.find((s) => s.id === selectedSighting.id) || selectedSighting;
  }, [allSightings, selectedSighting]);

  const filteredSightings = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return allSightings.filter((s) => {
      if (activeCorridor !== 'All' && s.corridor !== activeCorridor) return false;
      if (speciesFilter !== 'All' && s.species !== speciesFilter) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.locationName.toLowerCase().includes(q) ||
        s.corridor.toLowerCase().includes(q) ||
        s.authorName.toLowerCase().includes(q)
      );
    });
  }, [activeCorridor, allSightings, searchTerm, speciesFilter]);

  const totalOttersReported = useMemo(() => {
    return allSightings.reduce((sum, s) => sum + s.count, 0);
  }, [allSightings]);

  const activeCorridorCount = useMemo(() => {
    return new Set(allSightings.map((s) => s.corridor)).size;
  }, [allSightings]);

  const handleSignIn = useCallback(async (): Promise<User | null> => {
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in cancelled.';
      if (!message.includes('popup-closed-by-user')) {
        setAuthError('Could not complete Google sign-in. Please allow popups and try again.');
      }
      return null;
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOut(auth);
  }, []);

  const handleCenterOnSighting = useCallback((sighting: Sighting) => {
    setFocusTarget({
      center: { lat: sighting.lat, lng: sighting.lng },
      zoom: 16,
      nonce: Date.now(),
    });
    document.getElementById('live-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleSelectHotspot = useCallback((corridor: KlCorridor) => {
    setActiveCorridor(corridor);
    const hotspot = KL_HOTSPOTS.find((h) => h.corridor === corridor);
    if (hotspot) {
      setFocusTarget({
        center: hotspot.center,
        zoom: hotspot.zoom,
        nonce: Date.now(),
      });
    }
    document.getElementById('live-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handlePickMapLocation = useCallback((coords: { lat: number; lng: number }) => {
    setPickedCoords(coords);
    setIsPickingOnMap(false);
    setIsReportOpen(true);
  }, []);

  const mapContent = (
    <OtterMap
      sightings={filteredSightings}
      selectedSightingId={activeDetailSighting?.id || null}
      hoveredSightingId={hoveredSightingId}
      activeCorridor={activeCorridor}
      focusTarget={focusTarget}
      isPickingLocation={isPickingOnMap}
      draftCoords={pickedCoords}
      onSelectSighting={(sighting) => setSelectedSighting(sighting)}
      onHoverSighting={setHoveredSightingId}
      onPickLocation={handlePickMapLocation}
      onCorridorSelect={setActiveCorridor}
    />
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F6F3] bg-[radial-gradient(ellipse_at_top_left,_rgba(13,110,89,0.065),_transparent_52%)] text-[#141E1A]">
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-white/85 backdrop-blur-md border-b border-[#D7E0D6]/90 sticky top-0 z-40">
        <div className="max-w-[1360px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element brand wordmark */}
          <a
            href="#top"
            className="font-display text-xl font-bold tracking-tight text-[#141E1A] whitespace-nowrap shrink-0"
          >
            KLOtters
          </a>

          {/* Zone 2: Concise single-line text nav links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#4A5A52]">
            <a
              href="#live-map"
              className="hover:text-[#0D6E59] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Live Map
            </a>
            <a
              href="#photo-feed"
              className="hover:text-[#0D6E59] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Photo Feed
            </a>
            <a
              href="#hotspots"
              className="hover:text-[#0D6E59] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              KL Hotspots
            </a>
            <a
              href="#field-guide"
              className="hover:text-[#0D6E59] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Field Guide
            </a>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsPickingOnMap(false);
                setIsReportOpen(true);
              }}
              className="px-4 py-2 text-xs sm:text-sm font-medium bg-[#0D6E59] text-white rounded-xl shadow-[0_2px_10px_-2px_rgba(13,110,89,0.45)] hover:bg-[#095444] active:scale-[0.98] transition-all inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Camera className="w-4 h-4" />
              <span>Report Sighting</span>
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Compact Workspace Title & Account Bar */}
        <section className="max-w-[1360px] mx-auto px-6 pt-8 pb-6 border-b border-[#DCE3DA]/80">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-[-0.025em] text-[#141E1A] text-balance">
                Kuala Lumpur River Otter Watch
              </h1>
              <p className="text-sm sm:text-base text-[#4A5A52] leading-relaxed">
                Track live urban otter rafts, verify coordinates, and share riverbank photos across
                Klang Valley lakes and waterways.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              {/* Unboxed Quantitative Summary */}
              <div className="flex items-center gap-5 text-xs">
                <div>
                  <div className="text-[#6B7B72]">Logged Sightings</div>
                  <div className="font-mono text-base font-semibold tabular-nums text-[#141E1A]">
                    {allSightings.length}
                  </div>
                </div>
                <div className="h-7 w-px bg-[#DCE3DA]" aria-hidden="true" />
                <div>
                  <div className="text-[#6B7B72]">Otters Counted</div>
                  <div className="font-mono text-base font-semibold tabular-nums text-[#141E1A]">
                    {totalOttersReported}
                  </div>
                </div>
                <div className="h-7 w-px bg-[#DCE3DA]" aria-hidden="true" />
                <div>
                  <div className="text-[#6B7B72]">Active Waterways</div>
                  <div className="font-mono text-base font-semibold tabular-nums text-[#141E1A]">
                    {activeCorridorCount}
                  </div>
                </div>
              </div>

              <div className="h-7 w-px bg-[#DCE3DA] hidden sm:block" aria-hidden="true" />

              {/* Install & Google Auth Controls */}
              <div className="flex flex-wrap items-center gap-2.5">
                <PWAInstallButton />

                {authReady && (
                  <div>
                    {user ? (
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-[#141E1A] max-w-[150px] truncate">
                          {user.displayName || user.email}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleSignOut()}
                          className="px-3.5 py-2 text-xs font-medium text-[#4A5A52] bg-white border border-[#D7E0D6] rounded-xl hover:bg-[#F3F6F3] hover:border-[#B6C5B9] transition-all inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleSignIn()}
                        className="px-3.5 py-2 text-xs font-medium text-[#141E1A] bg-white border border-[#D7E0D6] rounded-xl shadow-2xs hover:bg-[#F3F6F3] hover:border-[#0D6E59]/50 transition-all inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <LogIn className="w-3.5 h-3.5 text-[#0D6E59]" />
                        <span>Sign In to Post</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {authError && (
            <p className="mt-3 text-xs text-[#8D261D]">{authError}</p>
          )}
        </section>

        {/* Primary Anchor: Map + Real-Time Sightings Feed */}
        <section id="live-map" className="max-w-[1360px] mx-auto px-6 py-7">
          {isPickingOnMap && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-[#FDF4EB] border border-[#F2D5B8] flex items-center justify-between gap-4">
              <span className="text-xs sm:text-sm font-medium text-[#8C490F]">
                Pin mode active: click any riverbank or lake on the map below to set your sighting coordinates.
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsPickingOnMap(false);
                  setIsReportOpen(true);
                }}
                className="px-3 py-1.5 text-xs font-medium bg-white border border-[#E5C19B] text-[#8C490F] rounded-md whitespace-nowrap"
              >
                Back to Form
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-6 items-start">
            {/* Interactive KL Google Map */}
            <div>
              {GOOGLE_MAPS_API_KEY ? (
                <APIProvider
                  apiKey={GOOGLE_MAPS_API_KEY}
                  libraries={['marker', 'places']}
                  language="en"
                  region="MY"
                >
                  {mapContent}
                </APIProvider>
              ) : (
                <div className="bg-white border border-[#DCE3DA] rounded-xl h-[540px] flex flex-col items-center justify-center p-8 text-center space-y-3">
                  <Compass className="w-8 h-8 text-[#0D6E59]" />
                  <h2 className="font-display text-lg font-semibold text-[#141E1A]">
                    Map Key Pending
                  </h2>
                  <p className="text-sm text-[#4A5A52] max-w-md">
                    Restart the server if the provisioned Google Maps API key has not been loaded into the environment yet.
                  </p>
                </div>
              )}
            </div>

            {/* Real-Time Sightings Stream */}
            <aside className="surface-card rounded-2xl overflow-hidden flex flex-col lg:h-[702px]">
              <div className="px-4 py-3.5 border-b border-[#E3EAE2] bg-[#FBFDFB] space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-base font-semibold text-[#141E1A] tracking-tight">
                    Live Sightings Stream
                  </h2>
                  <span className="font-mono text-xs tabular-nums text-[#5D6D64]">
                    {filteredSightings.length} visible
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-[#5D6D64] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Filter park, bridge, spotter..."
                      aria-label="Filter sightings"
                      className="w-full h-9 pl-8 pr-3 text-xs bg-white border border-[#D7E0D6] rounded-xl focus:outline-none focus:border-[#0D6E59] focus:ring-2 focus:ring-[#0D6E59]/15 transition-all"
                    />
                  </div>
                  <select
                    value={speciesFilter}
                    onChange={(e) => setSpeciesFilter(e.target.value as OtterSpecies | 'All')}
                    aria-label="Filter by otter species"
                    className="h-9 px-2.5 text-xs bg-white border border-[#D7E0D6] rounded-xl focus:outline-none focus:border-[#0D6E59] focus:ring-2 focus:ring-[#0D6E59]/15 transition-all"
                  >
                    <option value="All">All Species</option>
                    {SIGHTING_SPECIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto thin-scrollbar divide-y divide-[#EDF1EC]">
                {isLoadingSightings ? (
                  <div className="p-4 space-y-4">
                    {[1, 2, 3].map((idx) => (
                      <div key={idx} className="flex gap-3 animate-pulse">
                        <div className="w-24 h-20 rounded-lg bg-[#E9EFEA] shrink-0" />
                        <div className="flex-1 space-y-2 py-1">
                          <div className="h-3 bg-[#E9EFEA] rounded w-2/3" />
                          <div className="h-4 bg-[#E9EFEA] rounded w-full" />
                          <div className="h-3 bg-[#E9EFEA] rounded w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredSightings.length === 0 ? (
                  <div className="p-8 text-center space-y-3">
                    <p className="text-sm font-medium text-[#141E1A]">
                      No sightings match this filter
                    </p>
                    <p className="text-xs text-[#5D6D64]">
                      Clear your corridor filter or be the first to log an otter raft here today.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCorridor('All');
                        setSpeciesFilter('All');
                        setSearchTerm('');
                      }}
                      className="px-3.5 py-2 text-xs font-medium bg-[#F3F6F3] text-[#141E1A] border border-[#DCE3DA] rounded-lg hover:bg-[#E9EFEA]"
                    >
                      Reset Filters
                    </button>
                  </div>
                ) : (
                  filteredSightings.map((sighting) => {
                    const isSelected = activeDetailSighting?.id === sighting.id;
                    return (
                      <article
                        key={sighting.id}
                        onMouseEnter={() => setHoveredSightingId(sighting.id)}
                        onMouseLeave={() => setHoveredSightingId(null)}
                        className={`group p-4 transition-colors cursor-pointer ${
                          isSelected ? 'bg-[#EBF4F0]' : 'hover:bg-[#F5F8F5]'
                        }`}
                        onClick={() => setSelectedSighting(sighting)}
                      >
                        <div className="flex gap-3.5">
                          <div className="w-24 h-20 rounded-xl overflow-hidden border border-[#DCE3DA] shrink-0 bg-[#E9EFEA]">
                            <ResilientImage
                              src={sighting.photoUrl}
                              alt={sighting.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="text-xs text-[#5D6D64] truncate">
                              {sighting.corridor} · {formatRelativeTime(sighting.createdAtMs)}
                            </div>
                            <h3 className="font-display text-sm font-semibold text-[#141E1A] leading-snug line-clamp-2 group-hover:text-[#0D6E59] transition-colors">
                              {sighting.title}
                            </h3>
                            <div className="text-xs text-[#4A5A52] flex items-center gap-1.5 flex-wrap">
                              <span>{sighting.species}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {sighting.count} {sighting.count === 1 ? 'otter' : 'otters'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 text-[#0D6E59] font-medium tabular-nums">
                                <CheckCircle2 className="w-3 h-3" />
                                {sighting.confirmations}
                              </span>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </aside>
          </div>
        </section>

        {/* Weekly Activity Bar Chart (Recharts) */}
        <WeeklyActivityChart sightings={allSightings} activeCorridor={activeCorridor} />

        {/* Photo Feed Section — Editorial Bento Showcase */}
        <section id="photo-feed" className="max-w-[1360px] mx-auto px-6 py-11 border-t border-[#DCE3DA]/80">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#141E1A]">
                Recent Kuala Lumpur Field Photos
              </h2>
              <p className="text-sm text-[#4A5A52] mt-1">
                Click any sighting photograph to inspect GPS coordinates, verify the report, or post movement updates.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsReportOpen(true)}
              className="px-4 py-2 text-xs font-medium text-[#0D6E59] bg-white border border-[#D7E0D6] rounded-xl hover:bg-[#F3F6F3] hover:border-[#0D6E59]/50 transition-all whitespace-nowrap self-start sm:self-auto"
            >
              Share a Photo
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {allSightings.slice(0, 7).map((sighting, index) => {
              const isFeatured = index === 0 && allSightings.length >= 3;
              if (isFeatured) {
                return (
                  <button
                    key={sighting.id}
                    type="button"
                    onClick={() => setSelectedSighting(sighting)}
                    className="group relative text-left sm:col-span-2 lg:col-span-2 lg:row-span-2 min-h-[300px] lg:min-h-[420px] rounded-2xl overflow-hidden border border-[#D7E0D6] shadow-[0_1px_2px_rgba(16,32,24,0.04),0_12px_32px_-16px_rgba(16,32,24,0.12)]"
                  >
                    <ResilientImage
                      src={sighting.photoUrl}
                      alt={sighting.title}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent"
                    />
                    <div className="relative h-full flex flex-col justify-end p-6 text-white space-y-2">
                      <div className="text-xs text-white/85">
                        Featured · {sighting.corridor} · {formatRelativeTime(sighting.createdAtMs)}
                      </div>
                      <h3 className="font-display text-xl sm:text-2xl font-semibold leading-snug text-balance">
                        {sighting.title}
                      </h3>
                      <div className="text-xs text-white/85 flex items-center justify-between gap-3 pt-1">
                        <span>
                          {sighting.authorName} · {sighting.species}
                        </span>
                        <span className="font-mono tabular-nums text-emerald-300 font-medium">
                          {sighting.count} {sighting.count === 1 ? 'otter' : 'otters'}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              }

              return (
                <button
                  key={sighting.id}
                  type="button"
                  onClick={() => setSelectedSighting(sighting)}
                  className="group text-left surface-card surface-interactive rounded-2xl overflow-hidden flex flex-col"
                >
                  <div className="aspect-[4/3] w-full overflow-hidden bg-[#E9EFEA]">
                    <ResilientImage
                      src={sighting.photoUrl}
                      alt={sighting.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                    />
                  </div>
                  <div className="p-4 space-y-1.5 flex-1 flex flex-col justify-between">
                    <div className="space-y-1">
                      <div className="text-xs text-[#5D6D64] truncate">
                        {sighting.corridor} · {formatRelativeTime(sighting.createdAtMs)}
                      </div>
                      <h3 className="font-display text-sm font-semibold text-[#141E1A] leading-snug line-clamp-2 group-hover:text-[#0D6E59] transition-colors">
                        {sighting.title}
                      </h3>
                    </div>
                    <div className="text-xs text-[#4A5A52] pt-1.5 flex items-center justify-between gap-2">
                      <span className="truncate">{sighting.authorName}</span>
                      <span className="font-mono tabular-nums text-[#0D6E59] font-medium shrink-0">
                        {sighting.count} {sighting.count === 1 ? 'otter' : 'otters'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Kuala Lumpur Otter Hotspots */}
        <section id="hotspots" className="max-w-[1360px] mx-auto px-6 py-11 border-t border-[#DCE3DA]/80">
          <div className="max-w-2xl mb-7">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#141E1A]">
              Kuala Lumpur Waterway Corridors
            </h2>
            <p className="text-sm text-[#4A5A52] mt-1">
              Regularly patrolled lakes and river reaches where resident rafts forage at dawn and dusk.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {KL_HOTSPOTS.map((spot) => (
              <div
                key={spot.corridor}
                className="surface-card surface-interactive rounded-2xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-base font-semibold text-[#141E1A]">
                      {spot.corridor}
                    </h3>
                    <span className="font-mono text-xs tabular-nums text-[#5D6D64]">
                      {spot.center.lat.toFixed(3)}°N
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[#0D6E59]">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span className="tabular-nums">{spot.peakWindow}</span>
                  </div>
                  <p className="text-xs text-[#4A5A52] leading-relaxed">{spot.notes}</p>
                  <div className="text-xs text-[#5D6D64] pt-1">
                    <span className="font-medium text-[#141E1A]">Vantage: </span>
                    {spot.vantagePoint}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleSelectHotspot(spot.corridor)}
                  className="w-full py-2.5 px-3 text-xs font-medium bg-[#F7F9F6] border border-[#D7E0D6] text-[#141E1A] rounded-xl hover:bg-[#0D6E59] hover:text-white hover:border-[#0D6E59] transition-all inline-flex items-center justify-center gap-1.5"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Center on Map</span>
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Field Guide & Responsible Spotting */}
        <section id="field-guide" className="max-w-[1360px] mx-auto px-6 py-11 border-t border-[#DCE3DA]/80">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#141E1A]">
                  KL Otter Species Guide
                </h2>
                <p className="text-sm text-[#4A5A52] mt-1">
                  Key field markers to distinguish the three species recorded across Selangor and Kuala Lumpur.
                </p>
              </div>
              <div className="surface-card rounded-2xl divide-y divide-[#E4ECE4]">
                {SPECIES_FIELD_GUIDE.map((item) => (
                  <div key={item.name} className="p-5 space-y-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-display text-base font-semibold text-[#141E1A]">
                        {item.name}
                      </h3>
                      <span className="text-xs italic text-[#5D6D64]">{item.scientific}</span>
                    </div>
                    <div className="text-xs text-[#0D6E59] font-medium">
                      {item.status} · {item.size}
                    </div>
                    <p className="text-xs text-[#4A5A52] leading-relaxed">{item.markers}</p>
                    <p className="text-xs text-[#6B7B72]">Commonly seen: {item.habitat}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#141E1A]">
                  Responsible Riverbank Etiquette
                </h2>
                <p className="text-sm text-[#4A5A52] mt-1">
                  Urban otters thrive in Kuala Lumpur only when spotters keep safe distance and avoid disruption.
                </p>
              </div>
              <div className="surface-card rounded-2xl divide-y divide-[#E4ECE4]">
                {KL_ETIQUETTE_RULES.map((rule, idx) => (
                  <div key={rule.title} className="p-5 flex items-start gap-3.5">
                    <span className="font-mono text-xs font-semibold tabular-nums text-[#0D6E59] pt-0.5">
                      0{idx + 1}.
                    </span>
                    <div className="space-y-1">
                      <h3 className="font-display text-sm font-semibold text-[#141E1A]">
                        {rule.title}
                      </h3>
                      <p className="text-xs text-[#4A5A52] leading-relaxed">{rule.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 rounded-2xl bg-[#EAF3EF] border border-[#C7DBD3] flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-[#0D6E59] shrink-0 mt-0.5" />
                <p className="text-xs text-[#23473C] leading-relaxed">
                  Spot an injured otter or pup trapped in a storm drain? Contact PERHILITAN Wildlife
                  Hotline or local KL wildlife rescuers immediately rather than handling wild otters directly.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#D7E0D6] bg-white/90 py-7 px-6">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#5D6D64]">
          <div>
            KLOtters · Community river otter watch for Greater Kuala Lumpur & Klang Valley
          </div>
          <div>
            Maps powered by Google Maps Platform · Real-time sightings synced via Firestore
          </div>
        </div>
      </footer>

      <ReportSightingModal
        isOpen={isReportOpen}
        user={user}
        pickedCoords={pickedCoords}
        isPickingOnMap={isPickingOnMap}
        onStartMapPick={() => {
          setIsPickingOnMap(true);
          document.getElementById('live-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        onClose={() => {
          setIsReportOpen(false);
          setIsPickingOnMap(false);
        }}
        onSignIn={handleSignIn}
        onCreated={(id) => {
          const created = liveSightings.find((s) => s.id === id);
          if (created) {
            setSelectedSighting(created);
          }
        }}
      />

      <SightingDetailModal
        sighting={activeDetailSighting}
        user={user}
        onClose={() => setSelectedSighting(null)}
        onCenterOnMap={handleCenterOnSighting}
        onSignIn={handleSignIn}
      />

      <OfflineIndicator />
    </div>
  );
}
