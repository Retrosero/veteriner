/**
 * @file Uygulama kabuğu (app shell).
 * @module @vetniva/web/components/layouts/app-shell
 * @description Sidebar + TopBar + içerik alanını bir araya getiren
 * layout primitive. Tüm kimliği doğrulanmış sayfalar bu kabuğu
 * kullanır. Login gibi kimlik doğrulama gerektirmeyen sayfalar
 * kendi basit layout'larını kullanır.
 *
 * Erişilebilirlik:
 * - Skip-link: "İçeriğe geç" klavye kullanıcıları için
 * - `<main>` semantiği, `aria-label="Ana içerik"`
 * - Sidebar mobil drawer olarak klavye dostu (Escape kapatır).
 * @security Tenant context bu katmanda gösterilmez; her sayfa
 * kendi tenant guard'ından sorumludur.
 */

"use client";

import { useState, type ReactNode } from "react";

import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

import type { Locale } from "@/lib/labels";

export type AppShellProps = {
  locale: Locale;
  pageTitle: string;
  pageDescription?: string;
  user: {
    name: string;
    role: string;
  };
  children: ReactNode;
};

/**
 *
 * @param root0
 * @param root0.locale
 * @param root0.pageTitle
 * @param root0.pageDescription
 * @param root0.user
 * @param root0.children
 */
export function AppShell({
  locale,
  pageTitle,
  pageDescription,
  user,
  children,
}: AppShellProps): JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F7F8F7]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-[#167A4A] focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        İçeriğe geç
      </a>

      <div className="flex min-h-screen">
        <Sidebar
          locale={locale}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <TopBar
            locale={locale}
            pageTitle={pageTitle}
            pageDescription={pageDescription}
            user={user}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
          />

          <main
            id="main-content"
            aria-label="Ana içerik"
            className="flex-1 px-4 py-6 sm:px-6 lg:px-8"
          >
            <div className="mx-auto w-full max-w-[1600px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
