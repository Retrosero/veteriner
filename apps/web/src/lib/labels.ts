/**
 * @file Tüm UI etiketleri tek dosyada.
 * @module @vetniva/web/lib/labels
 * @description Layout, header, sidebar, dashboard, login, vb. Tüm
 * kullanıcıya görünen metinler burada toplanır. Çok dilli (tr-TR,
 * en-GB) desteklenir; eksik anahtarlar `tr-TR` fallback'ine düşer.
 *
 * Not: Server component'lerden direkt kullanılabilir; client
 * component'ler `useTranslation` ile erişir. Bu dosya sabit (build
 * time) metinler içindir; çalışma zamanı çevirisi `@vetniva/i18n`
 * üzerinden yapılır.
 */

const tr = {
  brand: {
    name: "VetNiva",
    tagline: "Veteriner klinik yönetim sistemi",
  },
  nav: {
    dashboard: "Anasayfa",
    patients: "Hastalar",
    appointments: "Randevular",
    consultation: "Muayene",
    vaccinations: "Aşılar",
    petshop: "Petshop",
    finance: "Finans",
    settings: "Ayarlar",
    signOut: "Çıkış",
  },
  topbar: {
    search: "Ara…",
    notifications: "Bildirimler",
    noNotifications: "Yeni bildirim yok",
    profile: "Profilim",
    switchLocale: "Dil",
    openMenu: "Menüyü aç",
    closeMenu: "Menüyü kapat",
  },
  login: {
    title: "Hesabınıza giriş yapın",
    subtitle: "Klinik yönetim sistemi",
    emailLabel: "E-posta",
    emailPlaceholder: "ornek@klinik.com",
    passwordLabel: "Şifre",
    passwordPlaceholder: "••••••••",
    forgotPassword: "Şifrenizi mi unuttunuz?",
    submit: "Giriş Yap",
    submitPending: "Giriş yapılıyor…",
    or: "veya",
    portalEntry: "Portal Girişi",
    portalHelp: "Hasta sahibi misiniz?",
    error: {
      invalid: "E-posta veya şifre hatalı.",
      required: "Lütfen e-posta ve şifrenizi girin.",
      generic: "Giriş yapılamadı. Lütfen tekrar deneyin.",
    },
    footer: "© 2026 VetNiva",
  },
  dashboard: {
    greetingMorning: "Günaydın",
    greetingAfternoon: "İyi günler",
    greetingEvening: "İyi akşamlar",
    todayLabel: "Bugün",
    kpi: {
      appointmentsToday: "Bugünkü Randevular",
      waitingPatients: "Bekleyen Hastalar",
      stockAlert: "Stok Uyarısı",
      revenueToday: "Bugünkü Tahsilat",
    },
    sections: {
      todayAppointments: "Bugünkü Randevular",
      quickActions: "Hızlı İşlemler",
      systemStatus: "Sistem Durumu",
    },
    quickActions: {
      newOwner: "Yeni Hasta Sahibi",
      newPatient: "Yeni Hayvan",
      newAppointment: "Yeni Randevu",
      newSale: "Yeni Satış",
    },
    appointmentStatus: {
      waiting: "Beklemede",
      inProgress: "Muayenede",
      completed: "Tamamlandı",
      cancelled: "İptal",
    },
    reason: {
      vaccination: "Aşı kontrolü",
      checkup: "Genel muayene",
      followup: "Kontrol",
      vaccinationBoosters: "Aşı tekrarı",
    },
    empty: {
      noAppointments: "Bugün için randevu yok",
      noAppointmentsHelp: "Yeni bir randevu oluşturarak başlayabilirsiniz.",
    },
  },
  health: {
    title: "Sistem Sağlığı",
    description: "Platform bileşenlerinin canlı durumu.",
    ok: "Çalışıyor",
    degraded: "Kısmen çalışıyor",
    down: "Çalışmıyor",
    db: "Veritabanı",
    latency: "Gecikme",
    correlation: "Correlation ID",
    errorTitle: "Sağlık bilgisi alınamadı",
    noData: "Şu an görüntülenecek veri yok.",
    fetchError:
      "API bağlantısı kurulamadı. Lütfen API servisinin çalıştığından emin olun.",
  },
  system: {
    api: "API",
    database: "Veritabanı",
    queue: "Kuyruk",
    storage: "Depolama",
    version: "Sürüm",
    build: "Build",
    detail: "Detaylar",
  },
  days: {
    mon: "Pzt",
    tue: "Sal",
    wed: "Çar",
    thu: "Per",
    fri: "Cum",
    sat: "Cmt",
    sun: "Paz",
  },
  months: {
    jan: "Oca",
    feb: "Şub",
    mar: "Mar",
    apr: "Nis",
    may: "May",
    jun: "Haz",
    jul: "Tem",
    aug: "Ağu",
    sep: "Eyl",
    oct: "Eki",
    nov: "Kas",
    dec: "Ara",
  },
  units: {
    ms: "ms",
    currency: "₺",
    percent: "%",
  },
  status: {
    up: "Çalışıyor",
    down: "Çalışmıyor",
    unknown: "Bilinmiyor",
  },
  errors: {
    title: "Bir sorun oluştu",
    description:
      "Beklenmeyen bir hatayla karşılaşıldı. Lütfen tekrar deneyin veya destek ekibine bildirin.",
    retry: "Yeniden dene",
  },
  common: {
    save: "Kaydet",
    cancel: "Vazgeç",
    delete: "Sil",
    edit: "Düzenle",
    create: "Oluştur",
    search: "Ara",
    loading: "Yükleniyor…",
    empty: "Kayıt bulunamadı",
    error: "Bir hata oluştu",
    retry: "Tekrar dene",
    back: "Geri",
    next: "İleri",
    previous: "Önceki",
    yes: "Evet",
    no: "Hayır",
    required: "Zorunlu alan",
  },
  onboarding: {
    welcome: "VetNiva Hoş Geldiniz",
    description: "Rolünüzü seçin; ilk adımlarda sizi yönlendirelim.",
    step1Title: "Hoş Geldiniz",
    step1Subtitle: "Rol seçimi",
    step1RoleVet: "Veteriner Hekim",
    step1RoleStaff: "Klinik Personeli",
    step1RoleOwner: "İşletme Sahibi",
    step1RolePortal: "Hasta Sahibi",
    step2Title: "Konu Eşleştir",
    step2Subtitle: "Soru sorun veya senaryo seçin",
    step2InputLabel: "Sorunuz",
    step2InputPlaceholder: "Örn. Aşı kaydı nasıl yapılır?",
    step2Submit: "Yönlendir",
    step3Title: "Adımlar",
    step3Subtitle: "Aşağıdaki adımları takip edin",
    step3NoMatch: "Sorunuzla eşleşen bir senaryo bulunamadı.",
    step3MedicalRefusal:
      "Bu asistan tıbbi sorularda (tanı, tedavi, doz) yardımcı olamaz. Lütfen veteriner hekiminize danışın.",
    step3Navigate: "Sayfaya git",
    ctaStart: "Başla",
    ctaNext: "İleri",
    ctaBack: "Geri",
    ctaFinish: "Bitir",
    ctaClose: "Kapat",
    helpButton: "Yardım",
    empty: "Senaryo bulunamadı",
    loading: "Senaryolar yükleniyor...",
    errorGeneric: "Onboarding içeriği yüklenemedi.",
  },
} as const;

const en = {
  brand: {
    name: "VetNiva",
    tagline: "Veterinary clinic management platform",
  },
  nav: {
    dashboard: "Dashboard",
    patients: "Patients",
    appointments: "Appointments",
    consultation: "Consultation",
    vaccinations: "Vaccinations",
    petshop: "Petshop",
    finance: "Finance",
    settings: "Settings",
    signOut: "Sign out",
  },
  topbar: {
    search: "Search…",
    notifications: "Notifications",
    noNotifications: "No new notifications",
    profile: "My profile",
    switchLocale: "Language",
    openMenu: "Open menu",
    closeMenu: "Close menu",
  },
  login: {
    title: "Sign in to your account",
    subtitle: "Clinic management system",
    emailLabel: "Email",
    emailPlaceholder: "you@clinic.com",
    passwordLabel: "Password",
    passwordPlaceholder: "••••••••",
    forgotPassword: "Forgot password?",
    submit: "Sign in",
    submitPending: "Signing in…",
    or: "or",
    portalEntry: "Portal sign in",
    portalHelp: "Are you a pet owner?",
    error: {
      invalid: "Invalid email or password.",
      required: "Please enter your email and password.",
      generic: "Could not sign in. Please try again.",
    },
    footer: "© 2026 VetNiva",
  },
  dashboard: {
    greetingMorning: "Good morning",
    greetingAfternoon: "Good afternoon",
    greetingEvening: "Good evening",
    todayLabel: "Today",
    kpi: {
      appointmentsToday: "Today's appointments",
      waitingPatients: "Waiting patients",
      stockAlert: "Stock alerts",
      revenueToday: "Today's revenue",
    },
    sections: {
      todayAppointments: "Today's appointments",
      quickActions: "Quick actions",
      systemStatus: "System status",
    },
    quickActions: {
      newOwner: "New owner",
      newPatient: "New patient",
      newAppointment: "New appointment",
      newSale: "New sale",
    },
    appointmentStatus: {
      waiting: "Waiting",
      inProgress: "In progress",
      completed: "Completed",
      cancelled: "Cancelled",
    },
    reason: {
      vaccination: "Vaccination check",
      checkup: "General checkup",
      followup: "Follow-up",
      vaccinationBoosters: "Booster shot",
    },
    empty: {
      noAppointments: "No appointments today",
      noAppointmentsHelp: "Get started by creating a new appointment.",
    },
  },
  health: {
    title: "System health",
    description: "Live status of platform components.",
    ok: "Operational",
    degraded: "Degraded",
    down: "Down",
    db: "Database",
    latency: "Latency",
    correlation: "Correlation ID",
    errorTitle: "Health information unavailable",
    noData: "No data to display right now.",
    fetchError:
      "Could not reach the API. Please ensure the API service is running.",
  },
  system: {
    api: "API",
    database: "Database",
    queue: "Queue",
    storage: "Storage",
    version: "Version",
    build: "Build",
    detail: "Details",
  },
  days: {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  },
  months: {
    jan: "Jan",
    feb: "Feb",
    mar: "Mar",
    apr: "Apr",
    may: "May",
    jun: "Jun",
    jul: "Jul",
    aug: "Aug",
    sep: "Sep",
    oct: "Oct",
    nov: "Nov",
    dec: "Dec",
  },
  units: {
    ms: "ms",
    currency: "₺",
    percent: "%",
  },
  status: {
    up: "Operational",
    down: "Down",
    unknown: "Unknown",
  },
  errors: {
    title: "Something went wrong",
    description:
      "An unexpected error occurred. Please try again or contact support.",
    retry: "Try again",
  },
  common: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    create: "Create",
    search: "Search",
    loading: "Loading…",
    empty: "No records found",
    error: "An error occurred",
    retry: "Try again",
    back: "Back",
    next: "Next",
    previous: "Previous",
    yes: "Yes",
    no: "No",
    required: "Required",
  },
  onboarding: {
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
  },
} as const;

export type Labels = typeof tr;
export type Locale = "tr-TR" | "en-GB";

const dictionaries: Record<Locale, Labels> = {
  "tr-TR": tr,
  // İngilizce sözlük, Türkçe ile aynı yapısal tipte (literal
  // değerler farklı, tipler `string`'e genişletilmiş).
  "en-GB": en as unknown as Labels,
};

/**
 * Aktif locale için etiket setini döner. Bilinmeyen bir değer gelirse
 * varsayılan olarak `tr-TR` kullanılır.
 * @param locale
 */
export function getLabels(locale: string | null | undefined): Labels {
  if (locale === "en-GB") return dictionaries["en-GB"];
  return dictionaries["tr-TR"];
}

/**
 * Belirli bir anahtar yolunu (`nav.dashboard` gibi) döner. Sunucu
 * tarafında doğrudan erişim için tip güvenli yardımcı.
 * @param labels
 * @param key
 */
export function label<L extends Labels, K extends keyof L>(
  labels: L,
  key: K,
): L[K] {
  // Anahtar generic `keyof L` ile derleme zamanında sınırlandırılmıştır.
  // eslint-disable-next-line security/detect-object-injection
  return labels[key];
}
