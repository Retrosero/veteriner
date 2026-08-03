/**
 * @file Onboarding sayfasi.
 * @module @vetniva/web/app/[locale]/onboarding/page
 *
 * @description GOAL-117 (FAZ-11) — Ilk kullanim asistaninin tam
 * sayfa olarak goruntulendigi route. Help butonu overlay'i yerine
 * sayfa ici wizard olarak acilir; ayni component yeniden kullanilir.
 *
 * RBAC: Tum authenticated roller erisebilir (SUPERADMIN, OWNER,
 * VETERINARIAN, STAFF, PET_OWNER_PORTAL). Backend zaten auth guard
 * ile korunuyor; bu sayfa sadece UI mount noktasi.
 *
 * @since GOAL-117 (FAZ-11) ilk kullanim asistan
 */

import { SUPPORTED_LOCALES, type Locale } from "@vetniva/contracts";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/layouts/app-shell";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { PageHeader } from "@/components/ui/page-header";
import { getLabels } from "@/lib/labels";

import type { Metadata } from "next";

type PageParams = { locale: string };

/**
 * Onboarding etiketleri. Server-side labels.ts'den bagimsiz; wizard
 * ihtiyaclarina ozel anahtarlar burada toplanir.
 */
function getOnboardingLabels(
  locale: Locale,
): {
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
} {
  if (locale === "en-GB") {
    return {
      welcome: "Welcome to VetNiva",
      description: "Pick your role to personalise the guidance.",
      step1Title: "Welcome",
      step1Subtitle: "Pick your role",
      step1RoleVet: "Veterinarian",
      step1RoleStaff: "Clinic staff",
      step1RoleOwner: "Clinic owner",
      step1RolePortal: "Pet owner (portal)",
      step2Title: "Match a topic",
      step2Subtitle: "Ask a question or pick a scenario",
      step2InputLabel: "Your question",
      step2InputPlaceholder: "e.g. How do I record a vaccination?",
      step2Submit: "Find guidance",
      step3Title: "Steps",
      step3Subtitle: "Follow the steps below",
      step3NoMatch: "No scenario matched your question.",
      step3MedicalRefusal:
        "This assistant cannot help with medical questions (diagnosis, treatment, dosage). Please consult your veterinarian.",
      step3Navigate: "Go to page",
      ctaStart: "Start",
      ctaNext: "Next",
      ctaBack: "Back",
      ctaFinish: "Finish",
      ctaClose: "Close",
      helpButton: "Help",
      empty: "No scenarios available",
      loading: "Loading scenarios...",
      errorGeneric: "Could not load onboarding content.",
    };
  }
  return {
    welcome: "VetNiva Hosgeldiniz",
    description: "Rolunuzu secin; ilk adimlarda sizi yonlendirelim.",
    step1Title: "Hosgeldiniz",
    step1Subtitle: "Rol secimi",
    step1RoleVet: "Veteriner Hekim",
    step1RoleStaff: "Klinik Personeli",
    step1RoleOwner: "Isletme Sahibi",
    step1RolePortal: "Hasta Sahibi",
    step2Title: "Konu Eslestir",
    step2Subtitle: "Soru sorun veya senaryo secin",
    step2InputLabel: "Sorusu",
    step2InputPlaceholder: "Orn. Asi kaydi nasil yapilir?",
    step2Submit: "Yonlendir",
    step3Title: "Adimlar",
    step3Subtitle: "Asagidaki adimlari takip edin",
    step3NoMatch: "Sorunuzla eslesen bir senaryo bulunamadi.",
    step3MedicalRefusal:
      "Bu asistan tibbi sorularda (tani, tedavi, doz) yardimci olamaz. Lutfen veteriner hekiminize danisin.",
    step3Navigate: "Sayfaya git",
    ctaStart: "Basla",
    ctaNext: "Ileri",
    ctaBack: "Geri",
    ctaFinish: "Bitir",
    ctaClose: "Kapat",
    helpButton: "Yardim",
    empty: "Senaryo bulunamadi",
    loading: "Senaryolar yukleniyor...",
    errorGeneric: "Onboarding icerigi yuklenemedi.",
  };
}

/**
 * Sayfa metadata'si.
 * @param root0
 * @param root0.params
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams> | PageParams;
}): Promise<Metadata> {
  const resolved = await Promise.resolve(params);
  const locale = resolved.locale as Locale;
  const labels = getOnboardingLabels(locale === "en-GB" ? "en-GB" : "tr-TR");
  return {
    title: `${labels.welcome} - VetNiva`,
    description: labels.description,
  };
}

/**
 * Onboarding sayfasi. AppShell + PageHeader + wizard.
 * @param root0
 * @param root0.params
 */
export default async function OnboardingPage({
  params,
}: {
  params: Promise<PageParams> | PageParams;
}): Promise<JSX.Element> {
  const resolved = await Promise.resolve(params);
  const { locale: rawLocale } = resolved;
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(rawLocale)) {
    notFound();
  }
  const locale = rawLocale as Locale;
  const labels = getLabels(locale);
  const onboardingLabels = getOnboardingLabels(locale);

  const apiBaseUrl = process.env["API_BASE_URL"] ?? "http://localhost:3001";

  return (
    <AppShell
      locale={locale}
      pageTitle={onboardingLabels.welcome}
      pageDescription={onboardingLabels.description}
      user={{
        name: "Dr. Ayse Yilmaz",
        role: locale === "en-GB" ? "Veterinarian" : "Veteriner",
      }}
    >
      <PageHeader
        title={onboardingLabels.welcome}
        description={onboardingLabels.description}
        breadcrumb={[
          { label: labels.nav.dashboard, href: `/${locale}` },
          { label: onboardingLabels.welcome },
        ]}
      />
      <OnboardingWizard
        locale={locale}
        apiBaseUrl={apiBaseUrl}
        labels={onboardingLabels}
      />
    </AppShell>
  );
}
