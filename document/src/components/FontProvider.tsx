import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/auth";
import {
  DEFAULT_FONT_FAMILY_KEY,
  FONT_OPTIONS,
  getFontOption,
  isFontFamilyKey,
  type FontFamilyKey,
} from "@/lib/fontCatalog";

type FontKitStatus = "idle" | "loading" | "ready" | "error";

interface FontContextType {
  fontFamilyKey: FontFamilyKey;
  fontOptions: typeof FONT_OPTIONS;
  kitConfigured: boolean;
  kitStatus: FontKitStatus;
  setFontFamilyKey: (key: FontFamilyKey) => void;
}

declare global {
  interface Window {
    Typekit?: {
      load: (config?: {
        async?: boolean;
        active?: () => void;
        inactive?: () => void;
      }) => void;
    };
  }
}

const FontContext = createContext<FontContextType>({
  fontFamilyKey: DEFAULT_FONT_FAMILY_KEY,
  fontOptions: FONT_OPTIONS,
  kitConfigured: false,
  kitStatus: "idle",
  setFontFamilyKey: () => {},
});

let activeKitId: string | null = null;
let activeKitPromise: Promise<void> | null = null;

function loadAdobeFontsKit(kitId: string): Promise<void> {
  if (activeKitId === kitId && activeKitPromise) return activeKitPromise;

  activeKitId = kitId;
  activeKitPromise = new Promise((resolve, reject) => {
    const loadFonts = () => {
      try {
        window.Typekit?.load({
          async: true,
          active: resolve,
          inactive: resolve,
        });
        if (!window.Typekit) {
          reject(new Error("Adobe Fonts Typekit loader unavailable"));
        }
      } catch (error) {
        reject(error);
      }
    };

    if (window.Typekit) {
      loadFonts();
      return;
    }

    const scriptId = `adobe-fonts-kit-${kitId}`;
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");

    script.id = scriptId;
    script.async = true;
    script.src = `https://use.typekit.net/${kitId}.js`;
    script.onload = loadFonts;
    script.onerror = () => reject(new Error("Adobe Fonts kit failed to load"));

    if (!existing) {
      document.head.appendChild(script);
    }
  });

  return activeKitPromise;
}

export function useFont() {
  return useContext(FontContext);
}

export function FontProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const kitId = import.meta.env.VITE_ADOBE_FONTS_KIT_ID?.trim() || "";
  const kitConfigured = Boolean(kitId);
  const [kitStatus, setKitStatus] = useState<FontKitStatus>(kitConfigured ? "loading" : "idle");
  const [fontFamilyKey, setFontFamilyKeyState] = useState<FontFamilyKey>(DEFAULT_FONT_FAMILY_KEY);

  useEffect(() => {
    const next = user?.fontFamilyKey && isFontFamilyKey(user.fontFamilyKey)
      ? user.fontFamilyKey
      : DEFAULT_FONT_FAMILY_KEY;
    setFontFamilyKeyState(next);
  }, [user?.fontFamilyKey]);

  useEffect(() => {
    if (!kitConfigured) {
      setKitStatus("idle");
      return;
    }

    let cancelled = false;
    setKitStatus("loading");
    loadAdobeFontsKit(kitId)
      .then(() => {
        if (!cancelled) setKitStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setKitStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [kitConfigured, kitId]);

  useEffect(() => {
    const selected = getFontOption(fontFamilyKey);
    const root = document.documentElement;

    root.style.setProperty("--font-zn-sans", selected.cssFamily);
    root.style.setProperty("--font-zn-display", selected.cssFamily);
    root.style.setProperty("--font-zn-writing", selected.cssFamily);
  }, [fontFamilyKey]);

  const setFontFamilyKey = useCallback((key: FontFamilyKey) => {
    setFontFamilyKeyState(key);
  }, []);

  const value = useMemo(
    () => ({
      fontFamilyKey,
      fontOptions: FONT_OPTIONS,
      kitConfigured,
      kitStatus,
      setFontFamilyKey,
    }),
    [fontFamilyKey, kitConfigured, kitStatus, setFontFamilyKey]
  );

  return <FontContext.Provider value={value}>{children}</FontContext.Provider>;
}
