"use client";

/**
 * @file Sol navigasyon menüsü (sidebar).
 * @module @vetniva/web/components/layouts/sidebar
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
 * - Klavye navigasyonu (Tab) sırası menü öğeleriyle doğal akar.
 * @security Tenant context'i burada gösterilmez; tenant bilgisi
 * yalnızca `tenant_id` URL'inde veya oturumda taşınır. Sidebar
 * yalnızca tenant içi navigasyon içerir.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { cn } from "@/lib/cn";
import { getLabels, type Locale } from "@/lib/labels";

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

/**
 *
 * @param pathname
 * @param itemHref
 */
function isItemActive(pathname: string | null, itemHref: string): boolean {
  if (!pathname) return false;
  // Tam eşleşme veya alt rota eşleşmesi: /tr-TR/patients/123 → Hastalar.
  // Locale segmenti tüm menü bağlantılarında ortak olduğundan, yalnızca
  // segment dizilerini karşılaştırmak bütün öğeleri aktif gösterirdi.
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
}

/**
 *
 * @param root0
 * @param root0.locale
 * @param root0.open
 * @param root0.onClose
 */
export function Sidebar({ locale, open, onClose }: SidebarProps): JSX.Element {
  const pathname = usePathname();
  const labels = getLabels(locale);
  const labelsNav = labels.nav;

  // Esc tuşu drawer'ı kapatır (mobil)
  useEffect(() => {
    if (!open) return;
    /**
     *
     * @param event
     */
    function handleKey(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  /**
   *
   * @param item
   */
  function itemHref(item: (typeof PRIMARY_ITEMS)[number]): string {
    // `/${locale}` herkese açık landing sayfasıdır; uygulama içi ana
    // navigasyon oturumlu kullanıcının dashboard'una gitmelidir.
    if (item.id === "dashboard") return `/${locale}/dashboard`;
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
          "fixed inset-y-0 left-0 z-40 flex w-[248px] shrink-0 flex-col border-r border-[#E1E5E2] bg-white transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Logo */}
        <div className="flex h-[72px] items-center gap-3 border-b border-[#ECEFED] px-5">
          <span
            aria-hidden="true"
            className="grid h-[34px] w-[34px] place-items-center rounded-lg bg-[#0D4D2E] text-white shadow-sm"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path
                d="M12 2C6.5 2 2 6.5 2 12c0 3.5 1.8 6.6 4.5 8.4"
                fill="none"
              />
              <path
                d="M12 22c5.5 0 10-4.5 10-10 0-3.5-1.8-6.6-4.5-8.4"
                fill="none"
              />
              <circle cx="12" cy="14" r="4" fill="currentColor" />
              <circle cx="8" cy="8" r="1.75" fill="currentColor" />
              <circle cx="16" cy="8" r="1.75" fill="currentColor" />
              <circle cx="10" cy="4.5" r="1.25" fill="currentColor" />
              <circle cx="14" cy="4.5" r="1.25" fill="currentColor" />
            </svg>
          </span>
          <div className="flex flex-col">
            <span className="text-[17px] font-semibold leading-tight text-[#0D4D2E]">
              {labels.brand.name}
            </span>
            <span className="text-xs font-normal text-[#5F6368]">
              Klinik Yönetimi
            </span>
          </div>
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
                      "flex items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-[#E6F4EC] text-[#0D4D2E]"
                        : "text-[#4B5563] hover:bg-[#F1F5F1] hover:text-[#1D1D1F]",
                    )}
                  >
                    <span
                      className={cn(
                        "h-5 w-5 shrink-0 transition-colors",
                        active ? "text-[#0D4D2E]" : "text-[#5F6368]",
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
        <div className="border-t border-[#ECEFED] px-3 py-4">
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
                      "flex items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-[#E6F4EC] text-[#0D4D2E]"
                        : "text-[#4B5563] hover:bg-[#F1F5F1] hover:text-[#1D1D1F]",
                    )}
                  >
                    <span
                      className={cn(
                        "h-5 w-5 shrink-0 transition-colors",
                        active ? "text-[#0D4D2E]" : "text-[#5F6368]",
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
