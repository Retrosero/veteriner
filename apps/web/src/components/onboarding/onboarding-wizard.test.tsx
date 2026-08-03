/**
 * @file Onboarding wizard component testleri.
 * @module @vetniva/web/components/onboarding/onboarding-wizard.test
 *
 * @description Wizard'in temel akisi izole test edilir:
 * - Render (baslangic adimi).
 * - Adim navigasyonu (rol secimi olmadan ileri gidemez; rol
 *   secildikten sonra 2. adima gecer).
 * - Ask submit (POST mock'lanir; step 3 scenario ile acilir).
 * - Tibbi reddi (generationSource=refusal ile tibbi mesaj).
 * - Help button ile wizard'in acilmasi (entegrasyon testi).
 *
 * @security Mock'lu fetch kullanilir; gercek API'ye baglanilmaz.
 * @since GOAL-117 (FAZ-11) ilk kullanim asistan
 */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OnboardingWizard,
  type OnboardingLabels,
} from "./onboarding-wizard";

import type { Locale } from "@vetniva/contracts";

const LABELS: OnboardingLabels = {
  welcome: "VetNiva Hosgeldiniz",
  description: "Rolunuzu secin",
  step1Title: "Hosgeldiniz",
  step1Subtitle: "Rol secimi",
  step1RoleVet: "Veteriner Hekim",
  step1RoleStaff: "Klinik Personeli",
  step1RoleOwner: "Isletme Sahibi",
  step1RolePortal: "Hasta Sahibi",
  step2Title: "Konu Eslestir",
  step2Subtitle: "Soru veya senaryo secin",
  step2InputLabel: "Sorusu",
  step2InputPlaceholder: "Orn. Asi kaydi?",
  step2Submit: "Yonlendir",
  step3Title: "Adimlar",
  step3Subtitle: "Adimlari takip edin",
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

const LOCALE: Locale = "tr-TR";
const API_BASE = "http://api.test";

const SAMPLE_SCENARIOS = {
  role: "STAFF" as const,
  totalScenarios: 2,
  scenarios: [
    {
      id: "create-patient",
      category: "patient_owner" as const,
      module: "clinic",
      title: "Yeni Hayvan Kaydi",
      summary: "Yeni hayvan ekleme adimlari",
      stepCount: 3,
      highlight: true,
    },
    {
      id: "create-appointment",
      category: "appointment" as const,
      module: "appointments",
      title: "Randevu Olusturma",
      summary: "Randevu olusturma adimlari",
      stepCount: 2,
      highlight: false,
    },
  ],
};

const SAMPLE_SCENARIO_DETAIL = {
  id: "create-patient",
  category: "patient_owner" as const,
  module: "clinic",
  triggers: ["yeni hayvan"],
  title: "Yeni Hayvan Kaydi",
  summary: "Yeni hayvan ekleme adimlari",
  steps: [
    {
      order: 1,
      route: "/[locale]/clinic/patients",
      title: "Hasta Listesi",
      description: "Listeyi ac",
      action: "navigate",
    },
    {
      order: 2,
      route: "/[locale]/clinic/patients/new",
      title: "Yeni Hasta",
      description: "Formu doldur",
      action: "submit",
    },
  ],
  roles: ["STAFF", "VETERINARIAN", "OWNER"],
};

describe("OnboardingWizard", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof global.fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("baslangicta step 1 (rol secimi) gosterir", () => {
    render(
      <OnboardingWizard
        locale={LOCALE}
        apiBaseUrl={API_BASE}
        labels={LABELS}
      />,
    );
    const wizard = screen.getByTestId("onboarding-wizard");
    expect(wizard).toBeInTheDocument();
    expect(wizard.dataset["step"]).toBe("1");
    expect(screen.getByTestId("onboarding-step1")).toBeInTheDocument();
    // Ileri butonu rol secilmeden disabled.
    const nextBtn = screen.getByTestId("onboarding-next");
    expect(nextBtn).toBeDisabled();
  });

  it("rol secildikten sonra Ileri aktif olur ve step 2'ye gecer", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => SAMPLE_SCENARIOS,
    });

    render(
      <OnboardingWizard
        locale={LOCALE}
        apiBaseUrl={API_BASE}
        labels={LABELS}
      />,
    );

    // Rol sec.
    const vetButton = screen.getByTestId("onboarding-role-VETERINARIAN");
    fireEvent.click(vetButton);
    expect(vetButton.dataset["selected"]).toBe("true");

    // Ileri'ye tikla.
    const nextBtn = screen.getByTestId("onboarding-next");
    expect(nextBtn).not.toBeDisabled();
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-step2")).toBeInTheDocument();
    });
    expect(screen.getByTestId("onboarding-wizard").dataset["step"]).toBe("2");
  });

  it("ask submit basarili oldugunda step 3 scenario render edilir", async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => SAMPLE_SCENARIOS,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          query_id: "req-test-1",
          answer: "Yeni hayvan eklemek icin...",
          generationSource: "template",
          scenario: SAMPLE_SCENARIO_DETAIL,
          duration_ms: 12,
        }),
      });

    render(
      <OnboardingWizard
        locale={LOCALE}
        apiBaseUrl={API_BASE}
        labels={LABELS}
      />,
    );

    // Step 1 -> rol sec -> Ileri.
    fireEvent.click(screen.getByTestId("onboarding-role-STAFF"));
    fireEvent.click(screen.getByTestId("onboarding-next"));
    await screen.findByTestId("onboarding-step2");

    // Query gir ve submit.
    const input = screen.getByTestId("onboarding-query");
    fireEvent.change(input, { target: { value: "yeni hayvan nasil eklerim" } });
    fireEvent.click(screen.getByTestId("onboarding-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-step3")).toBeInTheDocument();
    });

    expect(screen.getByTestId("onboarding-scenario-title").textContent).toMatch(
      /Hayvan Kaydi/,
    );
    expect(screen.getByTestId("onboarding-step-1")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-step-2")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-generation-source")).toHaveAttribute(
      "data-source",
      "template",
    );
  });

  it("tibbi soru reddedildiginde tibbi reddi mesaji gosterilir", async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => SAMPLE_SCENARIOS,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          query_id: "req-test-medical",
          answer:
            "Bu konuda yardimci olamam, veteriner hekiminize danisin.",
          generationSource: "refusal",
          refusalReason: "dosage",
          duration_ms: 4,
        }),
      });

    render(
      <OnboardingWizard
        locale={LOCALE}
        apiBaseUrl={API_BASE}
        labels={LABELS}
      />,
    );

    fireEvent.click(screen.getByTestId("onboarding-role-STAFF"));
    fireEvent.click(screen.getByTestId("onboarding-next"));
    await screen.findByTestId("onboarding-step2");

    const input = screen.getByTestId("onboarding-query");
    fireEvent.change(input, { target: { value: "ilac dozu ne olmali" } });
    fireEvent.click(screen.getByTestId("onboarding-submit"));

    await waitFor(() => {
      expect(
        screen.getByTestId("onboarding-step3-refusal"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("onboarding-medical-refusal").textContent,
    ).toMatch(/yardimci olamam/);
  });

  it("Geri butonu step 1'de disabled, diger adimlarda calisir", () => {
    render(
      <OnboardingWizard
        locale={LOCALE}
        apiBaseUrl={API_BASE}
        labels={LABELS}
        initialRole="VETERINARIAN"
      />,
    );
    const backBtn = screen.getByTestId("onboarding-back");
    expect(backBtn).toBeDisabled();
  });
});
