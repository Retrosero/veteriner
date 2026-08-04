/**
 * @file Ana menü modül giriş sayfaları.
 * @module @vetniva/web/app/[locale]/[module]/page
 * @description Sol menüde yer alan klinik modüllerinin güvenli rota
 * girişini sağlar. Her geçerli modül kendi başlığı ve sonraki işlem
 * bağlamıyla açılır; tanımsız URL'ler ise gerçek 404 sayfasına düşer.
 *
 * @security Modül adı URL'den geldiği için yalnızca izin verilen sabit
 * liste kabul edilir. Tenant verisi URL'den okunmaz; veri entegrasyonu
 * eklendiğinde oturumun TenantContext'i kullanılmalıdır.
 */

import { SUPPORTED_LOCALES, type Locale } from "@vetniva/contracts";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/layouts/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { getLabels } from "@/lib/labels";

type PageParams = { locale: string; module: string };

type ModuleDefinition = {
  title: { tr: string; en: string };
  description: { tr: string; en: string };
  nextStep: { tr: string; en: string };
};

const MODULES = {
  patients: {
    title: { tr: "Hastalar", en: "Patients" },
    description: {
      tr: "Hasta sahipleri ve hayvan kayıtlarını yönetin.",
      en: "Manage pet owners and animal records.",
    },
    nextStep: {
      tr: "Hasta kayıtları bu alanda görüntülenecek.",
      en: "Patient records will be displayed here.",
    },
  },
  appointments: {
    title: { tr: "Randevular", en: "Appointments" },
    description: {
      tr: "Klinik randevularını planlayın ve takip edin.",
      en: "Plan and track clinic appointments.",
    },
    nextStep: {
      tr: "Randevu takvimi ve bekleme listesi bu alanda görüntülenecek.",
      en: "The appointment calendar and waiting list will be displayed here.",
    },
  },
  consultation: {
    title: { tr: "Muayene", en: "Consultation" },
    description: {
      tr: "Muayene kayıtlarını ve klinik notları yönetin.",
      en: "Manage consultation records and clinical notes.",
    },
    nextStep: {
      tr: "Muayene kayıtları bu alanda görüntülenecek.",
      en: "Consultation records will be displayed here.",
    },
  },
  vaccinations: {
    title: { tr: "Aşılar", en: "Vaccinations" },
    description: {
      tr: "Aşı planlarını, uygulamaları ve hatırlatmaları takip edin.",
      en: "Track vaccination plans, administrations and reminders.",
    },
    nextStep: {
      tr: "Aşı planı ve uygulama kayıtları bu alanda görüntülenecek.",
      en: "Vaccination plans and administration records will be displayed here.",
    },
  },
  petshop: {
    title: { tr: "Petshop", en: "Petshop" },
    description: {
      tr: "Ürün, stok ve satış işlemlerini yönetin.",
      en: "Manage products, stock and sales operations.",
    },
    nextStep: {
      tr: "Ürün ve stok hareketleri bu alanda görüntülenecek.",
      en: "Products and stock movements will be displayed here.",
    },
  },
  finance: {
    title: { tr: "Finans", en: "Finance" },
    description: {
      tr: "Tahsilatları, giderleri ve finansal özetleri takip edin.",
      en: "Track collections, expenses and financial summaries.",
    },
    nextStep: {
      tr: "Finansal hareketler ve özetler bu alanda görüntülenecek.",
      en: "Financial movements and summaries will be displayed here.",
    },
  },
  settings: {
    title: { tr: "Ayarlar", en: "Settings" },
    description: {
      tr: "Klinik ve kullanıcı tercihlerini yönetin.",
      en: "Manage clinic and user preferences.",
    },
    nextStep: {
      tr: "Klinik tercihleri bu alanda görüntülenecek.",
      en: "Clinic preferences will be displayed here.",
    },
  },
} as const satisfies Record<string, ModuleDefinition>;

/**
 * URL'den gelen modül adını sabit izin listesinde çözer.
 * @param module URL modül segmenti
 */
function resolveModule(module: string): ModuleDefinition | null {
  switch (module) {
    case "patients":
      return MODULES.patients;
    case "appointments":
      return MODULES.appointments;
    case "consultation":
      return MODULES.consultation;
    case "vaccinations":
      return MODULES.vaccinations;
    case "petshop":
      return MODULES.petshop;
    case "finance":
      return MODULES.finance;
    case "settings":
      return MODULES.settings;
    default:
      return null;
  }
}

/**
 * Ana menüden gelen modül rotasını güvenle çözer.
 * @param root0
 * @param root0.params URL parametreleri
 */
export default async function ModulePage({
  params,
}: {
  params: Promise<PageParams> | PageParams;
}): Promise<JSX.Element> {
  const resolved = await Promise.resolve(params);
  const { locale: rawLocale, module } = resolved;
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(rawLocale)) {
    notFound();
  }

  const definition = resolveModule(module);
  if (!definition) notFound();

  const locale = rawLocale as Locale;
  const labels = getLabels(locale);
  const content =
    locale === "en-GB"
      ? {
          title: definition.title.en,
          description: definition.description.en,
          nextStep: definition.nextStep.en,
        }
      : {
          title: definition.title.tr,
          description: definition.description.tr,
          nextStep: definition.nextStep.tr,
        };

  return (
    <AppShell
      locale={locale}
      pageTitle={content.title}
      pageDescription={content.description}
      user={{
        name: "Dr. Ayşe Yılmaz",
        role: locale === "en-GB" ? "Veterinarian" : "Veteriner",
      }}
    >
      <PageHeader
        title={content.title}
        description={content.description}
        breadcrumb={[
          { label: labels.nav.dashboard, href: `/${locale}/dashboard` },
          { label: content.title },
        ]}
      />

      <section
        aria-label={content.title}
        className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-gray-900">{content.title}</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          {content.nextStep}
        </p>
      </section>
    </AppShell>
  );
}
