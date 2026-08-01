/**
 * @file Dashboard sayfasi (server component).
 * @module @vetniva/web/app/[locale]/dashboard/page
 * @description Giris yapan klinik personeli icin anasayfa. Gunluk
 * oncelikleri ozetler: bugunku randevular, bekleyen hastalar, stok
 * uyarilari, tahsilat, hizli erisim butonlari, sistem durumu.
 *
 * Not: GOAL-000 kapsaminda veriler placeholder'dir; GOAL-001 ile
 * birlikte gercek API sorgularina baglanir.
 * @security Tenant filtresi URL'den alinan `tenant_id` veya oturum
 * uzerinden uygulanir. Buradaki placeholder veriler zaten
 * tenant-baglaminda uretilmis gibi davranir.
 */

import { SUPPORTED_LOCALES } from "@vetniva/contracts";
import { Badge } from "@vetniva/ui";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/layouts/app-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { getLabels, type Locale as LabelsLocale } from "@/lib/labels";

const ICONS = {
  calendar: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  waiting: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  stock: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.3 3.86l-7.1 12c-.7 1.2-.1 2.7 1.3 2.7h14.2c1.4 0 2-1.5 1.3-2.7l-7.1-12a1.7 1.7 0 0 0-2.6 0zM12 17v.01" />
    </svg>
  ),
  cash: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </svg>
  ),
  owner: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  ),
  pet: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="9" r="2" />
      <circle cx="18" cy="9" r="2" />
      <circle cx="9" cy="5" r="2" />
      <circle cx="15" cy="5" r="2" />
      <path d="M12 22c4 0 7-2.5 7-7 0-2.5-2-4-4-4H9c-2 0-4 1.5-4 4 0 4.5 3 7 7 7z" />
    </svg>
  ),
  appointment: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  sale: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 2l1.5 4M18 2l-1.5 4M3 6h18l-2 12H5L3 6zM9 10v4M15 10v4" />
    </svg>
  ),
  status: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0zM9 12l2 2 4-4" />
    </svg>
  ),
} as const;

type AppointmentRow = {
  id: string;
  time: string;
  patientName: string;
  patientAnimal: string;
  reason: string;
  status: "waiting" | "inProgress" | "completed";
  vet: string;
};

const SAMPLE_APPOINTMENTS: AppointmentRow[] = [
  {
    id: "1",
    time: "09:30",
    patientName: "Mehmet Kaya",
    patientAnimal: "Pamuk (Kedi)",
    reason: "Aşı kontrolü",
    status: "inProgress",
    vet: "Dr. Ayşe Yılmaz",
  },
  {
    id: "2",
    time: "10:15",
    patientName: "Selin Demir",
    patientAnimal: "Karabaş (Köpek)",
    reason: "Genel muayene",
    status: "waiting",
    vet: "Dr. Ahmet Çelik",
  },
  {
    id: "3",
    time: "11:00",
    patientName: "Hakan Yıldız",
    patientAnimal: "Maviş (Kuş)",
    reason: "Tüy yolma kontrolü",
    status: "waiting",
    vet: "Dr. Ayşe Yılmaz",
  },
  {
    id: "4",
    time: "13:30",
    patientName: "Ayşe Kara",
    patientAnimal: "Boncuk (Kedi)",
    reason: "Aşı tekrarı",
    status: "waiting",
    vet: "Dr. Burcu Akın",
  },
  {
    id: "5",
    time: "14:45",
    patientName: "Cem Şahin",
    patientAnimal: "Çomar (Köpek)",
    reason: "Kontrol",
    status: "completed",
    vet: "Dr. Ahmet Çelik",
  },
];

type PageParams = { locale: string };

/**
 *
 * @param status
 */
function statusTone(
  status: AppointmentRow["status"],
): "warning" | "info" | "success" {
  if (status === "waiting") return "warning";
  if (status === "inProgress") return "info";
  return "success";
}

/**
 *
 * @param now
 * @param locale
 */
function greetingKey(
  now: Date,
  locale: string,
): "greetingMorning" | "greetingAfternoon" | "greetingEvening" {
  const h = now.getHours();
  if (locale === "en-GB") {
    if (h < 12) return "greetingMorning";
    if (h < 18) return "greetingAfternoon";
    return "greetingEvening";
  }
  if (h < 12) return "greetingMorning";
  if (h < 18) return "greetingAfternoon";
  return "greetingEvening";
}

/**
 *
 * @param locale
 * @param now
 */
function formatToday(locale: string, now: Date): string {
  const dayKey =
    ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][now.getDay()] ?? "mon";
  const monthKey =
    [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ][now.getMonth()] ?? "jan";
  const labels = getLabels(locale);
  const day = labels.days[dayKey as keyof typeof labels.days];
  const month = labels.months[monthKey as keyof typeof labels.months];
  const dd = String(now.getDate()).padStart(2, "0");
  const yyyy = now.getFullYear();
  if (locale === "en-GB") {
    return `${day}, ${month} ${dd}, ${yyyy}`;
  }
  return `${dd} ${month} ${yyyy}, ${day}`;
}

/**
 *
 * @param root0
 * @param root0.params
 */
export default async function DashboardPage({
  params,
}: {
  params: Promise<PageParams> | PageParams;
}): Promise<JSX.Element> {
  const resolved = await Promise.resolve(params);
  const { locale: rawLocale } = resolved;
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(rawLocale)) {
    notFound();
  }
  const locale = rawLocale as LabelsLocale;
  const labels = getLabels(locale);

  const now = new Date();
  const today = formatToday(locale, now);
  const greeting = labels.dashboard[greetingKey(now, locale)];

  const columns: DataTableColumn<AppointmentRow>[] = [
    {
      key: "time",
      header: "Saat",
      width: "80px",
      cell: (row) => (
        <span className="font-mono text-sm font-medium text-gray-900">
          {row.time}
        </span>
      ),
    },
    {
      key: "patient",
      header: "Hasta",
      cell: (row) => (
        <div>
          <div className="font-medium text-gray-900">{row.patientName}</div>
          <div className="text-xs text-gray-500">{row.patientAnimal}</div>
        </div>
      ),
    },
    {
      key: "reason",
      header: "Sebep",
      cell: (row) => <span className="text-gray-700">{row.reason}</span>,
    },
    {
      key: "vet",
      header: "Veteriner",
      cell: (row) => <span className="text-gray-700">{row.vet}</span>,
    },
    {
      key: "status",
      header: "Durum",
      align: "right",
      cell: (row) => (
        <Badge tone={statusTone(row.status)}>
          {labels.dashboard.appointmentStatus[row.status]}
        </Badge>
      ),
    },
  ];

  return (
    <AppShell
      locale={locale}
      pageTitle={labels.dashboard.sections.todayAppointments}
      pageDescription={`${greeting}, Dr. Ayşe — ${today}`}
      user={{
        name: "Dr. Ayşe Yılmaz",
        role: locale === "en-GB" ? "Veterinarian" : "Veteriner",
      }}
    >
      <PageHeader
        title={labels.dashboard.sections.todayAppointments}
        description={
          <span>
            {greeting},{" "}
            <span className="font-medium text-gray-900">Dr. Ayşe</span> —{" "}
            {today}
          </span>
        }
        breadcrumb={[
          { label: labels.nav.dashboard, href: `/${locale}` },
          { label: labels.dashboard.sections.todayAppointments },
        ]}
      />

      {/* KPI satırı */}
      <section
        aria-label="Günlük metrikler"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KpiCard
          label={labels.dashboard.kpi.appointmentsToday}
          value="12"
          delta={2}
          icon={ICONS.calendar}
          hint="dünden"
        />
        <KpiCard
          label={labels.dashboard.kpi.waitingPatients}
          value="4"
          delta={-1}
          icon={ICONS.waiting}
          hint="dünden"
        />
        <KpiCard
          label={labels.dashboard.kpi.stockAlert}
          value="3"
          delta={1}
          icon={ICONS.stock}
          hint="son 24 saat"
        />
        <KpiCard
          label={labels.dashboard.kpi.revenueToday}
          value="₺4.250"
          delta={12}
          deltaFormat="percent"
          icon={ICONS.cash}
          hint="dünden"
        />
      </section>

      {/* İki kolon: randevular + hızlı işlemler */}
      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Bugünkü randevular */}
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900">
              {labels.dashboard.sections.todayAppointments}
            </h3>
            <a
              href={`/${locale}/appointments`}
              className="text-sm font-medium text-clinic-700 hover:text-clinic-800 hover:underline"
            >
              Tümünü gör →
            </a>
          </div>
          <DataTable
            columns={columns}
            rows={SAMPLE_APPOINTMENTS}
            getRowKey={(row) => row.id}
            empty={
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-700">
                  {labels.dashboard.empty.noAppointments}
                </p>
                <p className="text-xs text-gray-500">
                  {labels.dashboard.empty.noAppointmentsHelp}
                </p>
              </div>
            }
          />
        </div>

        {/* Hızlı işlemler */}
        <div>
          <h3 className="mb-3 text-base font-semibold text-gray-900">
            {labels.dashboard.sections.quickActions}
          </h3>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            <QuickAction
              href={`/${locale}/patients/new`}
              icon={ICONS.owner}
              label={labels.dashboard.quickActions.newOwner}
            />
            <QuickAction
              href={`/${locale}/patients/new?kind=animal`}
              icon={ICONS.pet}
              label={labels.dashboard.quickActions.newPatient}
            />
            <QuickAction
              href={`/${locale}/appointments/new`}
              icon={ICONS.appointment}
              label={labels.dashboard.quickActions.newAppointment}
            />
            <QuickAction
              href={`/${locale}/petshop/sales/new`}
              icon={ICONS.sale}
              label={labels.dashboard.quickActions.newSale}
            />
          </div>

          {/* Sistem durumu kartı */}
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-clinic-700">
                <span className="block h-5 w-5">{ICONS.status}</span>
              </span>
              <h4 className="text-sm font-semibold text-gray-900">
                {labels.dashboard.sections.systemStatus}
              </h4>
            </div>
            <dl className="space-y-1.5 text-sm">
              <SystemStatusRow label={labels.system.api} status="up" />
              <SystemStatusRow
                label={labels.system.database}
                status="up"
                meta="12ms"
              />
              <SystemStatusRow label={labels.system.queue} status="up" />
              <SystemStatusRow
                label={labels.system.version}
                status="unknown"
                meta="0.1.0 (devlocal)"
              />
            </dl>
            <a
              href={`/${locale}/health`}
              className="mt-3 inline-flex text-xs font-medium text-clinic-700 hover:text-clinic-800 hover:underline"
            >
              {labels.system.detail} →
            </a>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

/**
 *
 * @param root0
 * @param root0.href
 * @param root0.icon
 * @param root0.label
 */
function QuickAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}): JSX.Element {
  return (
    <a
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:border-clinic-300 hover:bg-clinic-50/40"
    >
      <span
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-clinic-50 text-clinic-700 transition-colors group-hover:bg-clinic-100"
      >
        <span className="h-5 w-5">{icon}</span>
      </span>
      <span className="text-sm font-medium text-gray-900">{label}</span>
    </a>
  );
}

/**
 *
 * @param root0
 * @param root0.label
 * @param root0.status
 * @param root0.meta
 */
function SystemStatusRow({
  label,
  status,
  meta,
}: {
  label: string;
  status: "up" | "down" | "unknown";
  meta?: string;
}): JSX.Element {
  const labels = getLabels("tr-TR");
  const statusLabels = labels.status;
  const tone =
    status === "up" ? "success" : status === "down" ? "danger" : "neutral";
  const statusText =
    status === "up"
      ? statusLabels.up
      : status === "down"
        ? statusLabels.down
        : statusLabels.unknown;
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-gray-600">{label}</dt>
      <dd className="flex items-center gap-2">
        {meta ? (
          <span className="font-mono text-xs text-gray-500">{meta}</span>
        ) : null}
        <Badge tone={tone} size="sm">
          {statusText}
        </Badge>
      </dd>
    </div>
  );
}
