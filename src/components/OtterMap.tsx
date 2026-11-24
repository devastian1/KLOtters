import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdvancedMarker,
  APILoadingStatus,
  InfoWindow,
  Map as GoogleMap,
  MapMouseEvent,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Compass, Crosshair, MapPin, RotateCcw, Search, X } from 'lucide-react';
import { KL_DEFAULT_CENTER, KL_HOTSPOTS } from '../data/klOtterData';
import { useAutocompleteSuggestions } from '../hooks/useAutocompleteSuggestions';
import { KlCorridor, Sighting } from '../types';
import { formatCoordinates, formatRelativeTime, isWithinKlBounds } from '../utils/formatters';
import { ResilientImage } from './ResilientImage';

interface OtterMapProps {
  sightings: Sighting[];
  selectedSightingId: string | null;
  hoveredSightingId: string | null;
  activeCorridor: KlCorridor | 'All';
  focusTarget: { center: { lat: number; lng: number }; zoom: number; nonce: number } | null;
  isPickingLocation: boolean;
  draftCoords: { lat: number; lng: number } | null;
  onSelectSighting: (sighting: Sighting) => void;
  onHoverSighting: (id: string | null) => void;
  onPickLocation: (coords: { lat: number; lng: number }) => void;
  onCorridorSelect: (corridor: KlCorridor | 'All') => void;
}

interface SightingMarkerProps {
  sighting: Sighting;
  isSelected: boolean;
  isHovered: boolean;
  zIndex: number;
  onMarkerClick: (
    sighting: Sighting,
    marker: google.maps.marker.AdvancedMarkerElement
  ) => void;
  onHover: (id: string | null) => void;
}

function SightingAdvancedMarker({
  sighting,
  isSelected,
  isHovered,
  zIndex,
  onMarkerClick,
  onHover,
}: SightingMarkerProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  const handleClick = useCallback(() => {
    if (marker) {
      onMarkerClick(sighting, marker);
    }
  }, [marker, onMarkerClick, sighting]);

  const isRecent = Date.now() - sighting.createdAtMs < 1000 * 60 * 120;

  return (
    <AdvancedMarker
      ref={markerRef}
      position={{ lat: sighting.lat, lng: sighting.lng }}
      zIndex={zIndex}
      title={`${sighting.count} ${sighting.species} · ${sighting.locationName}`}
      onClick={handleClick}
      onMouseEnter={() => onHover(sighting.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div
        className={`group relative flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-xl border transition-all duration-150 cursor-pointer ${
          isSelected
            ? 'bg-[#0D6E59] text-white border-[#084639] scale-110 shadow-[0_8px_20px_-6px_rgba(13,110,89,0.55)]'
            : isHovered
            ? 'bg-[#141E1A] text-white border-[#141E1A] scale-105 shadow-[0_8px_18px_-6px_rgba(20,30,26,0.45)]'
            : isRecent
            ? 'bg-white/95 backdrop-blur-sm text-[#141E1A] border-[#0D6E59]/70 shadow-[0_4px_12px_-3px_rgba(16,32,24,0.22)]'
            : 'bg-white/95 backdrop-blur-sm text-[#141E1A] border-[#C8D3C8] shadow-[0_3px_10px_-3px_rgba(16,32,24,0.18)]'
        }`}
      >
        <span
          className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono text-xs font-semibold tabular-nums ${
            isSelected
              ? 'bg-white/20 text-white'
              : isHovered
              ? 'bg-white/20 text-white'
              : isRecent
              ? 'bg-[#0D6E59] text-white'
              : 'bg-[#E9EFEA] text-[#141E1A]'
          }`}
        >
          {sighting.count}
        </span>
        <span className="text-xs font-semibold whitespace-nowrap max-w-[116px] truncate">
          {sighting.corridor === 'Perdana Botanical Gardens'
            ? 'Perdana Lake'
            : sighting.corridor === 'Kepong Metropolitan'
            ? 'Kepong Park'
            : sighting.corridor}
        </span>
        <span
          aria-hidden="true"
          className={`w-2 h-2 rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2 border-r border-b ${
            isSelected
              ? 'bg-[#0D6E59] border-[#084639]'
              : isHovered
              ? 'bg-[#141E1A] border-[#141E1A]'
              : isRecent
              ? 'bg-white border-[#0D6E59]/70'
              : 'bg-white border-[#C8D3C8]'
          }`}
        />
      </div>
    </AdvancedMarker>
  );
}

function MapCameraController({
  focusTarget,
  activeCorridor,
}: {
  focusTarget: { center: { lat: number; lng: number }; zoom: number; nonce: number } | null;
  activeCorridor: KlCorridor | 'All';
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !focusTarget) return;
    map.panTo(focusTarget.center);
    map.setZoom(focusTarget.zoom);
  }, [map, focusTarget]);

  useEffect(() => {
    if (!map) return;
    if (activeCorridor === 'All') {
      map.panTo(KL_DEFAULT_CENTER);
      map.setZoom(12);
      return;
    }
    const hotspot = KL_HOTSPOTS.find((h) => h.corridor === activeCorridor);
    if (hotspot) {
      map.panTo(hotspot.center);
      map.setZoom(hotspot.zoom);
    }
  }, [map, activeCorridor]);

  return null;
}

function PlaceSearchControl({
  onSelectPlaceCoords,
}: {
  onSelectPlaceCoords: (coords: { lat: number; lng: number; label: string }) => void;
}) {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const { suggestions, isLoading, resetSession } = useAutocompleteSuggestions(query);

  const handleSelectSuggestion = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!placesLib || !suggestion.placePrediction) return;
      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location', 'viewport'],
        });
        const loc = place.location;
        if (loc) {
          const lat = loc.lat();
          const lng = loc.lng();
          if (map) {
            if (place.viewport) {
              map.fitBounds(place.viewport);
            } else {
              map.panTo({ lat, lng });
              map.setZoom(15);
            }
          }
          onSelectPlaceCoords({
            lat,
            lng,
            label: place.displayName || suggestion.placePrediction.text.text,
          });
        }
        setQuery(suggestion.placePrediction.text.text);
        setOpen(false);
        resetSession();
      } catch (err) {
        const msg = String(err);
        if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      }
    },
    [map, onSelectPlaceCoords, placesLib, resetSession]
  );

  return (
    <div className="relative w-full sm:w-72">
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-[#5D6D64] absolute left-3 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search KL river, park or bridge..."
          aria-label="Search Kuala Lumpur locations"
          className="w-full h-10 pl-9 pr-8 text-sm bg-white border border-[#D7E0D6] rounded-xl text-[#141E1A] placeholder:text-[#74847B] focus:outline-none focus:border-[#0D6E59] focus:ring-2 focus:ring-[#0D6E59]/15 transition-all"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              resetSession();
            }}
            aria-label="Clear search"
            className="absolute right-2 p-1 text-[#5D6D64] hover:text-[#141E1A]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && query.trim().length > 0 && (suggestions.length > 0 || isLoading) && (
        <ul className="absolute left-0 right-0 top-11 z-30 bg-white border border-[#DCE3DA] rounded-lg shadow-lg overflow-hidden divide-y divide-[#EEF2ED]">
          {isLoading && suggestions.length === 0 && (
            <li className="px-3 py-2.5 text-xs text-[#5D6D64]">Searching Kuala Lumpur...</li>
          )}
          {suggestions.slice(0, 5).map((suggestion, idx) => (
            <li key={idx}>
              <button
                type="button"
                onClick={() => void handleSelectSuggestion(suggestion)}
                className="w-full text-left px-3 py-2.5 text-xs text-[#141E1A] hover:bg-[#F3F6F3] transition-colors flex items-start gap-2"
              >
                <MapPin className="w-3.5 h-3.5 text-[#0D6E59] shrink-0 mt-0.5" />
                <span className="line-clamp-2">{suggestion.placePrediction?.text.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OtterMap({
  sightings,
  selectedSightingId,
  hoveredSightingId,
  activeCorridor,
  focusTarget,
  isPickingLocation,
  draftCoords,
  onSelectSighting,
  onHoverSighting,
  onPickLocation,
  onCorridorSelect,
}: OtterMapProps) {
  const apiStatus = useApiLoadingStatus();
  const map = useMap();
  const [infoSighting, setInfoSighting] = useState<Sighting | null>(null);
  const [infoAnchor, setInfoAnchor] =
    useState<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);

  const sortedMarkers = useMemo(() => {
    return [...sightings]
      .sort((a, b) => b.lat - a.lat)
      .map((item, index) => ({ sighting: item, baseZIndex: index + 1 }));
  }, [sightings]);

  const handleMarkerClick = useCallback(
    (sighting: Sighting, marker: google.maps.marker.AdvancedMarkerElement) => {
      setInfoSighting(sighting);
      setInfoAnchor(marker);
      onSelectSighting(sighting);
    },
    [onSelectSighting]
  );

  const handleMapClick = useCallback(
    (ev: MapMouseEvent) => {
      if (!isPickingLocation || !ev.detail.latLng) return;
      const { lat, lng } = ev.detail.latLng;
      if (!isWithinKlBounds(lat, lng)) {
        setGeoMessage('Please pick a location within Greater Kuala Lumpur / Klang Valley.');
        return;
      }
      setGeoMessage(null);
      onPickLocation({ lat, lng });
    },
    [isPickingLocation, onPickLocation]
  );

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoMessage('Geolocation is not supported by this browser.');
      return;
    }
    setGeoMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        if (!isWithinKlBounds(lat, lng)) {
          setGeoMessage('Your GPS appears outside Klang Valley. Centered on Kuala Lumpur.');
          map?.panTo(KL_DEFAULT_CENTER);
          map?.setZoom(12);
          return;
        }
        map?.panTo({ lat, lng });
        map?.setZoom(15);
        if (isPickingLocation) {
          onPickLocation({ lat, lng });
        }
      },
      () => {
        setGeoMessage('Location permission denied. Click any point on the map instead.');
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  }, [isPickingLocation, map, onPickLocation]);

  const handleResetView = useCallback(() => {
    setGeoMessage(null);
    onCorridorSelect('All');
    map?.panTo(KL_DEFAULT_CENTER);
    map?.setZoom(12);
  }, [map, onCorridorSelect]);

  const mapUnavailable =
    apiStatus === APILoadingStatus.AUTH_FAILURE || apiStatus === APILoadingStatus.FAILED;

  return (
    <div className="surface-card rounded-2xl overflow-hidden flex flex-col">
      {/* Workspace Map Toolbar */}
      <div className="px-4 py-3 border-b border-[#E3EAE2] flex flex-wrap items-center justify-between gap-3 bg-[#FBFDFB]">
        <PlaceSearchControl
          onSelectPlaceCoords={({ lat, lng }) => {
            if (isPickingLocation && isWithinKlBounds(lat, lng)) {
              onPickLocation({ lat, lng });
            }
          }}
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLocateMe}
            className="h-10 px-3.5 text-xs font-medium text-[#141E1A] bg-white border border-[#D7E0D6] rounded-xl hover:bg-[#F3F6F3] hover:border-[#B6C5B9] transition-all inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Crosshair className="w-3.5 h-3.5 text-[#0D6E59]" />
            <span>Near Me</span>
          </button>
          <button
            type="button"
            onClick={handleResetView}
            className="h-10 px-3.5 text-xs font-medium text-[#4A5A52] bg-white border border-[#D7E0D6] rounded-xl hover:bg-[#F3F6F3] hover:border-[#B6C5B9] transition-all inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>KL Overview</span>
          </button>
        </div>
      </div>

      {/* Corridor Quick-Jump Filter Strip */}
      <div className="px-4 py-2.5 border-b border-[#EDF1EC] flex items-center gap-1.5 overflow-x-auto thin-scrollbar bg-[#F6F8F5]">
        <button
          type="button"
          onClick={() => onCorridorSelect('All')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 ${
            activeCorridor === 'All'
              ? 'bg-[#0D6E59] text-white shadow-xs'
              : 'text-[#4A5A52] hover:text-[#141E1A] hover:bg-white'
          }`}
        >
          All KL Waterways
        </button>
        {KL_HOTSPOTS.map((hotspot) => (
          <button
            key={hotspot.corridor}
            type="button"
            onClick={() => onCorridorSelect(hotspot.corridor)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 ${
              activeCorridor === hotspot.corridor
                ? 'bg-[#0D6E59] text-white shadow-xs'
                : 'text-[#4A5A52] hover:text-[#141E1A] hover:bg-white'
            }`}
          >
            {hotspot.corridor}
          </button>
        ))}
      </div>

      {isPickingLocation && (
        <div className="px-4 py-2 bg-[#FDF4EB] border-b border-[#F2D5B8] text-xs font-medium text-[#8C490F] flex items-center justify-between gap-2">
          <span>Click anywhere on the Kuala Lumpur map to pin the exact otter sighting spot.</span>
          {draftCoords && (
            <span className="font-mono tabular-nums shrink-0">
              {formatCoordinates(draftCoords.lat, draftCoords.lng)}
            </span>
          )}
        </div>
      )}

      {geoMessage && (
        <div className="px-4 py-2 bg-[#FBF4E4] border-b border-[#EAD9B0] text-xs text-[#705315] flex items-center justify-between">
          <span>{geoMessage}</span>
          <button
            type="button"
            onClick={() => setGeoMessage(null)}
            className="text-xs underline ml-3 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Map Canvas with Explicit Height (CF2) */}
      <div className="relative w-full h-[460px] lg:h-[580px] bg-[#E8EFE9]">
        {mapUnavailable ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center space-y-3">
            <Compass className="w-8 h-8 text-[#0D6E59]" />
            <h3 className="font-display text-lg font-semibold text-[#141E1A]">
              Kuala Lumpur Waterway Map Unavailable
            </h3>
            <p className="text-sm text-[#4A5A52] max-w-md">
              Interactive map tiles could not be loaded right now. All live otter sightings and photo
              reports remain active in the stream beside this panel.
            </p>
          </div>
        ) : (
          <GoogleMap
            mapId="DEMO_MAP_ID"
            defaultCenter={KL_DEFAULT_CENTER}
            defaultZoom={12}
            gestureHandling="greedy"
            disableDefaultUI={false}
            streetViewControl={false}
            mapTypeControl={false}
            onClick={handleMapClick}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%' }}
          >
            <MapCameraController focusTarget={focusTarget} activeCorridor={activeCorridor} />

            {sortedMarkers.map(({ sighting, baseZIndex }) => {
              const isSelected = selectedSightingId === sighting.id;
              const isHovered = hoveredSightingId === sighting.id;
              const zIndex = isSelected ? 1000 : isHovered ? 999 : baseZIndex;

              return (
                <SightingAdvancedMarker
                  key={sighting.id}
                  sighting={sighting}
                  isSelected={isSelected}
                  isHovered={isHovered}
                  zIndex={zIndex}
                  onMarkerClick={handleMarkerClick}
                  onHover={onHoverSighting}
                />
              );
            })}

            {isPickingLocation && draftCoords && (
              <AdvancedMarker position={draftCoords} zIndex={1200} title="New sighting pin">
                <div className="w-8 h-8 rounded-full bg-[#C26D1F] border-2 border-white shadow-md flex items-center justify-center text-white">
                  <MapPin className="w-4 h-4" />
                </div>
              </AdvancedMarker>
            )}

            {infoSighting && infoAnchor && (
              <InfoWindow
                anchor={infoAnchor}
                maxWidth={270}
                onCloseClick={() => {
                  setInfoSighting(null);
                  setInfoAnchor(null);
                }}
              >
                <div className="w-60 space-y-2 text-[#141E1A]">
                  <div className="h-32 w-full rounded-md overflow-hidden bg-[#E9EFEA]">
                    <ResilientImage
                      src={infoSighting.photoUrl}
                      alt={infoSighting.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-[#4A5A52]">
                      {infoSighting.species} · {infoSighting.count}{' '}
                      {infoSighting.count === 1 ? 'otter' : 'otters'} ·{' '}
                      {formatRelativeTime(infoSighting.createdAtMs)}
                    </div>
                    <h4 className="font-display font-semibold text-sm leading-snug text-[#141E1A]">
                      {infoSighting.title}
                    </h4>
                    <div className="text-xs text-[#5D6D64]">{infoSighting.locationName}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSighting(infoSighting);
                      setInfoSighting(null);
                    }}
                    className="w-full py-1.5 px-3 text-xs font-medium bg-[#0D6E59] text-white rounded-md hover:bg-[#095444] transition-colors"
                  >
                    Open Full Sighting
                  </button>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        )}
      </div>
    </div>
  );
}
