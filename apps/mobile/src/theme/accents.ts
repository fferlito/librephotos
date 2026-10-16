/**
 * The accent colors offered in Settings, each in a light-mode and a dark-mode
 * shade (the dark one lighter, to read on the dark background).
 */
export const ACCENTS = {
  blue: { light: "#208AEF", dark: "#4aa3ff" },
  green: { light: "#16a34a", dark: "#22c55e" },
  red: { light: "#dc2626", dark: "#f87171" },
  pink: { light: "#db2777", dark: "#f472b6" },
  yellow: { light: "#ca8a04", dark: "#eab308" },
  purple: { light: "#7c3aed", dark: "#a78bfa" },
  orange: { light: "#ea580c", dark: "#fb923c" },
  grey: { light: "#4b5563", dark: "#9ca3af" },
} as const;

export type AccentColor = keyof typeof ACCENTS;
/** In the order Settings shows them. */
export const ACCENT_NAMES: readonly AccentColor[] = [
  "blue",
  "green",
  "red",
  "pink",
  "yellow",
  "purple",
  "orange",
  "grey",
];

export function isAccentColor(value: unknown): value is AccentColor {
  return typeof value === "string" && value in ACCENTS;
}
