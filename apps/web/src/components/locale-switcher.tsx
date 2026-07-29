/**
 * @file Locale değiştirici (client component).
 * @module @vetniva/web/components/locale-switcher
 *
 * @description Sayfanın aktif locale'ini değiştirmek için kullanılan
 * açılır menü. Server component içinde kullanılamaz; yalnızca
 * 'use client' bileşen olarak render edilir. Mevcut pathname'i koruyarak
 * locale segmentini günceller.
 *
 * @security Yalnızca desteklenen locale'ler listelenir; kullanıcı
 * keyfi bir URL enjekte edemez. Next.js yönlendirmesi kullanıldığı için
 * güvenli navigasyon sağlanır.
 */

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { useTranslation } from "react-i18next";

import { SUPPORTED_LOCALES, type Locale } from "@vetniva/contracts";

import { cn } from "@/lib/cn";

const LOCALE_LABELS: Record<Locale, string> = {
  "tr-TR": "Türkçe",
  "en-GB": "English (UK)",
};

/**
 * Aktif locale'i pathname'den çıkarır. `/tr-TR/health` → `tr-TR`.
 * Desteklenmeyen segment için null döner.
 */
function detectLocaleFromPath(pathname: string): Locale | null {
  const segment = pathname.split("/").filter(Boolean)[0] ?? "";
  if ((SUPPORTED_LOCALES as readonly string[]).includes(segment)) {
    return segment as Locale;
  }
  return null;
}

export type LocaleSwitcherProps = {
  className?: string;
};

export function LocaleSwitcher({
  className,
}: LocaleSwitcherProps): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { i18n } = useTranslation();

  const activeLocale =
    detectLocaleFromPath(pathname) ?? (i18n.language as Locale) ?? null;

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>): void {
    const nextLocale = event.target.value as Locale;
    if (nextLocale === activeLocale) return;

    // Pathname'deki ilk segmenti yeni locale ile değiştir.
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const first = segments[0];
      if (
        first !== undefined &&
        (SUPPORTED_LOCALES as readonly string[]).includes(first)
      ) {
        segments[0] = nextLocale;
      } else {
        segments.unshift(nextLocale);
      }
    } else {
      segments.push(nextLocale);
    }

    const nextPath = "/" + segments.join("/");
    startTransition(() => {
      router.push(nextPath);
    });
  }

  return (
    <label className={cn("inline-flex items-center gap-2 text-sm", className)}>
      <span className="sr-only">Dil seçimi</span>
      <select
        aria-label="Dil seçimi"
        value={activeLocale ?? ""}
        onChange={handleChange}
        disabled={isPending}
        className="h-9 rounded border border-gray-300 bg-white px-2 text-sm focus:border-clinic-500 focus:outline-none focus:ring-1 focus:ring-clinic-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {LOCALE_LABELS[locale]}
          </option>
        ))}
      </select>
    </label>
  );
}
