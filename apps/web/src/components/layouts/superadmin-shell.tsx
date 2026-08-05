/**
 * @file Süper admin uygulama kabuğu.
 * @module @vetniva/web/components/layouts/superadmin-shell
 * @description FAZ-10 SUPERADMIN paneli için kenar çubuğu + üst
 * başlık + içerik alanını bir araya getiren layout primitive.
 * Klinik uygulamasının ana `AppShell`'inden farklıdır: koyu ton,
 * tenant-üstü görünüm ve SUPERADMIN menüsü. Tüm `/[locale]/superadmin/*`
 * sayfaları bu kabuğu kullanır.
 *
 * Erişilebilirlik:
 * - Skip-link: "İçeriğe geç" klavye kullanıcıları için
 * - `<main>` semantiği, `aria-label="Ana içerik"`
 * - Sidebar mobil drawer (Escape kapatır).
 * @security SUPERADMIN uçları `audit:log:read` permission'ı gerektirir.
 * Auth kontrolü server katmanında (layout.tsx) yapılır; client
 * component yalnız görsel sarmalayıcıdır.
 */

"use client";

import { useState, type ReactNode } from "react";

import { SuperadminSidebar } from "./superadmin-sidebar";
import { TopBar } from "./top-bar";

import type { Locale } from "@/lib/labels";

export type SuperadminShellProps = {
  locale: Locale;
  pageTitle: string;
  pageDescription?: string;
  user?: {
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
export function SuperadminShell({
  locale,
  pageTitle,
  pageDescription,
  user,
  children,
}: SuperadminShellProps): JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#superadmin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-amber-500 focus:px-3 focus:py-2 focus:text-sm focus:text-slate-900"
      >
        İçeriğe geç
      </a>

      <div className="flex min-h-screen">
        <SuperadminSidebar
          locale={locale}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <TopBar
            locale={locale}
            pageTitle={pageTitle}
            pageDescription={pageDescription}
            user={user ?? { name: "Süper Admin", role: "SUPERADMIN" }}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
          />

          <main
            id="superadmin-main"
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
