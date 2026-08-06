/**
 * @file Onboarding API istemcisi.
 * @module @vetniva/web/lib/onboarding-client
 * @description GOAL-117 (FAZ-11) ilk kullanım asistanı için ince
 * sarmalayıcı. `apiRequest` (apps/web/src/lib/api-client) üzerinden
 * `/api/v1/onboarding/scenarios` ve `/api/v1/onboarding/ask`
 * endpoint'lerini çağırır. X-Request-Id korelasyonu otomatik.
 *
 * Bu modül, `OnboardingWizard` ve gelecekteki chat-benzeri arayüzler
 * için ortak helper sunar. Session cookie'leri
 * `credentials: "include"` ile otomatik taşınır.
 *
 * @security Backend rol/modül filtresini aktör bağlamından uygular;
 * frontend tenant veya kullanıcı kimliği göndermez. Tıbbi sorular
 * backend tarafından reddedilir; UI aynı cevabı render eder.
 */

import {
  type Locale,
  type OnboardingAskResponse,
  type OnboardingRole,
  type OnboardingScenarioListResponse,
} from "@vetniva/contracts";

import { apiRequest } from "./api-client";

/**
 * Onboarding senaryolarını listele. Hata durumunda boş liste döner;
 * çağıran UI yüklenemedi rozetini gösterebilir.
 *
 * @param locale
 * @param role
 */
export async function listOnboardingScenarios(
  locale: Locale,
  role?: OnboardingRole,
): Promise<OnboardingScenarioListResponse["scenarios"]> {
  const params = new URLSearchParams({ locale });
  if (role) params.set("role", role);
  const result = await apiRequest<OnboardingScenarioListResponse>(
    `/api/v1/onboarding/scenarios?${params.toString()}`,
    { credentials: "include" },
  );
  if (result.ok) return result.data.scenarios;
  return [];
}

/**
 * Onboarding "X nasıl yapılır?" sorusu. Backend eşleşen senaryo veya
 * tıbbi reddi cevabı döner. Hata durumunda uniform "no-match"
 * davranışı: UI step 3'te "eşleşme yok" mesajı gösterir.
 *
 * @param input
 */
export async function askOnboarding(input: {
  locale: Locale;
  query: string;
  role?: OnboardingRole;
  currentPage?: string;
}): Promise<OnboardingAskResponse> {
  const body = {
    query: input.query.trim(),
    locale: input.locale,
    ...(input.role ? { role: input.role } : {}),
    ...(input.currentPage ? { currentPage: input.currentPage } : {}),
  };
  const result = await apiRequest<OnboardingAskResponse>(
    "/api/v1/onboarding/ask",
    {
      method: "POST",
      credentials: "include",
      body,
    },
  );
  if (result.ok) return result.data;
  return {
    query_id: "",
    answer: "",
    duration_ms: 0,
    generationSource: "template",
  };
}
