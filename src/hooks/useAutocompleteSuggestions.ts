import { useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

export interface UseAutocompleteSuggestionsReturn {
  suggestions: google.maps.places.AutocompleteSuggestion[];
  isLoading: boolean;
  resetSession: () => void;
}

/**
 * Modern Places API (New) autocomplete hook using AutocompleteSuggestion
 * and AutocompleteSessionToken, biased to Greater Kuala Lumpur.
 */
export function useAutocompleteSuggestions(
  inputString: string
): UseAutocompleteSuggestionsReturn {
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!placesLib) return;
    const trimmed = inputString.trim();
    if (!trimmed) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    const request: google.maps.places.AutocompleteRequest = {
      input: trimmed,
      sessionToken: sessionTokenRef.current,
      includedRegionCodes: ['my'],
      locationBias: {
        north: 3.35,
        south: 2.90,
        east: 101.85,
        west: 101.48,
      },
    };

    setIsLoading(true);
    AutocompleteSuggestion.fetchAutocompleteSuggestions(request)
      .then((res) => {
        if (!cancelled) {
          setSuggestions(res.suggestions ?? []);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const message = String(err);
          if (message.includes('RESOURCE_EXHAUSTED') || message.includes('OVER_QUERY_LIMIT')) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
          setSuggestions([]);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [placesLib, inputString]);

  return {
    suggestions,
    isLoading,
    resetSession: () => {
      sessionTokenRef.current = null;
      setSuggestions([]);
    },
  };
}
