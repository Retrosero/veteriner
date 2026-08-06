/**
 * @file Pilot kabul (UAT) senaryo calistirma CLI.
 * @module @vetniva/acceptance-test/cli-run
 *
 * @description GOAL-121 (FAZ-12) kapsaminda secili senaryoyu
 * veya tum senaryolari sirayla calistirir. Sonucu JSON
 * formatinda stdout'a yazar (rapor olusturmak icin
 * cli-report.ts kullanilir).
 *
 * Kullanim:
 *   pnpm --filter @vetniva/acceptance-test run -- --base=http://localhost:3001 --token=... --tenant=... --branch=... --scenario=new_owner_patient
 *   pnpm --filter @vetniva/acceptance-test run -- --base=http://localhost:3001 --out=./uat-result.json
 *   pnpm --filter @vetniva/acceptance-test run -- --feedback-file=./feedback.json
 *   pnpm --filter @vetniva/acceptance-test run -- --tenants-file=./tenants.json
 *
 * @since GOAL-121 (FAZ-12) pilot kabul testleri
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { SCENARIOS, getScenario, listScenarioKeys } from "./config.js";
import {
  FEEDBACK_INVALID_RATING,
  FEEDBACK_MISSING_REVIEWER,
} from "./feedback.js";
import {
  flattenForScenario,
  parseFeedbackJson,
  type RawFeedbackFile,
} from "./feedback-loader.js";
import { defaultFetch, runScenario, type UatAuthContext } from "./runner.js";
import { validateTenants, type TenantConfig } from "./tenants.js";
import type {
  UatActorRole,
  UatFeedback,
  UatRunResult,
  UatRunTenant,
  UatScenarioKey,
} from "./types.js";

interface CliArgs {
  base: string;
  token: string;
  veterinarianToken: string;
  portalToken: string;
  portalPassword: string;
  tenant: string;
  branch: string;
  scenario: UatScenarioKey | "all";
  operator: string;
  out: string;
  feedbackFile: string;
  tenantsFile: string;
}

const SCENARIO_KEYS: ReadonlyArray<string> = listScenarioKeys();

function parseArgs(argv: ReadonlyArray<string>): CliArgs {
  const args: CliArgs = {
    base: process.env.UAT_BASE_URL ?? "http://localhost:3001",
    token: process.env.UAT_TOKEN ?? "",
    veterinarianToken: process.env.UAT_VETERINARIAN_TOKEN ?? "",
    portalToken: process.env.UAT_PORTAL_TOKEN ?? "",
    portalPassword: process.env.UAT_PORTAL_PASSWORD ?? "VetnivaUat!2026",
    tenant: process.env.UAT_TENANT_ID ?? "",
    branch: process.env.UAT_BRANCH_ID ?? "",
    scenario: "all",
    operator: process.env.UAT_OPERATOR ?? "pilot-cli",
    out: process.env.UAT_OUT ?? "./uat-result.json",
    feedbackFile: process.env.UAT_FEEDBACK_FILE ?? "",
    tenantsFile: process.env.UAT_TENANTS_FILE ?? "",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const consume = (): string | undefined => {
      const v = argv[++i];
      return v;
    };
    if (a === "--base") {
      const v = consume();
      args.base = v ?? args.base;
    } else if (a.startsWith("--base="))
      args.base = a.split("=")[1] ?? args.base;
    else if (a === "--token") {
      const v = consume();
      args.token = v ?? args.token;
    } else if (a.startsWith("--token="))
      args.token = a.split("=")[1] ?? args.token;
    else if (a === "--veterinarian-token") {
      const v = consume();
      args.veterinarianToken = v ?? args.veterinarianToken;
    } else if (a.startsWith("--veterinarian-token="))
      args.veterinarianToken = a.split("=")[1] ?? args.veterinarianToken;
    else if (a === "--portal-token") {
      const v = consume();
      args.portalToken = v ?? args.portalToken;
    } else if (a.startsWith("--portal-token="))
      args.portalToken = a.split("=")[1] ?? args.portalToken;
    else if (a === "--tenant") {
      const v = consume();
      args.tenant = v ?? args.tenant;
    } else if (a.startsWith("--tenant="))
      args.tenant = a.split("=")[1] ?? args.tenant;
    else if (a === "--branch") {
      const v = consume();
      args.branch = v ?? args.branch;
    } else if (a.startsWith("--branch="))
      args.branch = a.split("=")[1] ?? args.branch;
    else if (a === "--operator") {
      const v = consume();
      args.operator = v ?? args.operator;
    } else if (a.startsWith("--operator="))
      args.operator = a.split("=")[1] ?? args.operator;
    else if (a === "--out") {
      const v = consume();
      args.out = v ?? args.out;
    } else if (a.startsWith("--out=")) args.out = a.split("=")[1] ?? args.out;
    else if (a === "--feedback-file") {
      const v = consume();
      args.feedbackFile = v ?? args.feedbackFile;
    } else if (a.startsWith("--feedback-file="))
      args.feedbackFile = a.split("=")[1] ?? args.feedbackFile;
    else if (a === "--tenants-file") {
      const v = consume();
      args.tenantsFile = v ?? args.tenantsFile;
    } else if (a.startsWith("--tenants-file="))
      args.tenantsFile = a.split("=")[1] ?? args.tenantsFile;
    else if (a === "--scenario") {
      const v = consume() ?? "";
      if (v === "all" || (SCENARIO_KEYS as ReadonlyArray<string>).includes(v)) {
        args.scenario = v as CliArgs["scenario"];
      }
    } else if (a.startsWith("--scenario=")) {
      const v = a.split("=")[1] ?? "";
      if (v === "all" || (SCENARIO_KEYS as ReadonlyArray<string>).includes(v)) {
        args.scenario = v as CliArgs["scenario"];
      }
    }
  }
  return args;
}

/** Yeni oluşturulan demo sahibi için portal oturumu üretir. */
async function provisionPortalSession(
  base: string,
  tenantId: string,
  ownerId: string,
  runSuffix: string,
  password: string,
): Promise<string> {
  const headers: Record<string, string> = {};
  if (tenantId) headers["X-Tenant-Id"] = tenantId;
  const email = `uat.portal+${runSuffix}@example.com`;
  const registered = await defaultFetch(
    "POST",
    `${base}/api/v1/portal-auth/register`,
    {
      headers,
      body: {
        email,
        password,
        ownerId,
        consentKvkk: true,
        displayName: "Pilot Portal Sahibi",
        locale: "tr-TR",
      },
    },
  );
  if (
    registered.status !== 201 ||
    typeof registered.body !== "object" ||
    !registered.body
  ) {
    throw new Error(
      `Portal demo hesabı oluşturulamadı (HTTP ${registered.status})`,
    );
  }
  const verificationToken = (registered.body as Record<string, unknown>)[
    "emailVerificationToken"
  ];
  if (typeof verificationToken !== "string" || verificationToken.length === 0) {
    throw new Error("Portal email doğrulama tokenı alınamadı");
  }
  const verified = await defaultFetch(
    "POST",
    `${base}/api/v1/portal-auth/verify-email`,
    {
      headers,
      body: { token: verificationToken },
    },
  );
  if (verified.status !== 200) {
    throw new Error(
      `Portal email doğrulaması başarısız (HTTP ${verified.status})`,
    );
  }
  const loggedIn = await defaultFetch(
    "POST",
    `${base}/api/v1/portal-auth/login`,
    {
      headers,
      body: { email, password },
    },
  );
  if (
    loggedIn.status !== 200 ||
    typeof loggedIn.body !== "object" ||
    !loggedIn.body
  ) {
    throw new Error(`Portal girişi başarısız (HTTP ${loggedIn.status})`);
  }
  const sessionToken = (loggedIn.body as Record<string, unknown>)[
    "sessionToken"
  ];
  if (typeof sessionToken !== "string" || sessionToken.length === 0) {
    throw new Error("Portal oturum tokenı alınamadı");
  }
  return sessionToken;
}

/**
 * Tek bir tenant icin senaryo listesini sirayla calistirir; her
 * basarili senaryonun son adimindan toplanan id'ler sonraki
 * senaryonun `initialContext`'ine aktarilir. Portal sahibi
 * senaryosu icin `new_owner_patient` basariliysa demo portal
 * hesabi otomatik uretilir.
 *
 * @param tenantLabel tenant etiketi (coklu mod icin; tek modda null)
 * @param tenantCtx tenant auth bilgisi
 * @param baseUrl API base URL
 * @param args CLI argumanlari
 * @param feedbackForScenario senaryo bazinda flat feedback Map'i
 * @returns Senaryo sonuclari
 */
async function runScenariosForTenant(
  tenantLabel: string | null,
  tenantCtx: {
    baseUrl: string;
    auth: UatAuthContext;
    veterinarianAuth: UatAuthContext;
    portalAuth: UatAuthContext;
    tenantId: string;
    branchId: string;
  },
  args: CliArgs,
  feedbackForScenario: (
    key: UatScenarioKey,
  ) => ReadonlyMap<string, UatFeedback>,
  scenariosToRun: ReadonlyArray<ReturnType<typeof getScenario>>,
): Promise<{ results: Awaited<ReturnType<typeof runScenario>>[] }> {
  const authByActorRole: Partial<Record<UatActorRole, UatAuthContext>> = {
    OWNER: tenantCtx.auth,
    STAFF: tenantCtx.auth,
    VETERINARIAN: tenantCtx.veterinarianAuth,
    PET_OWNER_PORTAL: tenantCtx.portalAuth,
  };

  const runSeed =
    Date.now().toString() + (tenantLabel ? `-${tenantLabel}` : "");
  const runPhone = `+905${runSeed.slice(-9).padStart(9, "0")}`;
  // Tekrar koşulan pilot testlerinde takvim çakışmaması için randevuyu
  // bir hafta sonrasındaki benzersiz dakika dilimine yerleştiririz.
  const appointmentOffsetMinutes = Number(runSeed.slice(-5)) % 10_080;
  const runAppointmentStart = new Date(
    Date.now() + (10_080 + appointmentOffsetMinutes) * 60 * 1000,
  ).toISOString();
  const runSurgeryStart = new Date(
    Date.parse(runAppointmentStart) + 60 * 60 * 1000,
  ).toISOString();
  const runPortalAppointmentStart = new Date(
    Date.parse(runAppointmentStart) + 24 * 60 * 60 * 1000,
  ).toISOString();
  let initialContext: Record<string, string> = {
    runSuffix: runSeed,
    runPhone,
    runAppointmentStart,
    runSurgeryStart,
    runPortalAppointmentStart,
  };
  const catalogContext = {
    vaccineProtocolId: process.env.UAT_VACCINE_PROTOCOL_ID,
    productId: process.env.UAT_PRODUCT_ID,
    cageId: process.env.UAT_CAGE_ID,
    labTestId: process.env.UAT_LAB_TEST_ID,
    vaccineStockProductId: process.env.UAT_VACCINE_STOCK_PRODUCT_ID,
  };
  for (const [key, value] of Object.entries(catalogContext)) {
    if (value) initialContext[key] = value;
  }
  const results: Awaited<ReturnType<typeof runScenario>>[] = [];
  for (const sc of scenariosToRun) {
    const scenarioAuth = authByActorRole[sc.actorRole] ?? tenantCtx.auth;
    const res = await runScenario({
      scenario: sc,
      baseUrl: tenantCtx.baseUrl,
      auth: scenarioAuth,
      authByActorRole,
      initialContext,
      feedbackByStep: feedbackForScenario(sc.key),
    });
    if (tenantLabel) res.tenantLabel = tenantLabel;
    results.push(res);
    if (res.allPassed) {
      const last = res.steps[res.steps.length - 1];
      initialContext = { ...last?.extracted };
      if (sc.key === "new_owner_patient" && !args.portalToken) {
        const ownerId = initialContext["ownerId"];
        if (!ownerId) throw new Error("Portal hesabı için ownerId bulunamadı");
        const portalToken = await provisionPortalSession(
          tenantCtx.baseUrl,
          tenantCtx.tenantId,
          ownerId,
          runSeed,
          args.portalPassword,
        );
        authByActorRole.PET_OWNER_PORTAL = {
          ...tenantCtx.auth,
          token: portalToken,
        };
      }
    }
  }
  return { results };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // 1) Pilot geri bildirim dosyasi (opsiyonel)
  let feedbackByScenario: ReturnType<typeof parseFeedbackJson> | null = null;
  if (args.feedbackFile) {
    const raw = await readFile(resolve(args.feedbackFile), "utf8");
    try {
      feedbackByScenario = parseFeedbackJson(
        JSON.parse(raw) as RawFeedbackFile,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith(FEEDBACK_MISSING_REVIEWER)) {
        throw new Error(
          `Geri bildirim dosyasinda reviewer eksik: ${args.feedbackFile}`,
        );
      }
      if (msg.startsWith(FEEDBACK_INVALID_RATING)) {
        throw new Error(
          `Geri bildirim dosyasinda gecersiz puan: ${args.feedbackFile}`,
        );
      }
      throw err;
    }
  }
  const feedbackForScenario = (
    key: UatScenarioKey,
  ): ReadonlyMap<string, UatFeedback> =>
    feedbackByScenario
      ? flattenForScenario(feedbackByScenario, key)
      : new Map<string, UatFeedback>();

  // 2) Capraz-tenant konfigurasyonu (opsiyonel)
  let tenants: TenantConfig[] | null = null;
  if (args.tenantsFile) {
    const raw = await readFile(resolve(args.tenantsFile), "utf8");
    const validated = validateTenants(JSON.parse(raw));
    if (!validated.ok) {
      throw new Error(
        `Tenants dosyasi gecersiz: ${args.tenantsFile} - ${JSON.stringify(
          validated.errors,
        )}`,
      );
    }
    tenants = [...validated.value];
  }

  // 3) Senaryo listesi
  const scenariosToRun =
    args.scenario === "all" ? SCENARIOS : [getScenario(args.scenario)];

  const runAt = new Date().toISOString();
  const allScenarioResults: (Awaited<ReturnType<typeof runScenario>> & {
    tenantLabel?: string | null;
  })[] = [];
  const runTenants: UatRunTenant[] = [];

  if (tenants && tenants.length > 0) {
    for (const t of tenants) {
      const auth: UatAuthContext = {
        token: t.token,
        tenantId: t.tenantId,
        branchId: t.branchId,
      };
      const veterinarianAuth: UatAuthContext = {
        ...auth,
        token: t.veterinarianToken || t.token,
      };
      const portalAuth: UatAuthContext = {
        ...auth,
        token: t.portalToken || t.token,
      };
      const { results } = await runScenariosForTenant(
        t.label,
        {
          baseUrl: t.baseUrl ?? args.base,
          auth,
          veterinarianAuth,
          portalAuth,
          tenantId: t.tenantId,
          branchId: t.branchId,
        },
        args,
        feedbackForScenario,
        scenariosToRun,
      );
      allScenarioResults.push(...results);
      runTenants.push({
        label: t.label,
        tenantId: t.tenantId,
        branchId: t.branchId,
      });
    }
  } else {
    const auth: UatAuthContext = {
      token: args.token,
      tenantId: args.tenant,
      branchId: args.branch,
    };
    const veterinarianAuth: UatAuthContext = {
      ...auth,
      token: args.veterinarianToken || args.token,
    };
    const portalAuth: UatAuthContext = {
      ...auth,
      token: args.portalToken || args.token,
    };
    const { results } = await runScenariosForTenant(
      null,
      {
        baseUrl: args.base,
        auth,
        veterinarianAuth,
        portalAuth,
        tenantId: args.tenant,
        branchId: args.branch,
      },
      args,
      feedbackForScenario,
      scenariosToRun,
    );
    allScenarioResults.push(...results);
  }

  const passedCount = allScenarioResults.filter((s) => s.allPassed).length;
  const failedCount = allScenarioResults.length - passedCount;
  const totalSteps = allScenarioResults.reduce(
    (s, sc) => s + sc.steps.length,
    0,
  );
  const totalFailedSteps = allScenarioResults.reduce(
    (s, sc) => s + sc.failedCount,
    0,
  );
  const totalUnnecessary = allScenarioResults.reduce(
    (s, sc) => s + sc.unnecessaryCount,
    0,
  );
  const ratings = allScenarioResults
    .flatMap((s) => s.steps.map((st) => st.feedback?.rating ?? 0))
    .filter((r) => r > 0);
  const averageRating =
    ratings.length === 0
      ? 0
      : Math.round(
          (ratings.reduce<number>((s, r) => s + r, 0) / ratings.length) * 100,
        ) / 100;

  const result: UatRunResult = {
    runAt,
    operator: args.operator,
    baseUrl: args.base,
    tenantId: args.tenant || null,
    ...(runTenants.length > 0 ? { tenants: runTenants } : {}),
    scenarios: allScenarioResults,
    allPassed: failedCount === 0,
    passedCount,
    failedCount,
    totalSteps,
    totalFailedSteps,
    totalUnnecessary,
    averageRating,
  };

  const outFile = resolve(args.out);
  await writeFile(outFile, JSON.stringify(result, null, 2), "utf8");
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        outFile,
        scenarios: allScenarioResults.length,
        passed: passedCount,
        failed: failedCount,
        totalSteps,
        totalFailedSteps,
        totalUnnecessary,
        averageRating,
        tenants: runTenants.length,
      },
      null,
      2,
    ),
  );
  if (failedCount > 0 || totalFailedSteps > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("uat-run hatasi:", err);
  process.exitCode = 1;
});
