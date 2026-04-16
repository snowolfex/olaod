export type AppThemeId = "light" | "dark" | "tech";

export const APP_THEME_STORAGE_KEY = "oload:theme";

export const APP_THEMES: Array<{ id: AppThemeId; label: string }> = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "tech", label: "Tech" },
];

export function isAppThemeId(value: string | null | undefined): value is AppThemeId {
  return value === "light" || value === "dark" || value === "tech";
}