/**
 * @file Onboarding client unit testleri.
 * @module @vetniva/web/lib/onboarding-client.test
 * @description GOAL-117 (FAZ-11) — listOnboardingScenarios ve
 * askOnboarding helper'larının sözleşme davranışı. `apiRequest`
 * mock'lanır; gerçek ağ çağrısı yapılmaz.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api-client", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "./api-client";
import { askOnboarding, listOnboardingScenarios } from "./onboarding-client";

const mockedApiRequest = vi.mocked(apiRequest);

beforeEach(() => {
  mockedApiRequest.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("listOnboardingScenarios", () => {
  it("senaryo listesini döner", async () => {
    const scenarios = [
      {
        id: "scn-1",
        category: "patient_owner" as const,
        title: "Yeni hasta",
        steps: [],
      },
    ];
    mockedApiRequest.mockResolvedValueOnce({
      ok: true,
      data: { role: "VETERINARIAN" as const, scenarios },
      status: 200,
      requestId: "req-1",
    });
    const result = await listOnboardingScenarios("tr-TR");
    expect(result).toEqual(scenarios);
    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/api/v1/onboarding/scenarios?locale=tr-TR",
      { credentials: "include" },
    );
  });

  it("role parametresi URL'e eklenir", async () => {
    mockedApiRequest.mockResolvedValueOnce({
      ok: true,
      data: { role: "VETERINARIAN" as const, scenarios: [] },
      status: 200,
      requestId: null,
    });
    await listOnboardingScenarios("en-GB", "VETERINARIAN");
    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/api/v1/onboarding/scenarios?locale=en-GB&role=VETERINARIAN",
      { credentials: "include" },
    );
  });

  it("API hata döndüğünde boş liste döner", async () => {
    mockedApiRequest.mockResolvedValueOnce({
      ok: false,
      error: {
        error_code: "VET-COMMON-0001",
        message: "API hatası",
        source: "unknown",
        severity: "error",
        correlation_id: "req-err",
        timestamp: new Date().toISOString(),
      },
      requestId: "req-err",
    });
    const result = await listOnboardingScenarios("tr-TR");
    expect(result).toEqual([]);
  });
});

describe("askOnboarding", () => {
  it("soru gönderir ve yanıtı döner", async () => {
    const response = {
      query_id: "q-1",
      answer: "Yeni hasta için şu adımları izleyin",
      generationSource: "template" as const,
      scenario: {
        id: "scn-1",
        category: "patient_owner" as const,
        title: "Yeni hasta",
        steps: [],
      },
    };
    mockedApiRequest.mockResolvedValueOnce({
      ok: true,
      data: response,
      status: 200,
      requestId: "req-ask",
    });
    const result = await askOnboarding({
      locale: "tr-TR",
      query: "Yeni hasta nasıl eklenir?",
      role: "VETERINARIAN",
      currentPage: "/tr-TR/patients",
    });
    expect(result).toEqual(response);
    expect(mockedApiRequest).toHaveBeenCalledWith("/api/v1/onboarding/ask", {
      method: "POST",
      credentials: "include",
      body: {
        query: "Yeni hasta nasıl eklenir?",
        locale: "tr-TR",
        role: "VETERINARIAN",
        currentPage: "/tr-TR/patients",
      },
    });
  });

  it("soru kırpılır (trim)", async () => {
    mockedApiRequest.mockResolvedValueOnce({
      ok: true,
      data: {
        query_id: "q-2",
        answer: "",
        generationSource: "template" as const,
      },
      status: 200,
      requestId: null,
    });
    await askOnboarding({ locale: "tr-TR", query: "  aşı  " });
    expect(mockedApiRequest).toHaveBeenCalledWith("/api/v1/onboarding/ask", {
      method: "POST",
      credentials: "include",
      body: { query: "aşı", locale: "tr-TR" },
    });
  });

  it("opsiyonel alanlar (role, currentPage) gönderilmez", async () => {
    mockedApiRequest.mockResolvedValueOnce({
      ok: true,
      data: {
        query_id: "q-3",
        answer: "",
        generationSource: "template" as const,
      },
      status: 200,
      requestId: null,
    });
    await askOnboarding({ locale: "en-GB", query: "test" });
    expect(mockedApiRequest).toHaveBeenCalledWith("/api/v1/onboarding/ask", {
      method: "POST",
      credentials: "include",
      body: { query: "test", locale: "en-GB" },
    });
  });

  it("API hata döndüğünde uniform no-match cevabı döner", async () => {
    mockedApiRequest.mockResolvedValueOnce({
      ok: false,
      error: {
        error_code: "VET-COMMON-0001",
        message: "API hatası",
        source: "unknown",
        severity: "error",
        correlation_id: "req-err",
        timestamp: new Date().toISOString(),
      },
      requestId: "req-err",
    });
    const result = await askOnboarding({ locale: "tr-TR", query: "x" });
    expect(result).toEqual({
      query_id: "",
      answer: "",
      duration_ms: 0,
      generationSource: "template",
    });
  });
});
