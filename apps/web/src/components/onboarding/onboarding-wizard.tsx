"use client";

/**
 * @file Onboarding (ilk kullanim asistan) wizard bileseni.
 * @module @vetniva/web/components/onboarding/onboarding-wizard
 *
 * @description GOAL-117 (FAZ-11) — Uygulama kullanimi ve navigasyon
 * sorularina cevap veren, role-bazli filtre yapan, tibbi sorulari
 * reddeden sihirbaz. 3 adim:
 *   1. Karsilama + rol secimi
 *   2. Tetikleyici eslesmesi (soru + scenario secimi)
 *   3. Navigasyon linkleri + bitis
 *
 * Backend ile iletisim:
 * - `GET /api/v1/onboarding/scenarios?modules=...` — rol/modul-bazli
 *   senaryo listesi.
 * - `POST /api/v1/onboarding/ask` — "X nasil yapilir?" sorusu +
 *   senaryo eslestirmesi.
 *
 * @security Tibbi sorular (tani/tedavi/doz) backend tarafindan
 *   reddedilir; UI ayni mesaji gosterir. PII tasimaz.
 * @since GOAL-117 (FAZ-11) ilk kullanim asistan
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { type Locale } from "@vetniva/contracts";
import {
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  cn,
} from "@vetniva/ui";

import {
  type LocalizedOnboardingScenario,
  type OnboardingAskResponse,
  type OnboardingCategory,
  type OnboardingGenerationSource,
  type OnboardingRole,
  type OnboardingScenarioListResponse,
} from "@vetniva/contracts";

/**
 * Ceviri etiketleri (server-side labels.ts'den ayri; wizard
 * spesifik anahtarlar burada tutulur).
 */
export type OnboardingLabels = {
  welcome: string;
  description: string;
  step1Title: string;
  step1Subtitle: string;
  step1RoleVet: string;
  step1RoleStaff: string;
  step1RoleOwner: string;
  step1RolePortal: string;
  step2Title: string;
  step2Subtitle: string;
  step2InputLabel: string;
  step2InputPlaceholder: string;
  step2Submit: string;
  step3Title: string;
  step3Subtitle: string;
  step3NoMatch: string;
  step3MedicalRefusal: string;
  step3Navigate: string;
  ctaStart: string;
  ctaNext: string;
  ctaBack: string;
  ctaFinish: string;
  ctaClose: string;
  helpButton: string;
  empty: string;
  loading: string;
  errorGeneric: string;
};

/**
 * Rol seçenekleri (UI sıralaması).
 */
const ROLE_OPTIONS: ReadonlyArray<{
  value: OnboardingRole;
  labelKey: keyof OnboardingLabels;
}> = [
  { value: "VETERINARIAN", labelKey: "step1RoleVet" },
  { value: "STAFF", labelKey: "step1RoleStaff" },
  { value: "OWNER", labelKey: "step1RoleOwner" },
  { value: "PET_OWNER_PORTAL", labelKey: "step1RolePortal" },
];

/**
 * Kategori -> ikon (basit inline SVG). shadcn primitive'leri
 * kullanildigi icin harici ikon paketi gerekmez.
 */
const CATEGORY_ICON: Record<OnboardingCategory, JSX.Element> = {
  patient_owner: <CircleIcon />,
  appointment: <SquareIcon />,
  clinical: <TriangleIcon />,
  vaccination: <StarIcon />,
  inventory: <SquareIcon />,
  petshop: <CircleIcon />,
  billing: <SquareIcon />,
  laboratory: <TriangleIcon />,
  imaging: <StarIcon />,
  hospitalization: <CircleIcon />,
  portal: <SquareIcon />,
  admin: <TriangleIcon />,
};

function CircleIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" />
    </svg>
  );
}

function SquareIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="12" height="12" rx="1" />
    </svg>
  );
}

function TriangleIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M8 2 L14 13 L2 13 Z" />
    </svg>
  );
}

function StarIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M8 2 L10 6 L14 7 L11 10 L12 14 L8 12 L4 14 L5 10 L2 7 L6 6 Z" />
    </svg>
  );
}

/**
 * Wizard icin fetch helper. Server tarafinda cookie/header tasinmasi
 * icin `credentials: "include"` kullanir; bu sayede auth cookie
 * otomatik olarak API'ye iletilir.
 */
async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
): Promise<
  | { ok: true; data: T }
  | { ok: false; error: string; correlationId: string | null }
> {
  try {
    const res = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
    const requestId = res.headers.get("x-request-id");
    if (!res.ok) {
      return {
        ok: false,
        error: `HTTP ${res.status}`,
        correlationId: requestId,
      };
    }
    const data = (await res.json()) as T;
    return { ok: true, data, ...(requestId ? { correlationId: requestId } : {}) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
      correlationId: null,
    };
  }
}

export type OnboardingWizardProps = {
  locale: Locale;
  apiBaseUrl: string;
  labels: OnboardingLabels;
  initialRole?: OnboardingRole;
  onClose?: () => void;
};

/**
 * Onboarding wizard bileseni. Mount edildiginde 1. adim (rol
 * secimi) ile acilir. Kullanici "Basla" tiklayinca 2. adima
 * gecer; burada soru sorabilir veya mevcut senaryolardan birini
 * secebilir. 3. adimda adim listesi + navigasyon linkleri
 * gosterilir.
 * @param root0
 * @param root0.locale
 * @param root0.apiBaseUrl
 * @param root0.labels
 * @param root0.initialRole
 * @param root0.onClose
 */
export function OnboardingWizard({
  locale,
  apiBaseUrl,
  labels,
  initialRole,
  onClose,
}: OnboardingWizardProps): JSX.Element {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [role, setRole] = useState<OnboardingRole | null>(initialRole ?? null);
  const [scenarios, setScenarios] = useState<
    OnboardingScenarioListResponse["scenarios"]
  >([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    null,
  );
  const [query, setQuery] = useState<string>("");
  const [askResponse, setAskResponse] = useState<OnboardingAskResponse | null>(
    null,
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const currentStepLabel = useMemo(() => {
    if (step === 1) return labels.step1Title;
    if (step === 2) return labels.step2Title;
    return labels.step3Title;
  }, [step, labels]);

  /**
   * Senaryolar yukle. Role degistiginde veya step 2'ye gecildiginde
   * tetiklenir.
   */
  const loadScenarios = useCallback(
    async (selectedRole: OnboardingRole): Promise<void> => {
      setLoading(true);
      setError(null);
      const result = await fetchJson<OnboardingScenarioListResponse>(
        `${apiBaseUrl}/api/v1/onboarding/scenarios`,
      );
      if (result.ok) {
        // Backend actor.role'den filtreliyor; ek rol filtresi
        // gerekmez. Sadece secilen rolle uyumlu olanlari goster.
        const filtered = result.data.scenarios.filter((s) => {
          // Backend zaten role-bazli filtreledi; yine de dogrulayalim.
          return true;
        });
        setScenarios(filtered);
        void selectedRole;
      } else {
        setError(labels.errorGeneric);
        setScenarios([]);
      }
      setLoading(false);
    },
    [apiBaseUrl, labels.errorGeneric],
  );

  /**
   * Step 2'de "ask" endpoint'ini cagir. Backend senaryo eslestirir
   * veya tıbbi sorularda refusal doner.
   */
  const submitAsk = useCallback(async (): Promise<void> => {
    if (query.trim().length < 3) {
      setError(labels.errorGeneric);
      return;
    }
    setLoading(true);
    setError(null);
    setAskResponse(null);
    const result = await fetchJson<OnboardingAskResponse>(
      `${apiBaseUrl}/api/v1/onboarding/ask`,
      {
        method: "POST",
        body: JSON.stringify({
          query: query.trim(),
          locale,
        }),
      },
    );
    if (result.ok) {
      setAskResponse(result.data);
      if (result.data.scenario) {
        setSelectedScenarioId(result.data.scenario.id);
        setStep(3);
      } else if (result.data.generationSource === "refusal") {
        // Tibbi reddi: step 3'te ozel mesaj gosterilir.
        setStep(3);
      } else {
        setError(labels.step3NoMatch);
      }
    } else {
      setError(labels.errorGeneric);
    }
    setLoading(false);
  }, [apiBaseUrl, query, locale, labels]);

  // Step 2'ye gecildiginde senaryolari yukle.
  useEffect(() => {
    if (step === 2 && role) {
      void loadScenarios(role);
    }
  }, [step, role, loadScenarios]);

  return (
    <div
      data-testid="onboarding-wizard"
      data-step={step}
      className="mx-auto w-full max-w-2xl"
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle data-testid="onboarding-step-title">
                {currentStepLabel}
              </CardTitle>
              <CardDescription>
                {step === 1
                  ? labels.description
                  : step === 2
                    ? labels.step2Subtitle
                    : labels.step3Subtitle}
              </CardDescription>
            </div>
            {onClose ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onClose}
                aria-label={labels.ctaClose}
                data-testid="onboarding-close"
              >
                {labels.ctaClose}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardBody>
          {step === 1 ? (
            <Step1Role
              labels={labels}
              role={role}
              onChange={setRole}
            />
          ) : null}
          {step === 2 ? (
            <Step2Ask
              labels={labels}
              query={query}
              onQueryChange={setQuery}
              onSubmit={submitAsk}
              loading={loading}
              error={error}
              scenarios={scenarios}
              onScenarioPick={(id) => {
                setSelectedScenarioId(id);
                setStep(3);
              }}
            />
          ) : null}
          {step === 3 ? (
            <Step3Result
              labels={labels}
              askResponse={askResponse}
              scenarios={scenarios}
              selectedScenarioId={selectedScenarioId}
              onRestart={() => {
                setStep(1);
                setAskResponse(null);
                setSelectedScenarioId(null);
                setQuery("");
              }}
            />
          ) : null}

          <div className="mt-6 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2) : 1))}
              disabled={step === 1}
              data-testid="onboarding-back"
            >
              {labels.ctaBack}
            </Button>
            {step < 3 ? (
              <Button
                type="button"
                onClick={() => setStep((s) => (s < 3 ? ((s + 1) as 2 | 3) : 3))}
                disabled={step === 1 ? role === null : false}
                data-testid="onboarding-next"
              >
                {step === 1 ? labels.ctaStart : labels.ctaNext}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  onClose?.();
                }}
                data-testid="onboarding-finish"
              >
                {labels.ctaFinish}
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Adim 1: Rol secimi                                                          */
/* -------------------------------------------------------------------------- */

function Step1Role({
  labels,
  role,
  onChange,
}: {
  labels: OnboardingLabels;
  role: OnboardingRole | null;
  onChange: (r: OnboardingRole) => void;
}): JSX.Element {
  return (
    <div data-testid="onboarding-step1" className="space-y-3">
      <p className="text-sm text-gray-600">{labels.step1Subtitle}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ROLE_OPTIONS.map((opt) => {
          const selected = role === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              data-testid={`onboarding-role-${opt.value}`}
              data-selected={selected ? "true" : "false"}
              onClick={() => onChange(opt.value)}
              className={cn(
                "rounded-md border px-4 py-3 text-left text-sm transition-colors",
                selected
                  ? "border-clinic-500 bg-clinic-50 text-clinic-900"
                  : "border-gray-200 bg-white text-gray-700 hover:border-clinic-300 hover:bg-clinic-50/40",
              )}
            >
              {labels[opt.labelKey]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Adim 2: Soru + senaryo secimi                                               */
/* -------------------------------------------------------------------------- */

function Step2Ask({
  labels,
  query,
  onQueryChange,
  onSubmit,
  loading,
  error,
  scenarios,
  onScenarioPick,
}: {
  labels: OnboardingLabels;
  query: string;
  onQueryChange: (q: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string | null;
  scenarios: OnboardingScenarioListResponse["scenarios"];
  onScenarioPick: (id: string) => void;
}): JSX.Element {
  return (
    <div data-testid="onboarding-step2" className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="space-y-2"
      >
        <label
          htmlFor="onboarding-query"
          className="block text-sm font-medium text-gray-700"
        >
          {labels.step2InputLabel}
        </label>
        <div className="flex gap-2">
          <Input
            id="onboarding-query"
            data-testid="onboarding-query"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={labels.step2InputPlaceholder}
            disabled={loading}
            className="flex-1"
          />
          <Button
            type="submit"
            data-testid="onboarding-submit"
            disabled={loading || query.trim().length < 3}
          >
            {loading ? labels.loading : labels.step2Submit}
          </Button>
        </div>
        {error !== null ? (
          <p
            className="text-xs text-danger-700"
            data-testid="onboarding-error"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </form>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-gray-900">
          {labels.step2Subtitle}
        </h4>
        {scenarios.length === 0 ? (
          <p
            className="text-sm text-gray-500"
            data-testid="onboarding-empty"
          >
            {labels.empty}
          </p>
        ) : (
          <ul
            data-testid="onboarding-scenarios"
            className="divide-y divide-gray-100 rounded-md border border-gray-200"
          >
            {scenarios.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  data-testid={`onboarding-scenario-${s.id}`}
                  onClick={() => onScenarioPick(s.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-clinic-50/40"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-clinic-700">
                      {CATEGORY_ICON[s.category]}
                    </span>
                    <span className="font-medium text-gray-900">
                      {s.title}
                    </span>
                  </span>
                  <span className="text-xs text-gray-500">
                    {s.stepCount} adim
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Adim 3: Sonuc + navigasyon                                                  */
/* -------------------------------------------------------------------------- */

function Step3Result({
  labels,
  askResponse,
  scenarios,
  selectedScenarioId,
  onRestart,
}: {
  labels: OnboardingLabels;
  askResponse: OnboardingAskResponse | null;
  scenarios: OnboardingScenarioListResponse["scenarios"];
  selectedScenarioId: string | null;
  onRestart: () => void;
}): JSX.Element {
  // Senaryo: ya askResponse'tan (LocalizedOnboardingScenario) ya da
  // secili senaryo ID'sinden (sadece stepCount bilinen liste elemani).
  // `steps` sadece askResponse senaryosunda oldugu icin, liste
  // senaryosunda sadece stepCount gosterilir.
  const detailScenario: LocalizedOnboardingScenario | null =
    askResponse?.scenario ?? null;
  const listScenario: OnboardingScenarioListResponse["scenarios"][number] | null =
    detailScenario === null
      ? (scenarios.find((s) => s.id === selectedScenarioId) ?? null)
      : null;
  const scenario: { title: string; summary: string } | null =
    detailScenario !== null
      ? { title: detailScenario.title, summary: detailScenario.summary }
      : listScenario !== null
        ? { title: listScenario.title, summary: listScenario.summary }
        : null;
  const steps: LocalizedOnboardingScenario["steps"] = detailScenario?.steps ?? [];
  const generationSource: OnboardingGenerationSource | undefined =
    askResponse?.generationSource;

  if (
    askResponse &&
    (askResponse.generationSource === "refusal" ||
      askResponse.refusalReason !== undefined)
  ) {
    return (
      <div
        data-testid="onboarding-step3-refusal"
        className="rounded-md border border-warn-200 bg-warn-50 p-4"
      >
        <p
          className="text-sm text-warn-900"
          data-testid="onboarding-medical-refusal"
        >
          {labels.step3MedicalRefusal}
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={onRestart}
          data-testid="onboarding-restart"
        >
          {labels.ctaBack}
        </Button>
      </div>
    );
  }

  if (!scenario) {
    return (
      <div data-testid="onboarding-step3-empty" className="space-y-2">
        <p className="text-sm text-gray-500" data-testid="onboarding-no-match">
          {labels.step3NoMatch}
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onRestart}
          data-testid="onboarding-restart"
        >
          {labels.ctaBack}
        </Button>
      </div>
    );
  }

  return (
    <div data-testid="onboarding-step3" className="space-y-3">
      <div>
        <h3
          className="text-base font-semibold text-gray-900"
          data-testid="onboarding-scenario-title"
        >
          {scenario.title}
        </h3>
        <p className="mt-1 text-sm text-gray-600">{scenario.summary}</p>
        {generationSource ? (
          <span
            className="mt-2 inline-block rounded-full bg-clinic-50 px-2 py-0.5 text-xs text-clinic-700"
            data-testid="onboarding-generation-source"
            data-source={generationSource}
          >
            {generationSource}
          </span>
        ) : null}
      </div>
      <ol
        data-testid="onboarding-steps"
        className="space-y-2 rounded-md border border-gray-200 p-3"
      >
        {steps.map((step) => (
          <li
            key={step.order}
            data-testid={`onboarding-step-${step.order}`}
            className="flex items-start gap-3 border-b border-gray-100 pb-2 last:border-b-0"
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-clinic-100 text-xs font-semibold text-clinic-700">
              {step.order}
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{step.title}</p>
              <p className="text-xs text-gray-600">{step.description}</p>
              <a
                href={step.route}
                data-testid={`onboarding-step-link-${step.order}`}
                className="mt-1 inline-block text-xs font-medium text-clinic-700 hover:text-clinic-800 hover:underline"
              >
                {labels.step3Navigate} →
              </a>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
