/**
 * @file Süper admin sol navigasyon menüsü.
 * @module @vetniva/web/components/layouts/superadmin-sidebar
 * @description FAZ-10 SUPERADMIN paneli için ayrı bir kenar çubuğu.
 * Klinik uygulamasının ana sidebar'ından bağımsız çalışır: SUPERADMIN
 * kullanıcısı tüm tenant'lara erişebildiği için farklı görsel ton ve
 * farklı menü yapısı kullanılır. Aktif route `usePathname` ile
 * hesaplanır; mobilde drawer olarak açılır.
 *
 * Erişilebilirlik:
 * - `<nav>` semantiği + `aria-label`
 * - Aktif sayfa `aria-current="page"`
 * - Klavye Escape ile drawer kapatma
 * @security Tenant context burada gösterilmez; SUPERADMIN görünümü
 * tenant-üstü olduğu için `/${locale}/superadmin/*` altında tutulur.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { cn } from "@/lib/cn";
import { getLabels, type Locale } from "@/lib/labels";

/**
 * SUPERADMIN nav ikon seti (20px, outline). Sıfır bağımlılık için
 * satır içi SVG; helper fonksiyonlar ile seçilir.
 */
const Icon = {
  overview: (
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
  errorCenter: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.86l-7.1 12c-.7 1.2-.1 2.7 1.3 2.7h14.2c1.4 0 2-1.5 1.3-2.7l-7.1-12a1.7 1.7 0 0 0-2.6 0z" />
    </svg>
  ),
  jobRuns: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  ),
  securityEvents: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  retention: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
} as const;

type NavItemKey = keyof typeof Icon;

const NAV_ITEMS: ReadonlyArray<{
  id: string;
  labelKey:
    "overview" | "errorCenter" | "jobRuns" | "securityEvents" | "retention";
  iconKey: NavItemKey;
  /** Route prefix (locale hariç). Tam eşleşme + prefix eşleşmesi aktif sayılır. */
  path: string;
}> = [
  {
    id: "overview",
    labelKey: "overview",
    iconKey: "overview",
    path: "/superadmin",
  },
  {
    id: "errorCenter",
    labelKey: "errorCenter",
    iconKey: "errorCenter",
    path: "/superadmin/error-center",
  },
  {
    id: "jobRuns",
    labelKey: "jobRuns",
    iconKey: "jobRuns",
    path: "/superadmin/job-runs",
  },
  {
    id: "securityEvents",
    labelKey: "securityEvents",
    iconKey: "securityEvents",
    path: "/superadmin/security-events",
  },
  {
    id: "retention",
    labelKey: "retention",
    iconKey: "retention",
    path: "/superadmin/retention",
  },
];

type SuperadminSidebarProps = {
  locale: Locale;
  open: boolean;
  onClose: () => void;
};

/**
 * Verilen pathname'in bir nav item path'iyle eşleşip eşleşmediğini
 * döner. Tam eşleşme + alt path eşleşmesi.
 * @param pathname
 * @param itemPath
 */
function isItemActive(pathname: string | null, itemPath: string): boolean {
  if (!pathname) return false;
  // Dashboard kök için sadece tam eşleşme (diğer "/superadmin/*" altında
  // olduğunda dashboard aktif olmamalı).
  if (itemPath === "/superadmin") {
    return (
      pathname === "/superadmin" ||
      pathname === `/${itemPath}` ||
      /^\/[^/]+\/superadmin\/?$/.test(pathname)
    );
  }
  const localizedPrefix = itemPath;
  return (
    pathname === localizedPrefix || pathname.startsWith(`${localizedPrefix}/`)
  );
}

/**
 *
 * @param root0
 * @param root0.locale
 * @param root0.open
 * @param root0.onClose
 */
export function SuperadminSidebar({
  locale,
  open,
  onClose,
}: SuperadminSidebarProps): JSX.Element {
  const pathname = usePathname();
  const labels = getLabels(locale);
  const navLabels = labels.superadmin.nav;

  // Esc tuşu drawer'ı kapatır
  useEffect(() => {
    if (!open) return;
    /**
     * @param event
     */
    function handleKey(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  /**
   * Nav item path'ini locale prefix'i ile birleştirir.
   * @param item
   */
  function itemHref(item: (typeof NAV_ITEMS)[number]): string {
    if (item.path === "/superadmin") {
      return `/${locale}/superadmin`;
    }
    return `/${locale}${item.path}`;
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
        aria-label="Süper admin gezinme menüsü"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[248px] shrink-0 flex-col border-r border-[#1F2937] bg-[#0B1220] text-slate-200 transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Logo / başlık */}
        <div className="flex h-[72px] items-center gap-3 border-b border-slate-800 px-5">
          <span
            aria-hidden="true"
            className="grid h-[34px] w-[34px] place-items-center rounded-lg bg-amber-500 text-slate-900 shadow-sm"
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
              <path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z" />
            </svg>
          </span>
          <div className="flex flex-col">
            <span className="text-[17px] font-semibold leading-tight text-white">
              {labels.superadmin.brand}
            </span>
            <span className="text-xs font-normal text-slate-400">
              {labels.superadmin.tagline}
            </span>
          </div>
        </div>

        {/* Birincil navigasyon */}
        <nav
          aria-label="Süper admin menüsü"
          className="flex-1 overflow-y-auto px-3 py-4"
        >
          <ul role="list" className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const href = itemHref(item);
              const active = isItemActive(pathname, href);
              return (
                <li key={item.id}>
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-amber-500/10 text-amber-200"
                        : "text-slate-300 hover:bg-slate-800/60 hover:text-white",
                    )}
                    href={href}
                    onClick={onClose}
                  >
                    <span
                      className={cn(
                        "h-5 w-5 shrink-0 transition-colors",
                        active ? "text-amber-300" : "text-slate-400",
                      )}
                    >
                      {Icon[item.iconKey]}
                    </span>
                    <span>{navLabels[item.labelKey]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer: kullanıcı etiketi */}
        <div className="border-t border-slate-800 px-5 py-3 text-xs text-slate-400">
          <span
            aria-hidden="true"
            className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400"
          />
          {labels.superadmin.user}
        </div>
      </aside>
    </>
  );
}
