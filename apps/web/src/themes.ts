/**
 * App themes — the single source of truth for every color token.
 *
 * `applyTheme` writes each token as a CSS custom property on <html>, so styles.css only
 * references `var(--agno-*)`. The same palette drives the Monaco editor theme, so code views
 * match the rest of the UI. styles.css keeps the Agno Dark values in `:root` as a first-paint
 * fallback before this module runs.
 */

export type ThemeId = "agno-dark" | "agno-light" | "dracula" | "one-dark" | "neon";

/** "r, g, b" triplet, used as `rgba(var(--token), alpha)` in CSS. */
type Rgb = string;

export interface ThemeTokens {
  primary: string;
  primarySoft: string;
  primarySoftStrong: string;
  primaryRgb: Rgb;
  /** Second stop of the primary button gradient. */
  primaryGradientEnd: string;
  /** App background (kept under its historical name `--agno-background-dark-rgb`). */
  backgroundRgb: Rgb;
  /** Gray ramp, 50 (strongest text) … 950 (deepest surface); inverted for light themes. */
  gray: [Rgb, Rgb, Rgb, Rgb, Rgb, Rgb, Rgb, Rgb, Rgb, Rgb, Rgb];
  surface: [string, string, string, string];
  border: string;
  borderSoft: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textOnPrimary: string;
  /** Tint layered over surfaces for hover/zebra/code backgrounds: white on dark, black on light. */
  overlayRgb: Rgb;
  shadowRgb: Rgb;
  successRgb: Rgb;
  dangerRgb: Rgb;
  warningRgb: Rgb;
  infoRgb: Rgb;
  successText: string;
  dangerText: string;
  /** Categorical accents for node and tool icons (9 slots, see NODE_ACCENT_SLOTS). */
  accents: [string, string, string, string, string, string, string, string, string];
  /** Extra glow on selected/active elements; "none" for flat themes. */
  glow: string;
  /** Alpha of the primary-tinted radial gradient behind the app. */
  backdropTint: number;
}

export interface MonacoPalette {
  base: "vs" | "vs-dark";
  background: string;
  foreground: string;
  comment: string;
  keyword: string;
  string: string;
  number: string;
  type: string;
  operator: string;
  delimiter: string;
  lineHighlight: string;
  selection: string;
  lineNumber: string;
  lineNumberActive: string;
  cursor: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  description: string;
  scheme: "dark" | "light";
  tokens: ThemeTokens;
  monaco: MonacoPalette;
}

/** CSS variable names for the accent slots, in order. Node/tool catalogs reference these. */
export const NODE_ACCENT_SLOTS = [
  "primary",
  "ember",
  "coral",
  "salmon",
  "peach",
  "copper",
  "clay",
  "sand",
  "dune",
] as const;

export type NodeAccentSlot = (typeof NODE_ACCENT_SLOTS)[number];

export function accentVar(slot: NodeAccentSlot): string {
  return `var(--agno-accent-${slot})`;
}

const AGNO_DARK: ThemeDefinition = {
  id: "agno-dark",
  label: "Agno Dark",
  description: "Warm charcoal with the Agno ember accent.",
  scheme: "dark",
  tokens: {
    primary: "#ff4017",
    primarySoft: "#ff8d75",
    primarySoftStrong: "#ffb19d",
    primaryRgb: "255, 64, 23",
    primaryGradientEnd: "#ff6a45",
    backgroundRgb: "24, 20, 19",
    gray: [
      "252, 248, 247",
      "247, 243, 242",
      "234, 229, 228",
      "220, 214, 213",
      "188, 182, 181",
      "151, 145, 144",
      "120, 114, 113",
      "95, 89, 88",
      "66, 60, 59",
      "44, 38, 37",
      "28, 23, 22",
    ],
    surface: ["rgba(40, 34, 33, 0.96)", "rgba(54, 48, 47, 0.9)", "rgba(74, 68, 67, 0.78)", "rgba(104, 98, 97, 0.6)"],
    border: "rgba(220, 214, 213, 0.18)",
    borderSoft: "rgba(220, 214, 213, 0.1)",
    borderStrong: "rgba(255, 64, 23, 0.4)",
    textPrimary: "rgb(252, 248, 247)",
    textSecondary: "rgb(220, 214, 213)",
    textTertiary: "rgb(168, 162, 161)",
    textOnPrimary: "rgb(255, 250, 249)",
    overlayRgb: "255, 255, 255",
    shadowRgb: "0, 0, 0",
    successRgb: "74, 222, 128",
    dangerRgb: "248, 113, 113",
    warningRgb: "250, 204, 21",
    infoRgb: "96, 165, 250",
    successText: "#86efac",
    dangerText: "#fecaca",
    accents: ["#ff4017", "#ff562f", "#ff6a45", "#ff8d75", "#ffb19d", "#ff9d6b", "#c98772", "#d5cfce", "#a6a09f"],
    glow: "none",
    backdropTint: 0.16,
  },
  monaco: {
    base: "vs-dark",
    background: "#141011",
    foreground: "#F5EFEE",
    comment: "777170",
    keyword: "FF8D75",
    string: "FFB19D",
    number: "FF6A45",
    type: "F5EFEE",
    operator: "FF562F",
    delimiter: "D5CFCE",
    lineHighlight: "#1E1817",
    selection: "#3A201A",
    lineNumber: "#777170",
    lineNumberActive: "#D5CFCE",
    cursor: "#FF4017",
  },
};

const AGNO_LIGHT: ThemeDefinition = {
  id: "agno-light",
  label: "Agno Light",
  description: "Paper-white surfaces, same ember accent.",
  scheme: "light",
  tokens: {
    primary: "#e8380f",
    primarySoft: "#f0603f",
    primarySoftStrong: "#c42f0c",
    primaryRgb: "232, 56, 15",
    primaryGradientEnd: "#ff6a45",
    backgroundRgb: "247, 244, 243",
    gray: [
      "34, 30, 29",
      "52, 47, 46",
      "76, 70, 69",
      "102, 96, 95",
      "126, 120, 119",
      "149, 143, 142",
      "173, 167, 166",
      "203, 197, 196",
      "224, 218, 217",
      "244, 239, 238",
      "252, 249, 248",
    ],
    surface: ["rgba(255, 255, 255, 0.96)", "rgba(255, 255, 255, 0.92)", "rgba(245, 241, 240, 0.94)", "rgba(234, 228, 227, 0.94)"],
    border: "rgba(76, 70, 69, 0.2)",
    borderSoft: "rgba(76, 70, 69, 0.12)",
    borderStrong: "rgba(232, 56, 15, 0.4)",
    textPrimary: "rgb(34, 30, 29)",
    textSecondary: "rgb(76, 70, 69)",
    textTertiary: "rgb(112, 106, 105)",
    textOnPrimary: "rgb(255, 255, 255)",
    overlayRgb: "0, 0, 0",
    shadowRgb: "60, 40, 35",
    successRgb: "22, 163, 74",
    dangerRgb: "220, 38, 38",
    warningRgb: "202, 138, 4",
    infoRgb: "37, 99, 235",
    successText: "#15803d",
    dangerText: "#b91c1c",
    accents: ["#e8380f", "#f04a22", "#e85a35", "#d9694f", "#c2735e", "#d97a3f", "#a8634f", "#7d7675", "#8f8887"],
    glow: "none",
    backdropTint: 0.07,
  },
  monaco: {
    base: "vs",
    background: "#FFFDFC",
    foreground: "#221E1D",
    comment: "8F8887",
    keyword: "C42F0C",
    string: "A8634F",
    number: "D9694F",
    type: "221E1D",
    operator: "E8380F",
    delimiter: "4C4645",
    lineHighlight: "#F7F1EF",
    selection: "#FAD9CF",
    lineNumber: "#ADA7A6",
    lineNumberActive: "#4C4645",
    cursor: "#E8380F",
  },
};

// Dracula — https://draculatheme.com/contribute (official palette).
const DRACULA: ThemeDefinition = {
  id: "dracula",
  label: "Dracula",
  description: "The classic purple-and-pink dark palette.",
  scheme: "dark",
  tokens: {
    primary: "#bd93f9",
    primarySoft: "#d6bcfa",
    primarySoftStrong: "#ff79c6",
    primaryRgb: "189, 147, 249",
    primaryGradientEnd: "#ff79c6",
    backgroundRgb: "30, 31, 41",
    gray: [
      "248, 248, 242",
      "240, 240, 234",
      "222, 222, 230",
      "200, 202, 218",
      "160, 166, 200",
      "98, 114, 164",
      "84, 94, 136",
      "68, 71, 90",
      "54, 56, 72",
      "40, 42, 54",
      "33, 34, 44",
    ],
    surface: ["rgba(40, 42, 54, 0.97)", "rgba(52, 55, 70, 0.92)", "rgba(68, 71, 90, 0.82)", "rgba(98, 114, 164, 0.42)"],
    border: "rgba(98, 114, 164, 0.4)",
    borderSoft: "rgba(98, 114, 164, 0.24)",
    borderStrong: "rgba(189, 147, 249, 0.55)",
    textPrimary: "rgb(248, 248, 242)",
    textSecondary: "rgb(210, 212, 226)",
    textTertiary: "rgb(148, 158, 196)",
    textOnPrimary: "rgb(30, 31, 41)",
    overlayRgb: "255, 255, 255",
    shadowRgb: "10, 10, 18",
    successRgb: "80, 250, 123",
    dangerRgb: "255, 85, 85",
    warningRgb: "241, 250, 140",
    infoRgb: "139, 233, 253",
    successText: "#50fa7b",
    dangerText: "#ff9e9e",
    accents: ["#bd93f9", "#ff79c6", "#8be9fd", "#50fa7b", "#f1fa8c", "#ffb86c", "#ff5555", "#f8f8f2", "#6272a4"],
    glow: "none",
    backdropTint: 0.14,
  },
  monaco: {
    base: "vs-dark",
    background: "#282A36",
    foreground: "#F8F8F2",
    comment: "6272A4",
    keyword: "FF79C6",
    string: "F1FA8C",
    number: "BD93F9",
    type: "8BE9FD",
    operator: "FF79C6",
    delimiter: "F8F8F2",
    lineHighlight: "#44475A",
    selection: "#44475A",
    lineNumber: "#6272A4",
    lineNumberActive: "#F8F8F2",
    cursor: "#F8F8F0",
  },
};

// One Dark — Atom's One Dark syntax/UI palette.
const ONE_DARK: ThemeDefinition = {
  id: "one-dark",
  label: "One Dark",
  description: "Atom's balanced blue-gray, easy on long sessions.",
  scheme: "dark",
  tokens: {
    primary: "#61afef",
    primarySoft: "#8cc4f4",
    primarySoftStrong: "#c678dd",
    primaryRgb: "97, 175, 239",
    primaryGradientEnd: "#56b6c2",
    backgroundRgb: "30, 33, 39",
    gray: [
      "230, 233, 239",
      "215, 218, 224",
      "190, 195, 205",
      "171, 178, 191",
      "140, 148, 163",
      "108, 116, 131",
      "92, 99, 112",
      "62, 68, 81",
      "50, 55, 65",
      "40, 44, 52",
      "33, 37, 43",
    ],
    surface: ["rgba(40, 44, 52, 0.97)", "rgba(49, 54, 63, 0.92)", "rgba(62, 68, 81, 0.82)", "rgba(92, 99, 112, 0.5)"],
    border: "rgba(171, 178, 191, 0.16)",
    borderSoft: "rgba(171, 178, 191, 0.09)",
    borderStrong: "rgba(97, 175, 239, 0.5)",
    textPrimary: "rgb(230, 233, 239)",
    textSecondary: "rgb(171, 178, 191)",
    textTertiary: "rgb(128, 136, 150)",
    textOnPrimary: "rgb(24, 26, 31)",
    overlayRgb: "255, 255, 255",
    shadowRgb: "8, 10, 14",
    successRgb: "152, 195, 121",
    dangerRgb: "224, 108, 117",
    warningRgb: "229, 192, 123",
    infoRgb: "97, 175, 239",
    successText: "#98c379",
    dangerText: "#f0a3aa",
    accents: ["#61afef", "#c678dd", "#56b6c2", "#98c379", "#e5c07b", "#d19a66", "#e06c75", "#abb2bf", "#7f848e"],
    glow: "none",
    backdropTint: 0.1,
  },
  monaco: {
    base: "vs-dark",
    background: "#282C34",
    foreground: "#ABB2BF",
    comment: "7F848E",
    keyword: "C678DD",
    string: "98C379",
    number: "D19A66",
    type: "E5C07B",
    operator: "56B6C2",
    delimiter: "ABB2BF",
    lineHighlight: "#2C313C",
    selection: "#3E4451",
    lineNumber: "#495162",
    lineNumberActive: "#ABB2BF",
    cursor: "#528BFF",
  },
};

const NEON: ThemeDefinition = {
  id: "neon",
  label: "Neon",
  description: "Deep-space black with glowing magenta and cyan.",
  scheme: "dark",
  tokens: {
    primary: "#ff2bd6",
    primarySoft: "#ff7ae6",
    primarySoftStrong: "#00f0ff",
    primaryRgb: "255, 43, 214",
    primaryGradientEnd: "#7b2bff",
    backgroundRgb: "7, 6, 18",
    gray: [
      "246, 244, 255",
      "232, 228, 255",
      "205, 200, 240",
      "176, 170, 224",
      "138, 132, 190",
      "104, 98, 156",
      "78, 72, 126",
      "52, 46, 96",
      "34, 30, 70",
      "20, 17, 46",
      "12, 10, 30",
    ],
    surface: ["rgba(14, 12, 34, 0.94)", "rgba(22, 19, 50, 0.9)", "rgba(34, 30, 72, 0.8)", "rgba(56, 48, 112, 0.56)"],
    border: "rgba(0, 240, 255, 0.2)",
    borderSoft: "rgba(0, 240, 255, 0.1)",
    borderStrong: "rgba(255, 43, 214, 0.7)",
    textPrimary: "rgb(246, 244, 255)",
    textSecondary: "rgb(196, 190, 240)",
    textTertiary: "rgb(140, 134, 196)",
    textOnPrimary: "rgb(255, 255, 255)",
    overlayRgb: "160, 150, 255",
    shadowRgb: "0, 0, 0",
    successRgb: "57, 255, 20",
    dangerRgb: "255, 49, 99",
    warningRgb: "245, 255, 59",
    infoRgb: "0, 240, 255",
    successText: "#7dff63",
    dangerText: "#ff8aa8",
    accents: ["#ff2bd6", "#00f0ff", "#39ff14", "#f5ff3b", "#ff8a00", "#9d4dff", "#ff3d7f", "#2d9bff", "#8a8fd8"],
    glow: "0 0 18px rgba(255, 43, 214, 0.45), 0 0 42px rgba(0, 240, 255, 0.18)",
    backdropTint: 0.22,
  },
  monaco: {
    base: "vs-dark",
    background: "#0A0818",
    foreground: "#F6F4FF",
    comment: "6C66A8",
    keyword: "FF2BD6",
    string: "39FF14",
    number: "F5FF3B",
    type: "00F0FF",
    operator: "FF7AE6",
    delimiter: "C4BEF0",
    lineHighlight: "#16123A",
    selection: "#3A1F66",
    lineNumber: "#4E487E",
    lineNumberActive: "#00F0FF",
    cursor: "#00F0FF",
  },
};

export const THEMES: ThemeDefinition[] = [AGNO_DARK, AGNO_LIGHT, DRACULA, ONE_DARK, NEON];

export const DEFAULT_DARK_THEME: ThemeId = "agno-dark";
export const DEFAULT_LIGHT_THEME: ThemeId = "agno-light";

const THEME_STORAGE_KEY = "agnolab.theme";

export function getThemeDefinition(id: string | null | undefined): ThemeDefinition {
  return THEMES.find((theme) => theme.id === id) ?? AGNO_DARK;
}

/** Reads the persisted theme; migrates the old "dark"/"light" values; falls back to the OS preference. */
export function loadInitialThemeId(): ThemeId {
  const persisted = typeof window === "undefined" ? null : window.localStorage.getItem(THEME_STORAGE_KEY);
  if (persisted === "dark") return DEFAULT_DARK_THEME;
  if (persisted === "light") return DEFAULT_LIGHT_THEME;
  if (persisted && THEMES.some((theme) => theme.id === persisted)) return persisted as ThemeId;
  const prefersLight = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches;
  return prefersLight ? DEFAULT_LIGHT_THEME : DEFAULT_DARK_THEME;
}

export function themeCssVariables(tokens: ThemeTokens): Record<string, string> {
  const variables: Record<string, string> = {
    "--agno-primary": tokens.primary,
    "--agno-primary-soft": tokens.primarySoft,
    "--agno-primary-soft-strong": tokens.primarySoftStrong,
    "--agno-primary-rgb": tokens.primaryRgb,
    "--agno-primary-gradient-end": tokens.primaryGradientEnd,
    "--agno-background-dark-rgb": tokens.backgroundRgb,
    "--agno-border": tokens.border,
    "--agno-border-soft": tokens.borderSoft,
    "--agno-border-strong": tokens.borderStrong,
    "--agno-text-primary": tokens.textPrimary,
    "--agno-text-secondary": tokens.textSecondary,
    "--agno-text-tertiary": tokens.textTertiary,
    "--agno-text-on-primary": tokens.textOnPrimary,
    "--agno-overlay-rgb": tokens.overlayRgb,
    "--agno-shadow-rgb": tokens.shadowRgb,
    "--agno-success-rgb": tokens.successRgb,
    "--agno-danger-rgb": tokens.dangerRgb,
    "--agno-warning-rgb": tokens.warningRgb,
    "--agno-info-rgb": tokens.infoRgb,
    "--agno-success-text": tokens.successText,
    "--agno-danger-text": tokens.dangerText,
    "--agno-glow": tokens.glow,
    "--agno-backdrop-tint": String(tokens.backdropTint),
  };
  const grayStops = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  grayStops.forEach((stop, index) => {
    variables[`--agno-gray-${stop}`] = tokens.gray[index];
  });
  tokens.surface.forEach((value, index) => {
    variables[`--agno-surface-${index}`] = value;
  });
  NODE_ACCENT_SLOTS.forEach((slot, index) => {
    variables[`--agno-accent-${slot}`] = tokens.accents[index];
  });
  return variables;
}

export function applyTheme(id: ThemeId): ThemeDefinition {
  const theme = getThemeDefinition(id);
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeCssVariables(theme.tokens))) {
    root.style.setProperty(name, value);
  }
  root.setAttribute("data-theme", theme.id);
  root.setAttribute("data-color-scheme", theme.scheme);
  root.style.colorScheme = theme.scheme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme.id);
  window.dispatchEvent(new CustomEvent<ThemeId>(THEME_CHANGE_EVENT, { detail: theme.id }));
  return theme;
}

export const THEME_CHANGE_EVENT = "agnolab:theme-change";

export function monacoThemeName(id: ThemeId): string {
  return `agnolab-${id}`;
}
