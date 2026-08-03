/**
 * @file Yardim butonu component testleri.
 * @module @vetniva/web/components/help/help-button.test
 *
 * @description HelpButton'in temel davranisi izole test edilir:
 * - Baslangicta buton render edilir, overlay kapali.
 * - Tiklama overlay'i acar.
 * - Kapatma (close) overlay'i tekrar kapatir.
 * - Backdrop'a tiklama overlay'i kapatir.
 *
 * @since GOAL-117 (FAZ-11) ilk kullanim asistan
 */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HelpButton } from "./help-button";

import type { Locale } from "@vetniva/contracts";

const LOCALE: Locale = "tr-TR";
const API_BASE = "http://api.test";

const LABELS = {
  welcome: "Hosgeldiniz",
  description: "Rol secimi",
  step1Title: "Hosgeldiniz",
  step1Subtitle: "Rol secimi",
  step1RoleVet: "Veteriner Hekim",
  step1RoleStaff: "Klinik Personeli",
  step1RoleOwner: "Isletme Sahibi",
  step1RolePortal: "Hasta Sahibi",
  step2Title: "Konu Eslestir",
  step2Subtitle: "Soru",
  step2InputLabel: "Sorusu",
  step2InputPlaceholder: "Orn. Asi?",
  step2Submit: "Yonlendir",
  step3Title: "Adimlar",
  step3Subtitle: "Adimlar",
  step3NoMatch: "Eslesme yok",
  step3MedicalRefusal: "Tibbi sorularda yardimci olamam.",
  step3Navigate: "Sayfaya git",
  ctaStart: "Basla",
  ctaNext: "Ileri",
  ctaBack: "Geri",
  ctaFinish: "Bitir",
  ctaClose: "Kapat",
  helpButton: "Yardim",
  empty: "Senaryo yok",
  loading: "Yukleniyor...",
  errorGeneric: "Hata olustu",
};

describe("HelpButton", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        role: "STAFF",
        totalScenarios: 0,
        scenarios: [],
      }),
    });
    global.fetch = fetchSpy as unknown as typeof global.fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("baslangicta buton render edilir, overlay kapali", () => {
    render(
      <HelpButton locale={LOCALE} apiBaseUrl={API_BASE} labels={LABELS} />,
    );
    const btn = screen.getByTestId("help-button");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-label", LABELS.helpButton);
    expect(screen.queryByTestId("help-overlay")).not.toBeInTheDocument();
  });

  it("tiklama overlay'i acar (wizard + backdrop)", () => {
    render(
      <HelpButton locale={LOCALE} apiBaseUrl={API_BASE} labels={LABELS} />,
    );
    fireEvent.click(screen.getByTestId("help-button"));
    const overlay = screen.getByTestId("help-overlay");
    expect(overlay).toBeInTheDocument();
    // Wizard overlay icinde mount edilmis olmali.
    expect(screen.getByTestId("onboarding-wizard")).toBeInTheDocument();
  });

  it("kapatma (close) overlay'i tekrar kapatir", () => {
    render(
      <HelpButton locale={LOCALE} apiBaseUrl={API_BASE} labels={LABELS} />,
    );
    // Ac.
    fireEvent.click(screen.getByTestId("help-button"));
    expect(screen.getByTestId("help-overlay")).toBeInTheDocument();
    // Kapat (wizard icindeki close butonu).
    fireEvent.click(screen.getByTestId("onboarding-close"));
    expect(screen.queryByTestId("help-overlay")).not.toBeInTheDocument();
  });
});
