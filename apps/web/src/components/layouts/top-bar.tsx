"use client";

/**
 * @file Üst bar (top bar).
 * @module @vetniva/web/components/layouts/top-bar
 *
 * @description Sayfa başlığı, breadcrumb, bildirim, locale
 * switcher ve kullanıcı menüsünü içeren üst bar. Sabit yükseklik
 * (64px) ve mobil drawer tetikleyicisi içerir.
 *
 * Erişilebilirlik:
 * - `<header>` semantiği
 * - `aria-label` her bölümde
 * - Klavye ile gezinilebilir menü
 * - Dropdown menüler `aria-expanded` / `aria-haspopup` kullanır
 *
 * @security Bildirim ve kullanıcı menüsü tenant bağlamı taşır;
 * cross-tenant veri sızıntısı olmaması için bu bileşen yalnızca
 * oturum açmış kullanıcıya gösterilir (auth layout'ta kontrol
 * edilir).
 */

import { useEffect, useRef, useState } from "react";

import { Avatar, Badge, cn } from "@vetniva/ui";

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

export function TopBar({
  locale,
  pageTitle,
  pageDescription,
  user,
  onToggleSidebar,
}: TopBarProps): JSX.Element {
  const labels = getLabels(locale);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const userRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
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
      className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-gray-200 bg-white/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/75 lg:px-6"
      aria-label="Üst bar"
    >
      {/* Mobil menü düğmesi */}
      <button
        type="button"
        onClick={onToggleSidebar}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 lg:hidden"
        aria-label={labels.topbar.openMenu}
      >
        <span className="h-5 w-5">{Icon.menu}</span>
      </button>

      {/* Sayfa başlığı */}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold text-gray-900 sm:text-lg">
          {pageTitle}
        </h1>
        {pageDescription ? (
          <p className="hidden truncate text-xs text-gray-500 sm:block">
            {pageDescription}
          </p>
        ) : null}
      </div>

      {/* Arama (desktop) */}
      <div className="hidden md:block">
        <label className="relative block">
          <span className="sr-only">{labels.topbar.search}</span>
          <span className="pointer-events-none absolute inset-y-0 left-0 grid w-9 place-items-center text-gray-400">
            <span className="h-4 w-4">{Icon.search}</span>
          </span>
          <input
            type="search"
            placeholder={labels.topbar.search}
            className="h-9 w-56 rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-clinic-500 focus:outline-none focus:ring-1 focus:ring-clinic-500"
          />
        </label>
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
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100"
        >
          <span className="h-5 w-5">{Icon.bell}</span>
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-clinic-700 ring-2 ring-white"
          />
        </button>
        {notifOpen ? (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
          >
            <p className="text-xs font-medium text-gray-500">
              {labels.topbar.notifications}
            </p>
            <div className="mt-2 rounded-md border border-dashed border-gray-200 p-3 text-center">
              <p className="text-sm text-gray-500">
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
          className="flex items-center gap-2 rounded-md p-1 pr-2 hover:bg-gray-100"
        >
          <Avatar initials={user.name} size="sm" alt={user.name} />
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-medium text-gray-900">
              {user.name}
            </span>
            <span className="block text-[11px] text-gray-500">{user.role}</span>
          </span>
          <span className="hidden h-4 w-4 text-gray-400 sm:block">
            {Icon.chevronDown}
          </span>
        </button>
        {userMenuOpen ? (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-56 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
          >
            <div className="border-b border-gray-100 px-3 py-2">
              <p className="text-sm font-medium text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500">{user.role}</p>
            </div>
            <a
              href={`/${locale}/profile`}
              className={cn(
                "block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100",
              )}
              role="menuitem"
            >
              {labels.topbar.profile}
            </a>
            <a
              href={`/${locale}/login`}
              className="block rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
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
