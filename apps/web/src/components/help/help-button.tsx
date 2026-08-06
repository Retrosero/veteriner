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
 * GOAL-117 polish:
 * - `Escape` tuşu ile wizard kapatilir.
 * - `FocusTrap` ile klavye odağı overlay içinde hapseder.
 * - `?` tuşu klavye kisayolu ile overlay acilir (sayfa seviyesinde).
 * - 30 saniye inaktiflik sonrasi overlay otomatik kapanir.
 * - `prefers-reduced-motion` aktifken transition kapatilir.
 *
 * @security Backend zaten auth + role guard yapar; UI tarafi sadece
 *   acma/kapama davranisi saglar. PII tasimaz.
 * @since GOAL-117 (FAZ-11) ilk kullanim asistan
 */

import { type Locale } from "@vetniva/contracts";
import { cn } from "@vetniva/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  OnboardingWizard,
  type OnboardingLabels,
} from "../onboarding/onboarding-wizard";
import { FocusTrap } from "../superadmin/focus-trap";

/**
 * GOAL-117 polish: inaktiflik suresi (ms). Surekli etkilesim
 * (mouse hareketi, klavye, scroll) ile sifirlanir; aksi halde
 * wizard otomatik kapanir.
 */
const AUTO_DISMISS_MS = 30_000;

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
  /**
   * GOAL-117 polish: 30 sn inaktiflikte otomatik kapatma. Default
   * `true`. Test ortaminda `false` verilerek kapatilabilir.
   */
  autoDismiss?: boolean;
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
 * @param root0.autoDismiss
 */
export function HelpButton({
  locale,
  apiBaseUrl,
  labels,
  title,
  className,
  autoDismiss = true,
}: HelpButtonProps): JSX.Element {
  const [open, setOpen] = useState(false);

  // GOAL-117 polish: `prefers-reduced-motion` izleme (yardim
  // butonundaki gecisleri kapatmak icin).
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(
    () => {
      if (typeof window === "undefined") return false;
      try {
        return (
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
        );
      } catch {
        return false;
      }
    },
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent): void => {
      setPrefersReducedMotion(e.matches);
    };
    mql.addEventListener("change", handler);
    return () => {
      mql.removeEventListener("change", handler);
    };
  }, []);

  // GOAL-117 polish: `?` tuşu kısayolu. Acik overlay varken veya
  // bir input/textarea odagindayken kisayol yutulur.
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key !== "?") return;
      if (open) return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setOpen(true);
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={title ?? labels.helpButton}
        aria-keyshortcuts="?"
        title={`${title ?? labels.helpButton} (?)`}
        data-testid="help-button"
        className={cn(
          "fixed bottom-6 right-6 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-clinic-700 text-white shadow-lg hover:bg-clinic-800 focus:outline-none focus:ring-2 focus:ring-clinic-500 focus:ring-offset-2",
          !prefersReducedMotion && "transition-colors",
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
          autoDismiss={autoDismiss}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * Overlay backdrop + wizard container.
 *
 * GOAL-117 polish:
 * - `Escape` tuşu `onClose` çağırır.
 * - `FocusTrap` klavye odağını hapseder.
 * - 30 sn inaktiflikte overlay otomatik kapanır (autoDismiss=true).
 */
function HelpOverlay({
  locale,
  apiBaseUrl,
  labels,
  onClose,
  autoDismiss,
}: {
  locale: Locale;
  apiBaseUrl: string;
  labels: OnboardingLabels;
  onClose: () => void;
  autoDismiss: boolean;
}): JSX.Element {
  // GOAL-117 polish: 30 sn inaktiflikte otomatik kapatma.
  // Mouse, klavye, touch ve scroll hareketleri ile sifirlanir.
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!autoDismiss) return;
    function reset(): void {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
      dismissTimerRef.current = setTimeout(() => {
        onClose();
      }, AUTO_DISMISS_MS);
    }
    reset();
    const events: Array<keyof DocumentEventMap> = [
      "mousemove",
      "keydown",
      "touchstart",
      "scroll",
      "click",
    ];
    for (const evt of events) {
      document.addEventListener(evt, reset, { passive: true });
    }
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
      for (const evt of events) {
        document.removeEventListener(evt, reset);
      }
    };
  }, [autoDismiss, onClose]);

  // GOAL-117 polish: Escape tusu ile kapat.
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

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
        <FocusTrap active={true}>
          <OnboardingWizard
            locale={locale}
            apiBaseUrl={apiBaseUrl}
            labels={labels}
            onClose={onClose}
          />
        </FocusTrap>
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
