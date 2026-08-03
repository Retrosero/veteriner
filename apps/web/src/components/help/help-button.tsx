"use client";

/**
 * @file Yardim butonu + onboarding wizard tetikleyici.
 * @module @vetniva/web/components/help/help-button
 *
 * @description GOAL-117 (FAZ-11) — Sayfa alt kosede sabit "Yardim"
 * butonu. Tiklayinca onboarding wizard'i modal/overlay olarak
 * acar. Tüm authenticated roller (SUPERADMIN, OWNER,
 * VETERINARIAN, STAFF, PET_OWNER_PORTAL) icin erisilebilir.
 *
 * @security Backend zaten auth + role guard yapar; UI tarafi sadece
 *   acma/kapama davranisi saglar. PII tasimaz.
 * @since GOAL-117 (FAZ-11) ilk kullanim asistan
 */

import { useState, type ReactNode } from "react";
import { type Locale } from "@vetniva/contracts";
import { cn } from "@vetniva/ui";

import {
  OnboardingWizard,
  type OnboardingLabels,
} from "../onboarding/onboarding-wizard.js";

/**
 * Yardim butonu ozellikleri.
 */
export type HelpButtonProps = {
  locale: Locale;
  apiBaseUrl: string;
  labels: OnboardingLabels;
  /** Yardim butonu basligi (tooltip + ARIA). */
  title?: string;
  /** Opsiyonel pozisyon override'i. */
  className?: string;
};

/**
 * Yardim butonu. Sabit konum (alt sag) ile render edilir;
 * tiklaninca overlay olarak onboarding wizard acar.
 * @param root0
 * @param root0.locale
 * @param root0.apiBaseUrl
 * @param root0.labels
 * @param root0.title
 * @param root0.className
 */
export function HelpButton({
  locale,
  apiBaseUrl,
  labels,
  title,
  className,
}: HelpButtonProps): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={title ?? labels.helpButton}
        title={title ?? labels.helpButton}
        data-testid="help-button"
        className={cn(
          "fixed bottom-6 right-6 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-clinic-700 text-white shadow-lg transition-transform hover:scale-105 hover:bg-clinic-800 focus:outline-none focus:ring-2 focus:ring-clinic-500 focus:ring-offset-2",
          className,
        )}
      >
        <QuestionIcon />
      </button>
      {open ? (
        <HelpOverlay
          locale={locale}
          apiBaseUrl={apiBaseUrl}
          labels={labels}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * Overlay backdrop + wizard container.
 */
function HelpOverlay({
  locale,
  apiBaseUrl,
  labels,
  onClose,
}: {
  locale: Locale;
  apiBaseUrl: string;
  labels: OnboardingLabels;
  onClose: () => void;
}): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.helpButton}
      data-testid="help-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl">
        <OnboardingWizard
          locale={locale}
          apiBaseUrl={apiBaseUrl}
          labels={labels}
          onClose={onClose}
        />
      </div>
    </div>
  );
}

/**
 * Soru isareti ikonu (inline SVG, harici bagimlilik yok).
 */
function QuestionIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

/**
 * Yardim butonu provider. Sayfa seviyesinde cagrilir; labels
 * server-side props olarak alinir. Basit API kullanimi:
 * ```tsx
 * <HelpButtonProvider locale={locale} labels={labels} apiBaseUrl={...}>
 *   {children}
 * </HelpButtonProvider>
 * ```
 */
export type HelpButtonProviderProps = {
  locale: Locale;
  apiBaseUrl: string;
  labels: OnboardingLabels;
  children: ReactNode;
  title?: string;
};

export function HelpButtonProvider({
  locale,
  apiBaseUrl,
  labels,
  children,
  title,
}: HelpButtonProviderProps): JSX.Element {
  return (
    <>
      {children}
      <HelpButton
        locale={locale}
        apiBaseUrl={apiBaseUrl}
        labels={labels}
        {...(title ? { title } : {})}
      />
    </>
  );
}

/**
 * Re-export yardimci: yardim butonunu AppShell gibi layout
 * componentlerine eklemek icin tek import.
 */
