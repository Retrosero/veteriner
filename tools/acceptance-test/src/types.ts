/**
 * @file Pilot kabul (UAT) testi temel tipleri.
 * @module @vetniva/acceptance-test/types
 *
 * @description GOAL-121 (FAZ-12) pilot kabul testleri icin
 * ortak tip sozlesmesi. 10 uctan uca pilot senaryosunun
 * tanimi, adimlari, sonuclari, kullanici geri bildirimi ve
 * toplu rapor veri modelini icerir.
 *
 * Notlar:
 *  - Pilot senaryolari yuk testi degildir; sirali ve tek
 *    kullanici (pilot veteriner) bakis acisindan calisir.
 *  - Sure (durationMs) ve hata (error) otomatik kaydedilir.
 *  - Kullanici yorumu, gereksiz adim ve gelistirme istegi
 *    geri bildirim kanali uzerinden eklenir (feedback.ts).
 *  - Tenant izolasyonu, audit ve PII kurallarina uyulur.
 *
 * @since GOAL-121 (FAZ-12) pilot kabul testleri
 */

/** 10 pilot senaryosu. */
export type UatScenarioKey =
  | "new_owner_patient"
  | "appointment"
  | "examination"
  | "vaccination"
  | "petshop_sale"
  | "collection"
  | "surgery"
  | "hospitalization"
  | "laboratory"
  | "portal";

/** HTTP metodu. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** UAT adımını çalıştıran kullanıcı rolü. */
export type UatActorRole =
  "OWNER" | "VETERINARIAN" | "STAFF" | "PET_OWNER_PORTAL";

/**
 * Tek bir pilot adimi. Pilot kullanicinin UI'da tikladigi
 * aksiyona karsilik gelen API cagrisi.
 */
export interface UatStep {
  /** Adim anahtari (kisa, snake_case). */
  name: string;
  /** Insan okur aciklama (UI'daki adim etiketi). */
  label: string;
  /** HTTP metodu. */
  method: HttpMethod;
  /** Senaryo varsayılanından farklı rol gerektiren adım. */
  actorRole?: UatActorRole;
  /**
   * API yolu (placeholder'larla). Ornek:
   *   "/api/v1/owners/{ownerId}/patients"
   * Runner placeholder'lari onceki adim sonuclarindan cozer.
   */
  path: string;
  /**
   * Adim icin gerekli muhendislik notu. Ornek: "ownerId
   * onceki adimdan alinir". UI'da pilot kullanicinin
   * gordugu yonergeler burada TUTULMAZ (label yeterli).
   */
  note?: string;
  /** Body (sadece POST/PUT/PATCH icin). */
  body?: unknown;
  /**
   * Beklenen HTTP status. Tekil sayi veya aralik destegi.
   * Ornek: 201 (POST), 200 (GET/PUT/PATCH/DELETE),
   * [200, 201] (PATCH'te bazen 200 bazen 201).
   */
  expectStatus: number | ReadonlyArray<number>;
  /**
   * Response body'sinde beklenen JSON alani (nokta notasyonu).
   * Ornek: "id" veya "patient.id". Bos/null ise kontrol
   * yapilmaz; dolu ise degerin truthy olmasi beklenir.
   */
  expectField?: string;
  /**
   * Adim geri bildiriminde pilot kullanicinin
   * "gereksiz adim" olarak isaretleyebilecegi ipucu.
   * True ise UI raporunda "gereksiz adim" filtresinde one
   * cikar; bos ise yorumu kullanici doldurur.
   */
  unnecessaryHint?: boolean;
}

/**
 * Pilot kullanicinin bir adim hakkindaki serbest yorumu.
 * Disaridan (UI veya CLI prompt) eklenir; rapor uretiminde
 * kullanilir.
 */
export interface UatFeedback {
  /** Pilot kullanicinin ad soyad veya kisa rumuzu. */
  reviewer: string;
  /**
   * Adim icin yorum. Bos olabilir (sadece puan verilebilir).
   * Serbest Turkce metin; PII icermemeli (TCKN/telefon/email).
   */
  comment: string;
  /**
   * Deneyim puani (1-5). 1 = cok kotu, 5 = cok iyi.
   * 0/undefined = puan verilmemis.
   */
  rating: 1 | 2 | 3 | 4 | 5 | 0;
  /**
   * Adim pilot kullanicinin isine yaramadiysa true; UI
   * "gereksiz adim" listesinde one cikarir.
   */
  unnecessary: boolean;
  /**
   * ISO 8601 zaman damgasi (geri bildirim zamani).
   */
  occurredAt: string;
}

/**
 * Pilot senaryo tanimi. 10 senaryo icin sabit katalog.
 */
export interface UatScenarioConfig {
  /** Senaryo anahtari. */
  key: UatScenarioKey;
  /** Insan okur baslik. */
  title: string;
  /** Aciklama (pilot kullanicinin yapacagi is). */
  description: string;
  /**
   * Modul anahtari (cross-module raporlama icin). Ornek:
   * "owner", "appointment", "examination". ErrorEvents
   * moduleFromRoute ile ayni kavrami paylasir.
   */
  module: string;
  /**
   * Pilot kullanicinin tipik rolu. Ornek: OWNER (tek
   * klinik sahibi) veya VETERINARIAN.
   */
  actorRole: UatActorRole;
  /** Adim sirasi. */
  steps: ReadonlyArray<UatStep>;
  /**
   * Onem derecesi (1 = en kritik, 3 = yardimci). Pilot
   * oncesi doldurulmasi zorunlu olan senaryolar 1.
   */
  priority: 1 | 2 | 3;
}

/**
 * Tek bir adim sonucu (calisma zamaninda olusturulur).
 */
export interface UatStepResult {
  /** Hangi adim (UatStep.name). */
  name: string;
  /** HTTP status. */
  status: number;
  /** Adim suresi (ms). */
  durationMs: number;
  /** Hata varsa mesaj. */
  error: string | null;
  /** Response body'den cozulen placeholder degerleri. */
  extracted: Record<string, string>;
  /** Pilot geri bildirimi (varsa). */
  feedback: UatFeedback | null;
  /**
   * Adim basarili mi (status beklenen listede ve hata yok).
   */
  passed: boolean;
  /**
   * Response body'sinden beklenen alan truthy mi (sadece
   * expectField tanimliysa kontrol edilir).
   */
  fieldFound: boolean | null;
}

/**
 * Tek bir senaryo sonucu (calisma zamaninda olusturulur).
 */
export interface UatScenarioResult {
  scenario: UatScenarioKey;
  title: string;
  module: string;
  startedAt: string;
  finishedAt: string;
  totalDurationMs: number;
  steps: ReadonlyArray<UatStepResult>;
  /**
   * Tum adimlar gecti mi (passed && fieldFound alanlari
   * tanimliysa onun da truthy olmasi).
   */
  allPassed: boolean;
  passedCount: number;
  failedCount: number;
  /**
   * Pilot kullanicinin "gereksiz adim" isaretledigi
   * adim sayisi. Rapor ozetinde one cikar.
   */
  unnecessaryCount: number;
  /**
   * Pilot kullanicinin ortalama puani (1-5). 0 = hic
   * puan verilmemis.
   */
  averageRating: number;
}

/**
 * Tum senaryolarin toplu calistirma sonucu.
 */
export interface UatRunResult {
  /** Calistirilma zamani (ISO). */
  runAt: string;
  /** Operator (calistiran kisi/sistem). */
  operator: string;
  /** API base URL. */
  baseUrl: string;
  /** Tenant id (coklu tenant pilot calistirmasinda kullanilir). */
  tenantId: string | null;
  /** Senaryo sonuclari. */
  scenarios: ReadonlyArray<UatScenarioResult>;
  /** Genel gecme durumu. */
  allPassed: boolean;
  passedCount: number;
  failedCount: number;
  totalSteps: number;
  totalFailedSteps: number;
  /**
   * Pilot kullanicinin isaretledigi toplam gereksiz
   * adim sayisi (geri bildirim kanali uzerinden).
   */
  totalUnnecessary: number;
  /**
   * Pilot kullanicinin ortalama genel puani (1-5; 0 = yok).
   */
  averageRating: number;
}

/**
 * Adim sonucundan onceki adimlarin extracted'ina bakarak
 * placeholder cozen runner icin minimal yardimci tip.
 * Disa acik degil; sadece type signature'da kullanilir.
 */
export interface PlaceholderContext {
  extracted: Record<string, string>;
}
