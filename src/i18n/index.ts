/**
 * Verdex — i18next initialization.
 *
 * Default language is English ("en"). The user can switch to Chinese ("zh")
 * in Settings; the choice is persisted in config.json and re-applied on load
 * via `applyLanguage()` (called by useMoa after reading config).
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import zh from "./zh.json";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, // React already escapes by default
  },
  returnNull: false,
});

export default i18n;
