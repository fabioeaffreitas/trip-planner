"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { DestinationSuggestion } from "@/lib/types";

const AUTOCOMPLETE_DEBOUNCE_MS = 300;

export default function DestinationAutocompleteInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<DestinationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suppressNextFetch = useRef(false);

  useEffect(() => {
    if (suppressNextFetch.current) {
      suppressNextFetch.current = false;
      return;
    }
    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const data = await apiFetch<{ suggestions: DestinationSuggestion[] }>(
          `/places/destinations/autocomplete?query=${encodeURIComponent(value)}`
        );
        setSuggestions(data.suggestions);
        setShowSuggestions(true);
      } catch {
        // Autocomplete is a convenience, not required — fail silently and
        // let the user keep typing a plain destination.
        setSuggestions([]);
      }
    }, AUTOCOMPLETE_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [value]);

  function selectSuggestion(suggestion: DestinationSuggestion) {
    suppressNextFetch.current = true;
    onChange(suggestion.description);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  return (
    <div className="autocomplete-field">
      <input
        id={id}
        required
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 100)}
        placeholder={placeholder}
      />
      {showSuggestions && suggestions.length > 0 && (
        <ul className="autocomplete-list">
          {suggestions.map((s) => (
            <li key={s.description}>
              <button
                type="button"
                className="autocomplete-option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(s)}
              >
                <strong>{s.mainText}</strong>
                {s.secondaryText ? ` — ${s.secondaryText}` : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
