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
    global.fetch = fetchSpy;
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

  /**
   * GOAL-117 polish: a11y — `Escape` tuşu overlay'i kapatır.
   * `dialog[role="dialog"]` öğesine odaklı olması gerekmez;
   * document düzeyinde dinlenir.
   */
  it("Escape tusu overlay'i kapatir", () => {
    render(
      <HelpButton locale={LOCALE} apiBaseUrl={API_BASE} labels={LABELS} />,
    );
    fireEvent.click(screen.getByTestId("help-button"));
    expect(screen.getByTestId("help-overlay")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("help-overlay")).not.toBeInTheDocument();
  });

  /**
   * GOAL-117 polish: a11y — `?` tuşu klavye kısayolu ile overlay'i
   * açar. Kısayol yalnızca kapalıyken ve input/textarea odaginda
   * degilken calisir.
   */
  it("? tusu overlay'i acmaya yarar (kisitay disindayken)", () => {
    render(
      <HelpButton locale={LOCALE} apiBaseUrl={API_BASE} labels={LABELS} />,
    );
    // Kapaliyken ? bas.
    fireEvent.keyDown(document, { key: "?" });
    expect(screen.getByTestId("help-overlay")).toBeInTheDocument();
  });

  it("? tusu acik overlay'i yeniden acmaya calismaz (no-op)", () => {
    render(
      <HelpButton locale={LOCALE} apiBaseUrl={API_BASE} labels={LABELS} />,
    );
    fireEvent.click(screen.getByTestId("help-button"));
    // ? bas, etkisi olmamali (zaten acik).
    fireEvent.keyDown(document, { key: "?" });
    expect(screen.getByTestId("help-overlay")).toBeInTheDocument();
  });

  /**
   * GOAL-117 polish: a11y — `aria-keyshortcuts` yardim butonunda
   * beyan edilir; ekran okuyucu kullanicilara kisayol bildirilir.
   */
  it("yardim butonu aria-keyshortcuts='?' tasir", () => {
    render(
      <HelpButton locale={LOCALE} apiBaseUrl={API_BASE} labels={LABELS} />,
    );
    expect(screen.getByTestId("help-button")).toHaveAttribute(
      "aria-keyshortcuts",
      "?",
    );
  });

  /**
   * GOAL-117 polish: a11y — overlay icinde FocusTrap kullaniliyor.
   * En azindan wizard overlay icinde render ediliyor ve wizard
   * overlay'in cocugu olarak ekranda.
   */
  it("overlay icinde FocusTrap wizard'i sarmalar", () => {
    render(
      <HelpButton locale={LOCALE} apiBaseUrl={API_BASE} labels={LABELS} />,
    );
    fireEvent.click(screen.getByTestId("help-button"));
    const overlay = screen.getByTestId("help-overlay");
    const wizard = screen.getByTestId("onboarding-wizard");
    // Wizard overlay'in DOM altinda.
    expect(overlay.contains(wizard)).toBe(true);
  });

  /**
   * GOAL-117 polish: behavior — 30 sn inaktiflikte overlay otomatik
   * kapanir. `autoDismiss=false` ile devre disi birakilabilir.
   * `vi.useFakeTimers` ile zamani ileri sarariz.
   */
  it("autoDismiss=true iken 30 sn sonra overlay kapanir", async () => {
    vi.useFakeTimers();
    try {
      render(
        <HelpButton
          locale={LOCALE}
          apiBaseUrl={API_BASE}
          labels={LABELS}
          autoDismiss={true}
        />,
      );
      fireEvent.click(screen.getByTestId("help-button"));
      expect(screen.getByTestId("help-overlay")).toBeInTheDocument();
      // 30 sn + 1 ms ileri sar.
      await vi.advanceTimersByTimeAsync(30_001);
      expect(screen.queryByTestId("help-overlay")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("autoDismiss=false iken overlay 30 sn sonra kapanmaz", async () => {
    vi.useFakeTimers();
    try {
      render(
        <HelpButton
          locale={LOCALE}
          apiBaseUrl={API_BASE}
          labels={LABELS}
          autoDismiss={false}
        />,
      );
      fireEvent.click(screen.getByTestId("help-button"));
      expect(screen.getByTestId("help-overlay")).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(60_000);
      // Hala acik olmali.
      expect(screen.getByTestId("help-overlay")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * GOAL-117 polish: behavior — kullanici etkilesimde bulundugunda
   * auto-dismiss sayaci sifirlanir (ornek: fare hareketi).
   */
  it("autoDismiss sayaci kullanci etkilesimde sifirlanir", async () => {
    vi.useFakeTimers();
    try {
      render(
        <HelpButton locale={LOCALE} apiBaseUrl={API_BASE} labels={LABELS} />,
      );
      fireEvent.click(screen.getByTestId("help-button"));
      // 20 sn gecir, sonra etkilesim.
      await vi.advanceTimersByTimeAsync(20_000);
      fireEvent.mouseMove(document.body);
      // 20 sn daha gecir — toplam 40 sn, ama sifirlama sayesinde
      // overlay hâlâ acik.
      await vi.advanceTimersByTimeAsync(20_000);
      expect(screen.getByTestId("help-overlay")).toBeInTheDocument();
      // 10 sn daha (toplam 30 sn etkilesimden beri), overlay kapansin.
      await vi.advanceTimersByTimeAsync(10_001);
      expect(screen.queryByTestId("help-overlay")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
