"use client";

/**
 * @file Sol navigasyon menüsü (sidebar).
 * @module @vetniva/web/components/layouts/sidebar
 *
 * @description Klinik uygulamasının ana navigasyon menüsü. Aktif
 * route'u `usePathname` ile hesaplar ve ilgili menü öğesini vurgular.
 * Mobilde açılır panel (drawer) olarak çalışır; masaüstünde sabit
 * sütun.
 *
 * Erişilebilirlik:
 * - `<nav>` semantiği + `aria-label`
 * - Aktif sayfa `aria-current="page"` ile işaretli
 * - Mobil açma/kapama düğmesi `aria-expanded` ve `aria-controls`
 * kullanır
 * - Klavye navigasyonu (Tab) sırası menü öğeleriyle doğal akar
 *
 * @security Tenant context'i burada gösterilmez; tenant bilgisi
 * yalnızca `tenant_id` URL'inde veya oturumda taşınır. Sidebar
 * yalnızca tenant içi navigasyon içerir.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { getLabels, type Locale } from "@/lib/labels";

type SidebarItem = {
  key: string;
  labelKey: keyof ReturnType<typeof getLabels>["nav"];
  href: (locale: Locale) => string;
  icon: React.ReactNode;
};

/**
 * Sık kullanılan çift ok ikonleri (outline, 20px). Lucide benzeri
 * satır içi SVG'ler — sıfır bağımlılık.
 */
const Icon = {
  dashboard: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  patients: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="3.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M16 20c0-2.2 1.6-4 4-4" />
    </svg>
  ),
  appointments: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  consultation: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s-7-4.5-7-11a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.5-7 11-7 11" />
      <path d="M9 12h.01M12 11h.01M15 12h.01" />
    </svg>
  ),
  vaccinations: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 4l6 6M10 8l-6 6v6h6l6-6M14 4l3-3 3 3-3 3" />
    </svg>
  ),
  petshop: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="9" r="2" />
      <circle cx="18" cy="9" r="2" />
      <circle cx="9" cy="5" r="2" />
      <circle cx="15" cy="5" r="2" />
      <path d="M12 22c4 0 7-2.5 7-7 0-2.5-2-4-4-4H9c-2 0-4 1.5-4 4 0 4.5 3 7 7 7z" />
    </svg>
  ),
  finance: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </svg>
  ),
  settings: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
  signOut: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
} as const;

const PRIMARY_ITEMS = [
  { id: "dashboard", labelKey: "dashboard", iconKey: "dashboard" },
  { id: "patients", labelKey: "patients", iconKey: "patients" },
  { id: "appointments", labelKey: "appointments", iconKey: "appointments" },
  { id: "consultation", labelKey: "consultation", iconKey: "consultation" },
  { id: "vaccinations", labelKey: "vaccinations", iconKey: "vaccinations" },
  { id: "petshop", labelKey: "petshop", iconKey: "petshop" },
  { id: "finance", labelKey: "finance", iconKey: "finance" },
] as const;

const SECONDARY_ITEMS = [
  { id: "settings", labelKey: "settings", iconKey: "settings" },
  { id: "signOut", labelKey: "signOut", iconKey: "signOut" },
] as const;

type SidebarProps = {
  locale: Locale;
  open: boolean;
  onClose: () => void;
};

function isItemActive(pathname: string | null, itemHref: string): boolean {
  if (!pathname) return false;
  // Aktif route'un segment karşılaştırması: /tr-TR/patients/123 → patients
  const segments = pathname.split("/").filter(Boolean);
  const itemSegments = itemHref.split("/").filter(Boolean);
  if (itemSegments.length === 0) return false;
  // Pathname'in son segmenti item'ın path segmentini içeriyorsa aktif
  return segments.some((s) => itemSegments.includes(s));
}

export function Sidebar({ locale, open, onClose }: SidebarProps): JSX.Element {
  const pathname = usePathname();
  const labels = getLabels(locale);
  const labelsNav = labels.nav;

  // Esc tuşu drawer'ı kapatır (mobil)
  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  function itemHref(item: (typeof PRIMARY_ITEMS)[number]): string {
    if (item.id === "dashboard") return `/${locale}`;
    return `/${locale}/${item.id}`;
  }

  return (
    <>
      {/* Mobil arka plan overlay */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-gray-900/40 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        aria-label="Birincil navigasyon"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-200 bg-white transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-5">
          <span
            aria-hidden="true"
            className="grid h-8 w-8 place-items-center rounded-lg bg-clinic-700 text-white"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <circle cx="12" cy="14" r="6" />
              <circle cx="6" cy="8" r="2.5" />
              <circle cx="18" cy="8" r="2.5" />
              <circle cx="9" cy="4" r="2" />
              <circle cx="15" cy="4" r="2" />
            </svg>
          </span>
          <span className="text-base font-semibold text-clinic-800">
            {labels.brand.name}
          </span>
        </div>

        {/* Birincil navigasyon */}
        <nav
          aria-label="Birincil menü"
          className="flex-1 overflow-y-auto px-3 py-4"
        >
          <ul role="list" className="space-y-1">
            {PRIMARY_ITEMS.map((item) => {
              const href = itemHref(item);
              const active = isItemActive(pathname, href);
              return (
                <li key={item.id}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-clinic-50 text-clinic-800"
                        : "text-gray-700 hover:bg-gray-100",
                    )}
                  >
                    <span
                      className={cn(
                        "h-5 w-5 shrink-0",
                        active ? "text-clinic-700" : "text-gray-500",
                      )}
                    >
                      {Icon[item.iconKey as keyof typeof Icon]}
                    </span>
                    <span>{labelsNav[item.labelKey]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* İkincil navigasyon */}
        <div className="border-t border-gray-200 px-3 py-4">
          <ul role="list" className="space-y-1">
            {SECONDARY_ITEMS.map((item) => {
              const href =
                item.id === "settings"
                  ? `/${locale}/settings`
                  : `/${locale}/login`;
              const active = isItemActive(pathname, href);
              return (
                <li key={item.id}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-clinic-50 text-clinic-800"
                        : "text-gray-700 hover:bg-gray-100",
                    )}
                  >
                    <span
                      className={cn(
                        "h-5 w-5 shrink-0",
                        active ? "text-clinic-700" : "text-gray-500",
                      )}
                    >
                      {Icon[item.iconKey as keyof typeof Icon]}
                    </span>
                    <span>{labelsNav[item.labelKey]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </>
  );
}
