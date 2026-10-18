"use client";

import { DEFAULT_SETTINGS, type Settings } from "./types";

const KEY = "gist.settings";

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // private browsing, or storage disabled — settings just will not persist
  }
}

export const PASSAGE_SIZES = [
  { label: "A sentence or two", value: 160 },
  { label: "Short paragraph", value: 320 },
  { label: "Full paragraph", value: 600 },
  { label: "A real chunk", value: 1000 },
];
