/**
 * @file Locale değiştirici (client component).
 * @module @vetniva/web/components/locale-switcher
 * @description Aktif locale'i değiştirmek için kullanılan açılır menü.
 * Yalnızca client tarafında çalışır çünkü `usePathname` ve
 * `useRouter` App Router hook'larına bağımlıdır. Aktif locale
 * pathname'in ilk segmentinden okunur; `react-i18next` ile bağ
 * kurulmaz (server tarafında çeviriler zaten `getT` ile çözümlenir).
 *
 * Erişilebilirlik:
 * - `<label>` + görsel `sr-only` metin
 * - Native `<select>` (klavye + ekran okuyucu dostu)
 * - Pending durumda `disabled`.
 * @security Yalnızca desteklenen locale'ler listelenir; kullanıcı
 * keyfi bir URL enjekte edemez. Next.js yönlendirmesi kullanıldığı
 * için güvenli navigasyon sağlanır.
 */

"use client";

import { SUPPORTED_LOCALES, type Locale } from "@vetniva/contracts";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import { cn } from "@/lib/cn";

const LOCALE_LABELS: Record<Locale, string> = {
  "tr-TR": "Türkçe",
  "en-GB": "English (UK)",
};

/**
 * Aktif locale'i pathname'den çıkarır. `/tr-TR/health` → `tr-TR`.
 * Desteklenmeyen segment için null döner.
 * @param pathname
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

/**
 *
 * @param root0
 * @param root0.className
 */
export function LocaleSwitcher({
  className,
}: LocaleSwitcherProps): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const activeLocale = detectLocaleFromPath(pathname);

  /**
   *
   * @param event
   */
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
            {locale === "tr-TR"
              ? LOCALE_LABELS["tr-TR"]
              : LOCALE_LABELS["en-GB"]}
          </option>
        ))}
      </select>
    </label>
  );
}
