/**
 * @file Pilot kabul (UAT) senaryo calistirici (runner).
 * @module @vetniva/acceptance-test/runner
 *
 * @description GOAL-121 (FAZ-12) kapsaminda UatScenarioConfig
 * listesini alip API uzerinde sirayla calistirir. Her adim
 * icin sure (durationMs), HTTP status, hata, response'tan
 * cozulen placeholder degerleri ve pilot geri bildirimi
 * UatStepResult olarak toplanir.
 *
 * Bagimlilik notlari:
 *  - Placeholder cozumu: onceki adimlardan toplanan
 *    extracted map'inden {xxx} bicimindeki ifadeler path
 *    ve body'se uygulanir. Dairekisel referans tespit
 *    edilirse hata firlatilir (placeholderSelfRef hata
 *    kodu).
 *  - expectField dogrulamasi: response body'sinden nokta
 *    notasyonu ile okunur; undefined/null/empty ise basarisiz.
 *  - fetchFn testte inject edilir; uretimde Node 20+ global
 *    fetch kullanilir.
 *
 * @since GOAL-121 (FAZ-12) pilot kabul testleri
 */

import type {
  HttpMethod,
  UatFeedback,
  UatScenarioConfig,
  UatScenarioResult,
  UatStep,
  UatStepResult,
} from "./types.js";

/** Senaryo basina fetch davranisi (testte inject edilir). */
export type UatFetch = (
  method: HttpMethod,
  url: string,
  init: { body?: unknown; headers?: Record<string, string> },
) => Promise<{ status: number; body: unknown }>;

/** Runner'a disaridan verilen kimlik/header bilgisi. */
export interface UatAuthContext {
  /** Pilot operatorunun auth token'i (Bearer). Bos olabilir. */
  token: string;
  /** Tenant id header degeri (X-Tenant-Id). Bos olabilir. */
  tenantId: string;
  /** Branch id header degeri (X-Branch-Id). Bos olabilir. */
  branchId: string;
}

/** Tek senaryo calistirma secenekleri. */
export interface RunScenarioOptions {
  /** Senaryo tanimi. */
  scenario: UatScenarioConfig;
  /** API base URL (orn: http://localhost:3001). */
  baseUrl: string;
  /** Auth/header bilgisi. */
  auth: UatAuthContext;
  /**
   * Disaridan gelen pilot geri bildirimi (adim adi -> feedback).
   * Calistirici sadece okur, dogrudan iliiskilendirir.
   */
  feedbackByStep?: ReadonlyMap<string, UatFeedback>;
  /** Fetch implementasyonu (testte inject). */
  fetchFn?: UatFetch;
  /**
   * Onceki senaryolardan devralinan placeholder degerleri.
   * (Or: yeni_owner_patient senaryosundan sonra appointment
   * senaryosu {ownerId}/{patientId} degerlerini kullanir.)
   */
  initialContext?: Readonly<Record<string, string>>;
  /** Su anki zaman (testte inject). */
  now?: () => Date;
}

/** Placeholder self-ref hata kodu. */
export const PLACEHOLDER_SELF_REF = "UAT-PLACEHOLDER-0001";

/** Placeholder bulunamadi hata kodu. */
export const PLACEHOLDER_NOT_FOUND = "UAT-PLACEHOLDER-0002";

/**
 * Path/body icindeki {xxx} placeholder'larini context map'i
 * kullanarak cozer. Cozulemeyen anahtar hata firlatir.
 */
export function resolvePlaceholders(
  input: string,
  context: Readonly<Record<string, string>>,
): string {
  // {xxx} desenlerini bul ve sirayla degistir. Dairekisel
  // referans tespiti: ayni placeholder kendi degerine
  // referans veriyorsa hata firlat (selfRefSet ile takip).
  const seen = new Set<string>();
  return input.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    if (seen.has(key)) {
      throw new Error(`${PLACEHOLDER_SELF_REF}: self-ref ${key}`);
    }
    const val = context[key];
    if (val === undefined || val === "") {
      throw new Error(`${PLACEHOLDER_NOT_FOUND}: ${key}`);
    }
    seen.add(key);
    return val;
  });
}

/**
 * Obje icindeki tum string alanlari (ic ice) resolve eder.
 * Body payload icin kullanilir. null/undefined/non-string
 * alanlara dokunulmaz.
 */
export function resolveDeep(
  value: unknown,
  context: Readonly<Record<string, string>>,
): unknown {
  if (typeof value === "string") {
    return resolvePlaceholders(value, context);
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveDeep(v, context));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = resolveDeep(v, context);
    }
    return out;
  }
  return value;
}

/**
 * Nokta notasyonu ile JSON body'sinden alan okur. "id",
 * "patient.id" gibi basit alanlar yeterli; pilot kapsaminda
 * derin dizi erisimi beklenmez.
 */
export function readField(body: unknown, path: string): unknown {
  if (body === null || body === undefined) return undefined;
  if (!path) return undefined;
  const parts = path.split(".");
  let cur: unknown = body;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Alan truthy mi (string icin bos degil, obje/array icin dolu). */
export function isTruthyField(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

/** Response body'den adim icin lazim olan id'leri toplar. */
const EXTRACT_FIELDS: ReadonlyArray<string> = [
  "id",
  "patientId",
  "ownerId",
  "appointmentId",
  "examinationId",
  "saleId",
  "paymentId",
  "surgeryId",
  "hospitalizationId",
  "labOrderId",
  "portalRequestId",
  "vaccineApplicationId",
];

/** Body'den standart id alanlarini toplayip context'e yazar. */
export function extractIds(
  body: unknown,
  context: Record<string, string>,
): void {
  if (!body || typeof body !== "object") return;
  for (const f of EXTRACT_FIELDS) {
    const v = readField(body, f);
    if (typeof v === "string" && v.length > 0) {
      context[f] = v;
    }
  }
}

/** Beklenen status listesinde mi. */
export function statusMatches(
  actual: number,
  expected: number | ReadonlyArray<number>,
): boolean {
  if (Array.isArray(expected)) return expected.includes(actual);
  return actual === expected;
}

/** Varsayilan fetch (Node 20+ global fetch). */
export async function defaultFetch(
  method: HttpMethod,
  url: string,
  init: { body?: unknown; headers?: Record<string, string> },
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers ?? {}),
  };
  let body: string | undefined;
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  const res = await fetch(url, {
    method,
    headers,
    body,
  });
  const text = await res.text();
  let parsed: unknown = text;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // JSON degilse metin olarak birak
      parsed = text;
    }
  }
  return { status: res.status, body: parsed };
}

/** Auth header'larini olusturur. */
export function buildAuthHeaders(auth: UatAuthContext): Record<string, string> {
  const headers: Record<string, string> = {};
  if (auth.token) headers["Authorization"] = `Bearer ${auth.token}`;
  if (auth.tenantId) headers["X-Tenant-Id"] = auth.tenantId;
  if (auth.branchId) headers["X-Branch-Id"] = auth.branchId;
  return headers;
}

/** Tek bir adimi calistirir. */
async function runStep(
  step: UatStep,
  context: Record<string, string>,
  baseUrl: string,
  auth: UatAuthContext,
  feedback: UatFeedback | null,
  fetchFn: UatFetch,
  now: () => Date,
): Promise<UatStepResult> {
  const startedAt = now();
  let url = "";
  let resolvedBody: unknown = step.body;
  try {
    url = resolvePlaceholders(step.path, context);
    resolvedBody = step.body === undefined ? undefined : resolveDeep(step.body, context);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      name: step.name,
      status: 0,
      durationMs: now().getTime() - startedAt.getTime(),
      error: message,
      extracted: {},
      feedback,
      passed: false,
      fieldFound: null,
    };
  }

  const fullUrl = `${baseUrl.replace(/\/$/, "")}${url}`;
  try {
    const res = await fetchFn(step.method, fullUrl, {
      body: resolvedBody,
      headers: buildAuthHeaders(auth),
    });
    const durationMs = now().getTime() - startedAt.getTime();
    extractIds(res.body, context);
    const fieldFound =
      step.expectField === undefined
        ? null
        : isTruthyField(readField(res.body, step.expectField));
    const statusOk = statusMatches(res.status, step.expectStatus);
    const passed = statusOk && (fieldFound === null || fieldFound);
    return {
      name: step.name,
      status: res.status,
      durationMs,
      error: null,
      extracted: { ...context },
      feedback,
      passed,
      fieldFound,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      name: step.name,
      status: 0,
      durationMs: now().getTime() - startedAt.getTime(),
      error: message,
      extracted: { ...context },
      feedback,
      passed: false,
      fieldFound: null,
    };
  }
}

/** Bir senaryoyu calistirir ve sonucu dondurur. */
export async function runScenario(
  options: RunScenarioOptions,
): Promise<UatScenarioResult> {
  const {
    scenario,
    baseUrl,
    auth,
    feedbackByStep,
    fetchFn = defaultFetch,
    now = () => new Date(),
    initialContext,
  } = options;

  const context: Record<string, string> = { ...(initialContext ?? {}) };
  // Branch id her senaryoda zorunlu; otomatik context'e koy
  if (auth.branchId && !context.branchId) {
    context.branchId = auth.branchId;
  }

  const startedAt = now();
  const stepResults: UatStepResult[] = [];
  for (const step of scenario.steps) {
    const fb = feedbackByStep?.get(step.name) ?? null;
    const res = await runStep(step, context, baseUrl, auth, fb, fetchFn, now);
    stepResults.push(res);
    if (!res.passed) {
      // Basarisiz adimdan sonra devam etmek yerine senaryoyu
      // kirar: sonraki placeholder'lar cozemeyebilir.
      break;
    }
  }
  const finishedAt = now();
  const passedCount = stepResults.filter((r) => r.passed).length;
  const failedCount = stepResults.length - passedCount;
  const unnecessaryCount = stepResults.filter(
    (r) => r.feedback?.unnecessary === true,
  ).length;
  const ratings = stepResults
    .map((r) => r.feedback?.rating ?? 0)
    .filter((r) => r > 0);
  const averageRating =
    ratings.length === 0
      ? 0
      : Math.round(
          (ratings.reduce<number>((s, r) => s + r, 0) / ratings.length) * 100,
        ) / 100;

  return {
    scenario: scenario.key,
    title: scenario.title,
    module: scenario.module,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    totalDurationMs: finishedAt.getTime() - startedAt.getTime(),
    steps: stepResults,
    allPassed: failedCount === 0 && stepResults.length === scenario.steps.length,
    passedCount,
    failedCount,
    unnecessaryCount,
    averageRating,
  };
}
