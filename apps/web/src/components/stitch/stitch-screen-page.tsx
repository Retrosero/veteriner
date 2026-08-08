/**
 * @file Stitch kaynak ekranlarının uygulama karşılıkları.
 * @module @vetniva/web/components/stitch/stitch-screen-page
 * @description VetNiva Stitch projesindeki hasta, klinik, finans, POS ve
 * ayarlar ekranlarını; aynı görsel sistemle randevu ve aşı ekranlarını mevcut
 * uygulama kabuğuna taşır. Veri örnekleri yalnızca görsel iskelet içindir;
 * gerçek kayıt işlemleri ilgili API ve yetki akışı bağlanmadan yapılmaz.
 * @security Tenant kimliği veya hassas klinik/finans verisi burada üretilmez.
 * Gerçek veriler route katmanında doğrulanmış oturum bağlamından gelmelidir.
 */

import { SUPPORTED_LOCALES } from "@vetniva/contracts";
import { Badge, Button, Card, CardBody, Input } from "@vetniva/ui";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/layouts/app-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { getLabels, type Locale } from "@/lib/labels";

export type StitchScreen =
  | "design-system"
  | "patients"
  | "patients-filtered"
  | "patient-new"
  | "patient-detail"
  | "consultation-active"
  | "consultation-signed"
  | "appointments"
  | "vaccinations"
  | "finance"
  | "petshop"
  | "settings-users"
  | "settings-clinic";

type PageParams = { locale: string };

const user = { name: "Dr. Ayşe Yılmaz", role: "Veteriner" };

type PatientRow = {
  id: string;
  name: string;
  owner: string;
  species: string;
  microchip: string;
  status: "Aktif" | "Muayenede";
};

type AppointmentRow = {
  id: string;
  time: string;
  patient: string;
  owner: string;
  reason: string;
  status: "Muayenede" | "Bekliyor" | "Onaylandı";
};

type VaccinationRow = {
  id: string;
  patient: string;
  vaccine: string;
  due: string;
  status: "3 gün kaldı" | "Planlandı";
};

const patients: PatientRow[] = [
  {
    id: "pamuk",
    name: "Pamuk",
    owner: "Mehmet Kaya",
    species: "Kedi · British Shorthair",
    microchip: "990000001234567",
    status: "Muayenede",
  },
  {
    id: "karabas",
    name: "Karabaş",
    owner: "Selin Demir",
    species: "Köpek · Golden Retriever",
    microchip: "990000001234568",
    status: "Aktif",
  },
  {
    id: "mavis",
    name: "Maviş",
    owner: "Hakan Yıldız",
    species: "Kuş · Muhabbet kuşu",
    microchip: "—",
    status: "Aktif",
  },
];

const patientColumns: DataTableColumn<PatientRow>[] = [
  {
    key: "name",
    header: "Hasta",
    cell: (row) => (
      <div>
        <p className="font-medium">{row.name}</p>
        <p className="text-xs text-[#5F6368]">{row.species}</p>
      </div>
    ),
  },
  { key: "owner", header: "Sahip", cell: (row) => row.owner },
  {
    key: "microchip",
    header: "Mikroçip",
    cell: (row) => <span className="font-mono text-xs">{row.microchip}</span>,
  },
  {
    key: "status",
    header: "Durum",
    align: "right",
    cell: (row) => (
      <Badge tone={row.status === "Muayenede" ? "info" : "success"}>
        {row.status}
      </Badge>
    ),
  },
];

/** Stitch route ekranını locale doğrulamasıyla render eder. */
export async function StitchScreenPage({
  params,
  screen,
}: {
  params: Promise<PageParams> | PageParams;
  screen: StitchScreen;
}): Promise<JSX.Element> {
  const { locale: rawLocale } = await Promise.resolve(params);
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(rawLocale)) notFound();
  const locale = rawLocale as Locale;
  const labels = getLabels(locale);
  const content = screenContent(screen, locale);

  return (
    <AppShell
      locale={locale}
      pageTitle={content.title}
      pageDescription={content.description}
      user={user}
    >
      <PageHeader
        title={content.title}
        description={content.description}
        breadcrumb={[
          { label: labels.nav.dashboard, href: `/${locale}/dashboard` },
          { label: content.title },
        ]}
        actions={content.action}
      />
      {content.body}
    </AppShell>
  );
}

function screenContent(
  screen: StitchScreen,
  locale: Locale,
): {
  title: string;
  description: string;
  action?: JSX.Element;
  body: JSX.Element;
} {
  const route = `/${locale}`;
  const listAction = (
    <a href={`${route}/patients/new`}>
      <Button>+ Yeni Hasta</Button>
    </a>
  );
  switch (screen) {
    case "patients":
    case "patients-filtered":
      return {
        title: "Hastalar",
        description:
          "Klinikte kayıtlı hastaları arayın, filtreleyin ve yönetin.",
        action: listAction,
        body: <PatientsTable filtered={screen === "patients-filtered"} />,
      };
    case "patient-new":
      return {
        title: "Yeni Hasta Kaydı",
        description: "Sahip ve hasta bilgilerini güvenli biçimde kaydedin.",
        body: <PatientForm />,
      };
    case "patient-detail":
      return {
        title: "Pamuk",
        description: "British Shorthair · 3 yaş · Dişi",
        action: <Button variant="secondary">Muayene Başlat</Button>,
        body: <PatientDetail />,
      };
    case "consultation-active":
      return {
        title: "Aktif Muayene",
        description: "Pamuk · Mehmet Kaya · Bugün 09:30",
        action: <Button>Muayeneyi Kaydet</Button>,
        body: <Consultation signed={false} />,
      };
    case "consultation-signed":
      return {
        title: "İmzalanmış Muayene Kaydı",
        description: "Pamuk · 07.08.2026 · Dr. Ayşe Yılmaz",
        body: <Consultation signed />,
      };
    case "appointments":
      return {
        title: "Randevular",
        description:
          "Günlük programı, bekleyen hastaları ve takipleri yönetin.",
        action: <Button>+ Yeni Randevu</Button>,
        body: <Appointments />,
      };
    case "vaccinations":
      return {
        title: "Aşılar",
        description:
          "Aşı takvimini, uygulamaları ve yaklaşan hatırlatmaları takip edin.",
        action: <Button>+ Aşı Uygula</Button>,
        body: <Vaccinations />,
      };
    case "finance":
      return {
        title: "Finans",
        description: "Tahsilat, borç ve işlem özetinizi takip edin.",
        action: <Button>+ Yeni Tahsilat</Button>,
        body: <Finance />,
      };
    case "petshop":
      return {
        title: "Petshop ve Satış",
        description: "Ürünleri, stok durumunu ve aktif satışı yönetin.",
        action: <Button>+ Yeni Ürün</Button>,
        body: <Petshop />,
      };
    case "settings-users":
      return {
        title: "Ayarlar",
        description: "Kullanıcıları, rollerini ve klinik erişimlerini yönetin.",
        action: <Button>+ Kullanıcı Davet Et</Button>,
        body: <Settings users />,
      };
    case "settings-clinic":
      return {
        title: "Ayarlar",
        description: "Klinik bilgileri ve çalışma tercihleri.",
        body: <Settings users={false} />,
      };
    case "design-system":
      return {
        title: "VetNiva Tasarım Sistemi",
        description: "Stitch kaynaklı renk, yüzey ve bileşen referansları.",
        body: <DesignSystem />,
      };
  }
}

function PatientsTable({ filtered }: { filtered: boolean }): JSX.Element {
  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Input
            aria-label="Hasta ara"
            placeholder="Hasta, sahip veya mikroçip ara…"
            className="max-w-[320px]"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary">
              ⌕ Filtrele{filtered ? " · 2" : ""}
            </Button>
            <Button variant="secondary">Sütunlar</Button>
            <Button variant="secondary">Dışa aktar</Button>
          </div>
        </CardBody>
      </Card>
      {filtered ? (
        <Card>
          <CardBody className="grid gap-4 md:grid-cols-3">
            <Filter label="Tür" value="Kedi" />
            <Filter label="Durum" value="Aktif, Muayenede" />
            <Filter label="Kayıt tarihi" value="Son 30 gün" />
            <div className="md:col-span-3 flex justify-end gap-2">
              <Button variant="secondary">Vazgeç</Button>
              <Button>Uygula</Button>
            </div>
          </CardBody>
        </Card>
      ) : null}
      <DataTable
        caption="Hasta listesi"
        columns={patientColumns}
        rows={patients}
        getRowKey={(row) => row.id}
      />
      <p className="text-sm text-[#5F6368]">
        Toplam 128 kayıttan 1–25 arası gösteriliyor
      </p>
    </div>
  );
}

function Filter({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <label className="space-y-1 text-sm font-medium text-[#1D1D1F]">
      <span>{label}</span>
      <Input value={value} readOnly />
    </label>
  );
}

function PatientForm(): JSX.Element {
  return (
    <form className="mx-auto max-w-[960px] space-y-6">
      <Section
        title="Sahip bilgileri"
        helper="İletişim bilgileri yalnızca hasta bakım sürecinde kullanılır."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Ad soyad" value="Mehmet Kaya" />
          <Field label="Telefon" value="+90 555 123 4567" />
          <Field label="E-posta" value="mehmet.kaya@example.com" />
        </div>
      </Section>
      <Section
        title="Hasta bilgileri"
        helper="Mikroçip numarası klinik içindeki hasta için benzersiz olmalıdır."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Hasta adı" value="Pamuk" />
          <Field label="Tür" value="Kedi" />
          <Field label="Irk" value="British Shorthair" />
          <Field label="Mikroçip" value="990000001234567" />
        </div>
      </Section>
      <SaveBar />
    </form>
  );
}

function PatientDetail(): JSX.Element {
  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="flex flex-col gap-5 md:flex-row md:items-center">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-[#E6F4EC] text-2xl font-semibold text-[#0D4D2E]">
            P
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold">Pamuk</h3>
            <p className="mt-1 text-sm text-[#5F6368]">
              British Shorthair · 3 yaş · 4,8 kg · Dişi
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="success">Aktif</Badge>
              <Badge tone="warning">Alerji: Tavuk proteini</Badge>
            </div>
          </div>
        </CardBody>
      </Card>
      <div className="border-b border-[#E1E5E2] text-sm font-medium text-[#0D4D2E]">
        <span className="inline-block border-b-2 border-[#167A4A] px-3 py-3">
          Genel Bakış
        </span>
        <span className="inline-block px-3 py-3 text-[#5F6368]">
          Muayeneler
        </span>
        <span className="inline-block px-3 py-3 text-[#5F6368]">Aşılar</span>
      </div>
      <Section title="Son muayene" helper="07.08.2026 · Dr. Ayşe Yılmaz">
        <p className="text-sm text-[#1D1D1F]">
          İştahsızlık şikâyeti değerlendirildi. Düzeltme gerektiğinde yeni
          amendment kaydı oluşturulur.
        </p>
      </Section>
    </div>
  );
}

function Consultation({ signed }: { signed: boolean }): JSX.Element {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Section
          title="Klinik not"
          helper={
            signed
              ? "Kayıt imzalandı; doğrudan değiştirilemez."
              : "Muayene bulgularını kaydetmeden önce gözden geçirin."
          }
        >
          <textarea
            aria-label="Klinik not"
            readOnly
            value="Genel durum iyi. İştahsızlık iki gündür devam ediyor. Karın palpasyonunda hassasiyet saptanmadı."
            className="min-h-40 w-full rounded-[10px] border border-[#D5DBD7] p-3.5 text-sm"
          />
        </Section>
        <Section
          title="Tanı ve plan"
          helper="Klinik kararlar audit geçmişinde saklanır."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Ön tanı" value="Gastrointestinal hassasiyet" />
            <Field label="Kontrol tarihi" value="14.08.2026" />
          </div>
        </Section>
        {signed ? (
          <Card>
            <CardBody>
              <Badge tone="success">İmzalandı</Badge>
              <p className="mt-3 text-sm">
                Dr. Ayşe Yılmaz tarafından 07.08.2026 10:12 tarihinde imzalandı.
              </p>
              <Button variant="secondary" className="mt-4">
                Düzeltme oluştur
              </Button>
            </CardBody>
          </Card>
        ) : null}
      </div>
      <Card>
        <CardBody>
          <h3 className="font-semibold">Hasta özeti</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <Summary label="Hasta" value="Pamuk" />
            <Summary label="Sahip" value="Mehmet Kaya" />
            <Summary label="Uyarı" value="Tavuk proteini alerjisi" />
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}

function Appointments(): JSX.Element {
  const rows: AppointmentRow[] = [
    {
      id: "09-30",
      time: "09:30",
      patient: "Pamuk",
      owner: "Mehmet Kaya",
      reason: "Kontrol",
      status: "Muayenede",
    },
    {
      id: "10-15",
      time: "10:15",
      patient: "Karabaş",
      owner: "Selin Demir",
      reason: "Genel muayene",
      status: "Bekliyor",
    },
    {
      id: "11-00",
      time: "11:00",
      patient: "Maviş",
      owner: "Hakan Yıldız",
      reason: "Tüy dökümü",
      status: "Onaylandı",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Bugünkü randevu" value="18" tone="info" />
        <Metric label="Bekleyen hasta" value="4" tone="warning" />
        <Metric label="Tamamlanan" value="7" tone="success" />
      </div>
      <Card>
        <CardBody className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#1D1D1F]">
              7 Ağustos 2026, Cuma
            </p>
            <p className="mt-1 text-sm text-[#5F6368]">Günlük görünüm</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary">‹ Önceki gün</Button>
            <Button variant="secondary">Bugün</Button>
            <Button variant="secondary">Sonraki gün ›</Button>
          </div>
        </CardBody>
      </Card>
      <Section
        title="Günün randevuları"
        helper="Randevu durumu ve hasta akışı tek listede izlenir."
      >
        <DataTable
          caption="Günlük randevu listesi"
          columns={[
            {
              key: "time",
              header: "Saat",
              cell: (row) => (
                <span className="font-mono font-medium">{row.time}</span>
              ),
            },
            {
              key: "patient",
              header: "Hasta",
              cell: (row) => (
                <div>
                  <p className="font-medium">{row.patient}</p>
                  <p className="text-xs text-[#5F6368]">{row.owner}</p>
                </div>
              ),
            },
            { key: "reason", header: "Sebep", cell: (row) => row.reason },
            {
              key: "status",
              header: "Durum",
              align: "right",
              cell: (row) => (
                <Badge
                  tone={
                    row.status === "Muayenede"
                      ? "info"
                      : row.status === "Bekliyor"
                        ? "warning"
                        : "success"
                  }
                >
                  {row.status}
                </Badge>
              ),
            },
          ]}
          rows={rows}
          getRowKey={(row) => row.id}
        />
      </Section>
    </div>
  );
}

function Vaccinations(): JSX.Element {
  const rows: VaccinationRow[] = [
    {
      id: "pamuk",
      patient: "Pamuk",
      vaccine: "Karma aşı",
      due: "10.08.2026",
      status: "3 gün kaldı",
    },
    {
      id: "karabas",
      patient: "Karabaş",
      vaccine: "Kuduz",
      due: "18.08.2026",
      status: "Planlandı",
    },
    {
      id: "mavis",
      patient: "Maviş",
      vaccine: "PBFD",
      due: "25.08.2026",
      status: "Planlandı",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Bu ay planlanan" value="24" tone="info" />
        <Metric label="Yaklaşan uygulama" value="6" tone="warning" />
        <Metric label="Tamamlanan" value="38" tone="success" />
      </div>
      <Card>
        <CardBody className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Input
            aria-label="Aşı takviminde ara"
            placeholder="Hasta veya aşı adına göre ara…"
            className="max-w-[320px]"
          />
          <div className="flex gap-2">
            <Button variant="secondary">⌕ Filtrele</Button>
            <Button variant="secondary">Takvim görünümü</Button>
          </div>
        </CardBody>
      </Card>
      <Section
        title="Yaklaşan aşılar"
        helper="Uygulama öncesinde hasta, ürün lotu ve son kullanma tarihi doğrulanır."
      >
        <DataTable
          caption="Yaklaşan aşı uygulamaları"
          columns={[
            {
              key: "patient",
              header: "Hasta",
              cell: (row) => <p className="font-medium">{row.patient}</p>,
            },
            { key: "vaccine", header: "Aşı", cell: (row) => row.vaccine },
            { key: "due", header: "Planlanan tarih", cell: (row) => row.due },
            {
              key: "status",
              header: "Durum",
              align: "right",
              cell: (row) => (
                <Badge tone={row.status === "3 gün kaldı" ? "warning" : "info"}>
                  {row.status}
                </Badge>
              ),
            },
          ]}
          rows={rows}
          getRowKey={(row) => row.id}
        />
      </Section>
    </div>
  );
}

function Finance(): JSX.Element {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Bugünkü tahsilat" value="₺12.480,00" tone="success" />
        <Metric label="Bekleyen alacak" value="₺4.260,00" tone="warning" />
        <Metric label="Bu ay net gelir" value="₺184.320,00" tone="info" />
      </div>
      <Section
        title="Son işlemler"
        helper="Silme yerine iptal ve ters kayıt akışı kullanılır."
      >
        <DataTable
          caption="Finansal işlemler"
          columns={[
            { key: "date", header: "Tarih", cell: () => "07.08.2026" },
            {
              key: "description",
              header: "Açıklama",
              cell: () => "Pamuk muayene tahsilatı",
            },
            {
              key: "amount",
              header: "Tutar",
              align: "right",
              cell: () => "₺1.250,00",
            },
            {
              key: "status",
              header: "Durum",
              align: "right",
              cell: () => <Badge tone="success">Tahsil edildi</Badge>,
            },
          ]}
          rows={[{}]}
        />
      </Section>
    </div>
  );
}

function Petshop(): JSX.Element {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Card>
          <CardBody className="flex flex-wrap gap-2">
            <Input
              aria-label="Ürün ara"
              placeholder="Ürün, barkod veya kategori ara…"
              className="max-w-[320px]"
            />
            <Button variant="secondary">Filtrele</Button>
          </CardBody>
        </Card>
        <DataTable
          caption="Petshop ürünleri"
          columns={[
            {
              key: "product",
              header: "Ürün",
              cell: () => (
                <div>
                  <p className="font-medium">Kedi Maması 12 kg</p>
                  <p className="text-xs text-[#5F6368]">Pro Plan Sterilised</p>
                </div>
              ),
            },
            { key: "stock", header: "Mevcut stok", cell: () => "4 adet" },
            {
              key: "status",
              header: "Durum",
              align: "right",
              cell: () => <Badge tone="warning">Düşük stok</Badge>,
            },
          ]}
          rows={[{}]}
        />
      </div>
      <Card>
        <CardBody>
          <h3 className="text-lg font-semibold">Satış (POS)</h3>
          <Input
            aria-label="Barkod ara"
            placeholder="Barkod okut veya ara…"
            className="mt-4"
          />
          <div className="my-6 rounded-[10px] bg-[#F1F5F1] p-4">
            <p className="font-medium">Köpek Oyuncak İpi</p>
            <p className="mt-1 text-sm text-[#5F6368]">1 × ₺120,00</p>
          </div>
          <Summary label="Ara toplam" value="₺101,69" />
          <Summary label="KDV (%18)" value="₺18,31" />
          <Summary label="Toplam" value="₺120,00" />
          <Button className="mt-5 w-full">Tahsilata Geç</Button>
        </CardBody>
      </Card>
    </div>
  );
}

function Settings({ users }: { users: boolean }): JSX.Element {
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <Card>
        <CardBody>
          <nav className="space-y-1 text-sm">
            <p className="rounded-[10px] bg-[#E6F4EC] px-3 py-2 font-medium text-[#0D4D2E]">
              {users ? "Kullanıcılar" : "Klinik Bilgileri"}
            </p>
            {[
              "Klinik Bilgileri",
              "Şubeler",
              "Kullanıcılar",
              "Roller ve İzinler",
              "Randevu Ayarları",
              "Bildirimler",
              "Güvenlik",
            ]
              .filter(
                (item) =>
                  item !== (users ? "Kullanıcılar" : "Klinik Bilgileri"),
              )
              .map((item) => (
                <p className="px-3 py-2 text-[#5F6368]" key={item}>
                  {item}
                </p>
              ))}
          </nav>
        </CardBody>
      </Card>
      {users ? (
        <Section
          title="Kullanıcılar"
          helper="Kullanıcı davetleri rol ve şube yetkileriyle oluşturulur."
        >
          <DataTable
            caption="Kullanıcı listesi"
            columns={[
              {
                key: "name",
                header: "Kullanıcı",
                cell: () => (
                  <div>
                    <p className="font-medium">Dr. Ayşe Yılmaz</p>
                    <p className="text-xs text-[#5F6368]">ayse@vetniva.com</p>
                  </div>
                ),
              },
              { key: "role", header: "Rol", cell: () => "Veteriner" },
              {
                key: "status",
                header: "Durum",
                align: "right",
                cell: () => <Badge tone="success">Aktif</Badge>,
              },
            ]}
            rows={[{}]}
          />
        </Section>
      ) : (
        <form className="space-y-6">
          <Section
            title="Genel bilgiler"
            helper="Klinik kimliği, faturalama ve iletişimde kullanılır."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Klinik adı" value="VetNiva Merkez Klinik" />
              <Field label="Vergi numarası" value="1234567890" />
              <Field label="E-posta" value="iletisim@vetniva.com" />
              <Field label="Telefon" value="+90 555 123 4567" />
            </div>
          </Section>
          <Section
            title="Bölgesel ayarlar"
            helper="Saat ve para birimi tüm klinik görünümlerinde kullanılır."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Zaman dilimi" value="(GMT+03:00) İstanbul" />
              <Field label="Para birimi" value="Türk Lirası (₺)" />
            </div>
          </Section>
          <SaveBar />
        </form>
      )}
    </div>
  );
}

function DesignSystem(): JSX.Element {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Section title="Renkler" helper="Stitch kaynak tasarım sistemi">
        <div className="flex gap-3">
          {[
            ["#167A4A", "Primary"],
            ["#0D4D2E", "Identity"],
            ["#E6F4EC", "Selected"],
            ["#F7F8F7", "Background"],
          ].map(([color, name]) => (
            <div key={name} className="flex-1">
              <div
                className="h-16 rounded-[10px] border border-[#E1E5E2]"
                style={{ backgroundColor: color }}
              />
              <p className="mt-2 text-xs">{name}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Bileşenler" helper="Ortak UI primitive'leri">
        <div className="flex flex-wrap gap-3">
          <Button>Kaydet</Button>
          <Button variant="secondary">Vazgeç</Button>
          <Badge tone="success">Tamamlandı</Badge>
          <Badge tone="warning">Bekliyor</Badge>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  helper,
  children,
}: {
  title: string;
  helper: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <Card>
      <CardBody>
        <h3 className="text-lg font-semibold text-[#1D1D1F]">{title}</h3>
        <p className="mt-1 text-sm text-[#5F6368]">{helper}</p>
        <div className="mt-5">{children}</div>
      </CardBody>
    </Card>
  );
}
function Field({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <label className="space-y-1.5 text-sm font-medium text-[#1D1D1F]">
      <span>{label}</span>
      <Input value={value} readOnly />
    </label>
  );
}
function SaveBar(): JSX.Element {
  return (
    <div className="sticky bottom-4 z-10 flex items-center justify-between rounded-[14px] border border-[#E1E5E2] bg-white p-3 shadow-lg">
      <span className="text-sm text-[#5F6368]">
        Kaydedilmemiş değişiklik yok
      </span>
      <div className="flex gap-2">
        <Button variant="secondary">Vazgeç</Button>
        <Button>Kaydet</Button>
      </div>
    </div>
  );
}
function Summary({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <dt className="text-[#5F6368]">{label}</dt>
      <dd className="font-medium text-[#1D1D1F]">{value}</dd>
    </div>
  );
}
function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "info";
}): JSX.Element {
  return (
    <Card>
      <CardBody>
        <p className="text-sm text-[#5F6368]">{label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
        <Badge tone={tone} className="mt-3">
          Bu ay
        </Badge>
      </CardBody>
    </Card>
  );
}
