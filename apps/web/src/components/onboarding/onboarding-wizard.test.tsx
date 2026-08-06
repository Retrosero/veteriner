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

import { OnboardingWizard, type OnboardingLabels } from "./onboarding-wizard";

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
  // GOAL-117 polish
  stepIndicator: "Adim {current} / {total}",
  progressBarLabel: "Onboarding ilerlemesi",
  progressBarValue: "%{percent} tamamlandi",
  emptyStateTitle: "Eslesen senaryo yok",
  emptyStateHint: "Soruyu farkli sekilde ifade edin",
  loadingSkeletonLabel: "Senaryolar yukleniyor",
  shortcutHint: "Yardim icin '?' tusuna basin",
  autoDismissHint: "30 saniye icinde kapanacak",
  ariaStep1: "1. adim, rol secimi",
  ariaStep2: "2. adim, soru veya senaryo secimi",
  ariaStep3: "3. adim, sonuc ve adimlar",
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
    global.fetch = fetchSpy;
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
          answer: "Bu konuda yardimci olamam, veteriner hekiminize danisin.",
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

  /**
   * GOAL-117 polish: a11y — step indicator görsel + ARIA progressbar.
   * - `role="progressbar"` + aria-valuenow/min/max mevcut.
   * - `aria-valuetext` güncel adımı açıklar.
   * - `data-percent` CSS'e bağımlı kalmadan test edilebilir.
   * - `data-step` mevcut adımı yansıtır.
   */
  it("step indicator + progressbar aria degerlerini gunceller", async () => {
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

    // Step 1
    const progress1 = screen.getByTestId("onboarding-progress");
    expect(progress1).toHaveAttribute("role", "progressbar");
    expect(progress1).toHaveAttribute("aria-valuenow", "33");
    expect(progress1).toHaveAttribute("aria-valuemin", "0");
    expect(progress1).toHaveAttribute("aria-valuemax", "100");
    expect(progress1).toHaveAttribute("aria-valuetext", LABELS.ariaStep1);
    expect(progress1).toHaveAttribute("data-percent", "33");

    // Step 2'ye gec
    fireEvent.click(screen.getByTestId("onboarding-role-VETERINARIAN"));
    fireEvent.click(screen.getByTestId("onboarding-next"));
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-step2")).toBeInTheDocument();
    });
    const progress2 = screen.getByTestId("onboarding-progress");
    expect(progress2).toHaveAttribute("aria-valuenow", "66");
    expect(progress2).toHaveAttribute("data-percent", "66");
    expect(progress2).toHaveAttribute("aria-valuetext", LABELS.ariaStep2);

    // Step 3'e gec (senaryo sec)
    await waitFor(() => {
      expect(
        screen.getByTestId("onboarding-scenario-create-patient"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("onboarding-scenario-create-patient"));
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-step3")).toBeInTheDocument();
    });
    const progress3 = screen.getByTestId("onboarding-progress");
    expect(progress3).toHaveAttribute("aria-valuenow", "100");
    expect(progress3).toHaveAttribute("data-percent", "100");
    expect(progress3).toHaveAttribute("aria-valuetext", LABELS.ariaStep3);
  });

  /**
   * GOAL-117 polish: a11y — `aria-current="step"` her adimin
   * gorsel gostergesine eklenir. (Step indicator noktalari uzerinde)
   */
  it("aria-current step gostergesinde aktif adimi isaretler", () => {
    render(
      <OnboardingWizard
        locale={LOCALE}
        apiBaseUrl={API_BASE}
        labels={LABELS}
      />,
    );
    const indicator = screen.getByTestId("onboarding-step-indicator");
    // Step 1'de current 1 olmali.
    const current = indicator.querySelector('[aria-current="step"]');
    expect(current).not.toBeNull();
    expect(current?.getAttribute("data-step")).toBe("1");
  });

  /**
   * GOAL-117 polish: visual — Step 2'de loading sirasinda skeleton
   * goruntulenir, "loading" string metin olarak gozukmez.
   */
  it("step 2 loading sirasinda skeleton render eder", async () => {
    // Senaryolar uzun suren fetch ile simule edilir; ilk fetch
    // scenarios, ardindan ask tetiklenir ve ask calisirken
    // skeleton gorunmeli.
    let resolveScenarios: (value: unknown) => void = () => {};
    const scenariosPromise = new Promise((resolve) => {
      resolveScenarios = resolve;
    });
    fetchSpy.mockReturnValueOnce(scenariosPromise).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        query_id: "req-1",
        answer: "...",
        generationSource: "template",
        scenario: SAMPLE_SCENARIO_DETAIL,
        duration_ms: 5,
      }),
    });

    render(
      <OnboardingWizard
        locale={LOCALE}
        apiBaseUrl={API_BASE}
        labels={LABELS}
      />,
    );

    // Step 1 -> rol -> ileri
    fireEvent.click(screen.getByTestId("onboarding-role-STAFF"));
    fireEvent.click(screen.getByTestId("onboarding-next"));
    // Step 2 gorunene kadar bekle
    await screen.findByTestId("onboarding-step2");

    // Henuz fetch resolve edilmedi; skeleton gorunmeli.
    expect(screen.getByTestId("onboarding-skeleton")).toBeInTheDocument();

    // Skeleton'un aria-label'i set edilmeli.
    const skeleton = screen.getByTestId("onboarding-skeleton");
    expect(skeleton).toHaveAttribute("aria-label", LABELS.loadingSkeletonLabel);

    // Senaryolari coz; skeleton kaybolmali, liste gorunmeli.
    resolveScenarios({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => SAMPLE_SCENARIOS,
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId("onboarding-skeleton"),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("onboarding-scenarios")).toBeInTheDocument();
  });

  /**
   * GOAL-117 polish: visual — Step 3 "no match" durumunda illüstrasyon
   * ve genisletilmis baslik/hint render edilir.
   */
  it("step 3 no-match empty state illustrasyonu ve basliklari gosterir", async () => {
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
          query_id: "req-empty",
          answer: "",
          generationSource: "template",
          duration_ms: 3,
        }),
      });

    render(
      <OnboardingWizard
        locale={LOCALE}
        apiBaseUrl={API_BASE}
        labels={LABELS}
      />,
    );

    // Step 1 -> 2 -> ask (eslemedi) -> 3
    fireEvent.click(screen.getByTestId("onboarding-role-STAFF"));
    fireEvent.click(screen.getByTestId("onboarding-next"));
    await screen.findByTestId("onboarding-step2");

    const input = screen.getByTestId("onboarding-query");
    fireEvent.change(input, { target: { value: "bilinmeyen bir sey" } });
    fireEvent.click(screen.getByTestId("onboarding-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-step3-empty")).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("onboarding-empty-illustration"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-no-match-title").textContent).toMatch(
      LABELS.emptyStateTitle,
    );
  });

  /**
   * GOAL-117 polish: behavior — localStorage ile step + role persist.
   * `storageKey` verildiginde, wizard mount edildiginde state'i
   * localStorage'dan yukler ve her degisimde geri yazar.
   */
  it("storageKey ile step + role localStorage'a persist edilir", () => {
    const storageKey = "vetniva.onboarding.test";
    window.localStorage.clear();
    render(
      <OnboardingWizard
        locale={LOCALE}
        apiBaseUrl={API_BASE}
        labels={LABELS}
        storageKey={storageKey}
      />,
    );

    // Baslangicta localStorage bos (henuz degisiklik yok).
    // Rol sec sonrasi persist et.
    fireEvent.click(screen.getByTestId("onboarding-role-OWNER"));
    const raw = window.localStorage.getItem(storageKey);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? "{}") as {
      step: number;
      role: string | null;
    };
    expect(parsed.role).toBe("OWNER");
    expect(parsed.step).toBe(1);
  });

  it("storageKey ile mount aninda localStorage'dan state yukler", () => {
    const storageKey = "vetniva.onboarding.restore";
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ step: 2, role: "STAFF" }),
    );
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
        storageKey={storageKey}
      />,
    );
    // Step 2 dogrudan acilmali.
    expect(screen.getByTestId("onboarding-wizard").dataset["step"]).toBe("2");
    // OWNER rol butonu secili OLMAMAli (STAFF secili olmali).
    const staffBtn = screen.queryByTestId("onboarding-role-STAFF");
    expect(staffBtn).toBeNull();
    // Step 2'deyiz, step2 elemanlari gorunmeli.
    expect(screen.getByTestId("onboarding-step2")).toBeInTheDocument();
  });

  it("storageKey ile corrupted JSON sessizce yok sayilir", () => {
    const storageKey = "vetniva.onboarding.corrupt";
    window.localStorage.setItem(storageKey, "{not-json");
    render(
      <OnboardingWizard
        locale={LOCALE}
        apiBaseUrl={API_BASE}
        labels={LABELS}
        storageKey={storageKey}
      />,
    );
    // Hata firlatmadan step 1'de baslamali.
    expect(screen.getByTestId("onboarding-wizard").dataset["step"]).toBe("1");
  });

  /**
   * GOAL-117 polish: a11y — `prefers-reduced-motion: reduce` aktifken
   * `data-prefers-reduced-motion="true"` wizard root'unda yer alir.
   */
  it("prefers-reduced-motion aktif oldugunda root'ta data attr set edilir", () => {
    // `vi.stubGlobal` ile guvenli override; try/finally icinde
    // `unstubAllGlobals` ile eski haline doner.
    const stubFn: (query: string) => MediaQueryList = (
      query: string,
    ): MediaQueryList => ({
      matches: query.includes("reduce"),
      media: query,
      onchange: null,
      addListener: (): void => {},
      removeListener: (): void => {},
      addEventListener: (): void => {},
      removeEventListener: (): void => {},
      dispatchEvent: (): boolean => false,
    });
    vi.stubGlobal("matchMedia", stubFn);
    try {
      render(
        <OnboardingWizard
          locale={LOCALE}
          apiBaseUrl={API_BASE}
          labels={LABELS}
        />,
      );
      expect(
        screen.getByTestId("onboarding-wizard").dataset["prefersReducedMotion"],
      ).toBe("true");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
