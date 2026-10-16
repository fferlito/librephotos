import { useColorScheme } from "react-native";
import { useSettingsStore } from "@/stores/settings";
import { ACCENTS } from "./accents";

export { ACCENTS, ACCENT_NAMES, isAccentColor, type AccentColor } from "./accents";

export type ThemeColors = {
  background: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  brand: string;
};

const light: ThemeColors = {
  background: "#ffffff",
  card: "#f4f5f7",
  text: "#11181c",
  muted: "#6b7280",
  border: "#e5e7eb",
  brand: "#208AEF",
};

const dark: ThemeColors = {
  background: "#0b0d0f",
  card: "#16191d",
  text: "#ecedee",
  muted: "#9aa0a6",
  border: "#272b30",
  brand: "#4aa3ff",
};

export const themes = { light, dark };

/** Resolve the effective color scheme from the settings preference + OS. */
export function useResolvedScheme(): "light" | "dark" {
  const system = useColorScheme();
  const preference = useSettingsStore(s => s.theme);
  if (preference === "system") return system === "dark" ? "dark" : "light";
  return preference;
}

export function useTheme(): ThemeColors {
  const scheme = useResolvedScheme();
  const accent = useSettingsStore(s => s.accent);
  return { ...themes[scheme], brand: ACCENTS[accent][scheme] };
}
