import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import type { BackendLocale, LanguageCode } from "@/lib/types";
import en from "@/locales/en/translation.json";
import zhCN from "@/locales/zh-CN/translation.json";

const resources = {
  en: { translation: en },
  "zh-CN": { translation: zhCN },
} as const;

export const supportedLanguages: Array<{
  code: LanguageCode;
  label: string;
  nativeLabel: string;
}> = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "zh-CN", label: "Simplified Chinese", nativeLabel: "简体中文" },
];

export function backendLocaleToLanguage(locale: BackendLocale): LanguageCode {
  return locale === "ZhHans" ? "zh-CN" : "en";
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: supportedLanguages.map((language) => language.code),
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

export default i18n;
