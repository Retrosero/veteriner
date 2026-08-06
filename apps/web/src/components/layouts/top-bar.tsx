"use client";

/**
 * @file Üst bar (top bar).
 * @module @vetniva/web/components/layouts/top-bar
 * @description Sayfa başlığı, breadcrumb, bildirim, locale
 * switcher ve kullanıcı menüsünü içeren üst bar. Sabit yükseklik
 * (64px) ve mobil drawer tetikleyicisi içerir.
 *
 * Erişilebilirlik:
 * - `<header>` semantiği
 * - `aria-label` her bölümde
 * - Klavye ile gezinilebilir menü
 * - Dropdown menüler `aria-expanded` / `aria-haspopup` kullanır.
 * @security Bildirim ve kullanıcı menüsü tenant bağlamı taşır;
 * cross-tenant veri sızıntısı olmaması için bu bileşen yalnızca
 * oturum açmış kullanıcıya gösterilir (auth layout'ta kontrol
 * edilir).
 */

import { cn } from "@vetniva/ui";
import { useEffect, useRef, useState } from "react";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { getLabels, type Locale } from "@/lib/labels";

type TopBarProps = {
  locale: Locale;
  pageTitle: string;
  pageDescription?: string | undefined;
  user: {
    name: string;
    role: string;
  };
  onToggleSidebar: () => void;
};

const Icon = {
  menu: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  bell: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2zM10 21a2 2 0 0 0 4 0" />
    </svg>
  ),
  search: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  ),
  chevronDown: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
} as const;

/**
 *
 * @param root0
 * @param root0.locale
 * @param root0.pageTitle
 * @param root0.pageDescription
 * @param root0.user
 * @param root0.onToggleSidebar
 */
export function TopBar({
  locale,
  pageTitle,
  // `pageDescription` prop'u opsiyoneldir; ileride meta description
  // veya breadcrumb alt başlığı olarak kullanılabilir. Şimdilik
  // `_` prefix'i ile bilinçli olarak işaretlenmiştir.
  pageDescription: _pageDescription,
  user,
  onToggleSidebar,
}: TopBarProps): JSX.Element {
  const labels = getLabels(locale);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const userRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    /**
     *
     * @param event
     */
    function onClick(event: MouseEvent): void {
      if (
        notifRef.current &&
        !notifRef.current.contains(event.target as Node)
      ) {
        setNotifOpen(false);
      }
      if (userRef.current && !userRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header
      className="sticky top-0 z-20 flex h-[72px] items-center gap-4 border-b border-[#E1E5E2] bg-[#F7F8F7]/90 px-6 backdrop-blur-md"
      aria-label="Üst bar"
    >
      {/* Mobil menü düğmesi */}
      <button
        type="button"
        onClick={onToggleSidebar}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#5F6368] hover:bg-[#F1F5F1] lg:hidden"
        aria-label={labels.topbar.openMenu}
      >
        <span className="h-5 w-5">{Icon.menu}</span>
      </button>

      {/* Sayfa başlığı ve Breadcrumb */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-[#86868B]">
          <span>VetNiva</span>
          <span>/</span>
          <span className="text-[#5F6368] font-medium">{pageTitle}</span>
        </div>
        <h1 className="truncate text-xl font-semibold tracking-tight text-[#1D1D1F]">
          {pageTitle}
        </h1>
      </div>

      {/* Command-style Arama (desktop) */}
      <div className="hidden md:block">
        <label className="relative block">
          <span className="sr-only">{labels.topbar.search}</span>
          <span className="pointer-events-none absolute inset-y-0 left-0 grid w-9 place-items-center text-[#86868B]">
            <span className="h-4 w-4">{Icon.search}</span>
          </span>
          <input
            type="search"
            placeholder="Ara... (⌘K)"
            className="h-10 w-64 rounded-lg border border-[#D5DBD7] bg-white pl-9 pr-3 text-sm text-[#1D1D1F] placeholder:text-[#86868B] transition-colors focus:border-[#167A4A] focus:outline-none focus:ring-2 focus:ring-[#167A4A]/20"
          />
        </label>
      </div>

      {/* Klinik Seçici Switcher */}
      <div className="hidden sm:flex items-center gap-2 rounded-lg border border-[#E1E5E2] bg-white px-3 py-1.5 shadow-sm text-xs font-medium text-[#0D4D2E]">
        <span className="h-2 w-2 rounded-full bg-[#248A3D]" />
        <span>Pati Klinik</span>
        <span className="text-[#86868B]">{Icon.chevronDown}</span>
      </div>

      {/* Locale switcher */}
      <LocaleSwitcher />

      {/* Bildirimler */}
      <div ref={notifRef} className="relative">
        <button
          type="button"
          onClick={() => setNotifOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={notifOpen}
          aria-label={labels.topbar.notifications}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#5F6368] hover:bg-[#F1F5F1] transition-colors"
        >
          <span className="h-5 w-5">{Icon.bell}</span>
          <span
            aria-hidden="true"
            className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#167A4A] ring-2 ring-white"
          />
        </button>
        {notifOpen ? (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-72 rounded-[14px] border border-[#E1E5E2] bg-white p-3.5 shadow-lg z-50"
          >
            <p className="text-xs font-medium text-[#5F6368]">
              {labels.topbar.notifications}
            </p>
            <div className="mt-2 rounded-lg border border-dashed border-[#E1E5E2] p-3 text-center">
              <p className="text-xs text-[#86868B]">
                {labels.topbar.noNotifications}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Kullanıcı menüsü */}
      <div ref={userRef} className="relative">
        <button
          type="button"
          onClick={() => setUserMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={userMenuOpen}
          aria-label={labels.topbar.profile}
          className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-[#F1F5F1] transition-colors"
        >
          <div className="grid h-9 w-9 place-items-center rounded-full bg-[#E6F4EC] text-xs font-semibold text-[#0D4D2E]">
            DY
          </div>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-semibold text-[#1D1D1F]">
              {user.name}
            </span>
            <span className="block text-[11px] text-[#5F6368]">
              {user.role}
            </span>
          </span>
          <span className="hidden h-4 w-4 text-[#86868B] sm:block">
            {Icon.chevronDown}
          </span>
        </button>
        {userMenuOpen ? (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-56 rounded-[14px] border border-[#E1E5E2] bg-white p-1.5 shadow-lg z-50"
          >
            <div className="border-b border-[#ECEFED] px-3 py-2">
              <p className="text-sm font-medium text-[#1D1D1F]">{user.name}</p>
              <p className="text-xs text-[#5F6368]">{user.role}</p>
            </div>
            <a
              href={`/${locale}/profile`}
              className={cn(
                "block rounded-md px-3 py-2 text-sm text-[#1D1D1F] hover:bg-[#F1F5F1]",
              )}
              role="menuitem"
            >
              {labels.topbar.profile}
            </a>
            <a
              href={`/${locale}/login`}
              className="block rounded-md px-3 py-2 text-sm text-[#C3362C] hover:bg-[#FCEBEA]"
              role="menuitem"
            >
              {labels.nav.signOut}
            </a>
          </div>
        ) : null}
      </div>
    </header>
  );
}
