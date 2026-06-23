/**
 * hooks/useLanguage.tsx
 *
 * Bilingual (EN/ES) language state, backed by React Context.
 *
 * Replaces a previous implementation that used a module-level mutable
 * variable plus a hand-rolled pub/sub Set to fan out updates — that
 * pattern read localStorage as an import-time side effect (breaks under
 * SSR or tests where localStorage isn't defined) and bypassed React's
 * own state/update model entirely. This version keeps the exact same
 * public API (`const { lang, setLang } = useLanguage()`), so no
 * consuming component needs to change.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type Lang = "en" | "es";

const STORAGE_KEY = "cn_lang";

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  setLang: () => {},
});

function getInitialLang(): Lang {
  if (typeof window === "undefined" || !window.localStorage) return "en";
  return (window.localStorage.getItem(STORAGE_KEY) as Lang) ?? "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, l);
    }
  }, []);

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
