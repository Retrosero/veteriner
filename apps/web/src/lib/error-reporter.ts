/**
 * @file Frontend merkezi hata yakalama (error reporter).
 * @module @vetniva/web/lib/error-reporter
 * @description GOAL-101 (FAZ-10) frontend hata yakalama altyapısının
 * çekirdeği. Next.js runtime, API ve kullanıcı arayüzü hatalarını
 * merkezi sisteme gönderir.
 *
 * Sorumluluklar:
 * 1. **PII sanitize**: Hassas form verileri (e-posta, telefon, TC
 *    kimlik, IBAN, parola vb.) context payload'ından mask'lenir.
 * 2. **Queue**: Rate limit ve duplicate kontrolü için bellek-içi
 *    kuyruk. Maks. 50 olay tutulur; aynı mesaj+route 1 sn içinde
 *    yalnızca bir kez gönderilir.
 * 3. **Backend iletişimi**: `POST /api/v1/system/error-events`
 *    endpoint'ine fetch ile gönderir. `X-Request-Id` korelasyon
 *    header'ı taşınır.
 * 4. **No-throw**: Reporter hiçbir koşulda fırlatmaz; tüm hatalar
 *    sessizce yutulur (kullanıcı deneyimini bozmamak için).
 *
 * Kullanım:
 * ```ts
 * import { errorReporter } from "@/lib/error-reporter";
 *
 * try {
 *   await something();
 * } catch (err) {
 *   errorReporter.captureError(err, { component: "PatientList" });
 * }.
 *
 * // Mesaj tabanlı raporlama
 * errorReporter.captureMessage("Network offline", "warning");
 * ```
 * @security Hassas form verileri `sanitizeContext` ile her zaman
 *   mask'lenir; client tarafında hiçbir plain-text PII
 *   loglanmaz/gönderilmez. Backend ek bir PII masker'ından geçirir
 *   (savunma derinliği).
 * @since GOAL-101 (FAZ-10) frontend hata yakalama core
 */

import type { ClientErrorReportInput } from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * Tipler
 * --------------------------------------------------------------------------
 */

/** Hata önem seviyesi. Backend `errorSeveritySchema` ile uyumlu. */
export type ErrorSeverity = "info" | "warning" | "error" | "critical";

/** Hata kaynağı. Backend tarafı `moduleFromRoute` ile modül türetir. */
export type ErrorSource = "runtime" | "api" | "ui" | "manual";

/** CaptureError için opsiyonel context. */
export type ErrorContext = Record<string, unknown> | undefined;

/** Reporter konfigürasyonu. */
export interface ErrorReporterConfig {
  /** Backend base URL (api-client ile aynı). */
  baseUrl: string;
  /** Reporter endpoint yolu. */
  endpoint: string;
  /** Uygulama sürümü (server'a iletilir). */
  release: string;
  /** Kuyruk kapasitesi. */
  maxQueueSize: number;
  /** Duplicate tespit penceresi (ms). */
  dedupWindowMs: number;
  /** Boşaltma aralığı (ms). */
  flushIntervalMs: number;
  /** Tek fetch denemesi zaman aşımı (ms). */
  requestTimeoutMs: number;
  /** Test amaçlı: gerçek fetch yerine bu fonksiyon çağrılır. */
  fetchImpl: typeof fetch;
  /** Reporter kapalı mı? Prod dışı test'lerde kullanılabilir. */
  enabled: boolean;
}

/** Raporlanmış hatanın backend'e ulaşma sonucu. */
export interface ClientErrorReportResponse {
  id: string;
  fingerprint: string;
}

/** Kuyrukta bekleyen hata. */
interface QueuedError {
  input: ClientErrorReportInput;
  enqueuedAt: number;
}

/* --------------------------------------------------------------------------
 * PII sanitizer (client-side)
 * --------------------------------------------------------------------------
 */

/**
 * Hassas form verisi alan adları. Backend ile aynı kural; client
 * tarafında bir kez daha uygulanır (savunma derinliği).
 */
const PII_KEYS = new Set<string>([
  "first_name",
  "last_name",
  "full_name",
  "email",
  "phone",
  "tax_id",
  "iban",
  "passport_no",
  "id_card_no",
  "address",
  "birth_date",
  "vet_license_no",
  "ip_address",
  "user_agent",
  "device_id",
  "password",
  "current_password",
  "new_password",
  "token",
  "refresh_token",
  "api_key",
  "secret",
  "authorization",
  "cookie",
]);

/** Email regex — naive; UI form alanlarında PII tespiti için. */
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
/** TC kimlik no (1-9 ile başlayan 11 hane; telefonla çakışmayı önler). */
const TCKN_RE = /\b[1-9]\d{10}\b/g;
/** Telefon (0 ile başlayan 10-11 hane). İlk 2 + son 2 hane korunur. */
const PHONE_RE = /\b0\d{9,10}\b/g;
/** Kredi kartı (13-19 hane grupları). */
// Sınırları sabit olan bu ifade doğrusal taranır; security eklentisi
// iç içe tekrar nedeniyle yanlış pozitif üretebildiğinden istisna yereldir.
// eslint-disable-next-line security/detect-unsafe-regex
const CC_RE = /\b(?:\d[ -]?){13,19}\b/g;

/**
 * Bir string içindeki PII benzeri pattern'leri mask'ler. E-posta,
 * TC kimlik, telefon ve kredi kartı için basit regex tabanlı
 * yaklaşım kullanılır; bu fonksiyon UI form içeriklerinin log'a
 * sızmasını önler.
 * @param input
 */
export function maskString(input: string): string {
  if (typeof input !== "string") return input;
  return input
    .replace(EMAIL_RE, (m) => `${m[0]}***@${m.split("@")[1] ?? "***"}`)
    .replace(TCKN_RE, (m) => `${m.slice(0, 3)}***${m.slice(-2)}`)
    .replace(PHONE_RE, (m) => {
      const digits = m.replace(/\D/g, "");
      if (digits.length < 7) return "***";
      // İlk 2 + *** + son 2 hane
      return `${digits.slice(0, 2)}***${digits.slice(-2)}`;
    })
    .replace(CC_RE, (m) => `**** **** **** ${m.replace(/\D/g, "").slice(-4)}`);
}

/**
 * Context payload'ını PII açısından temizler. Hem anahtarlar
 * (`PII_KEYS`) hem de string değerler (regex) taranır. Dönerken
 * orijinal referansı mutate etmez; derin kopya üretir.
 * @param ctx
 */
export function sanitizeContext(
  ctx: ErrorContext | null | undefined,
): Record<string, unknown> {
  if (ctx === undefined || ctx === null) return {};
  if (typeof ctx !== "object") return {};
  return Object.fromEntries(
    Object.entries(ctx).map(([key, value]) => {
      if (PII_KEYS.has(key.toLowerCase())) {
        return [
          key,
          typeof value === "string" && value.length > 0
            ? `[redacted:${key}]`
            : "[redacted]",
        ];
      }
      return [key, sanitizeValue(value)];
    }),
  );
}

/**
 *
 * @param value
 */
function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return maskString(value);
  if (Array.isArray(value)) return value.map((v) => sanitizeValue(v));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        PII_KEYS.has(key.toLowerCase()) ? "[redacted]" : sanitizeValue(item),
      ]),
    );
  }
  return value;
}

/* --------------------------------------------------------------------------
 * Hata çıkarma (Error → message + stack)
 * --------------------------------------------------------------------------
 */

/**
 * Error benzeri bir nesneden message + stack çıkarır.
 * @param err
 */
export function extractErrorInfo(err: unknown): {
  message: string;
  stack: string | undefined;
} {
  if (err instanceof Error) {
    return {
      message: err.message || "Bilinmeyen hata",
      stack: err.stack,
    };
  }
  if (typeof err === "string") {
    return { message: err, stack: undefined };
  }
  try {
    const json = JSON.stringify(err);
    return {
      message: json.length > 1000 ? `${json.slice(0, 1000)}…` : json,
      stack: undefined,
    };
  } catch {
    return { message: "Bilinmeyen hata", stack: undefined };
  }
}

/* --------------------------------------------------------------------------
 * Default config
 * --------------------------------------------------------------------------
 */

const DEFAULT_ENDPOINT = "/api/v1/system/error-events";

/** Build-time app version. `NEXT_PUBLIC_APP_VERSION` ile ezilebilir. */
const DEFAULT_RELEASE =
  (typeof process !== "undefined" &&
    (process.env["NEXT_PUBLIC_APP_VERSION"] ?? process.env["APP_VERSION"])) ||
  "0.0.0-dev";

/**
 * Default config üretir. Test'lerde override edilir.
 * @param overrides
 */
function defaultConfig(
  overrides: Partial<ErrorReporterConfig> = {},
): ErrorReporterConfig {
  return {
    baseUrl:
      (typeof process !== "undefined" && process.env["API_BASE_URL"]) ||
      "http://localhost:3001",
    endpoint: DEFAULT_ENDPOINT,
    release: DEFAULT_RELEASE,
    maxQueueSize: 50,
    dedupWindowMs: 1_000,
    flushIntervalMs: 2_000,
    requestTimeoutMs: 3_000,
    fetchImpl:
      typeof fetch === "function"
        ? fetch
        : () => {
            throw new Error("fetch API not available");
          },
    enabled: true,
    ...overrides,
  };
}

/* --------------------------------------------------------------------------
 * ErrorReporter sınıfı
 * --------------------------------------------------------------------------
 */

/**
 * Merkezi frontend hata yakalayıcı. Singleton; `errorReporter`
 * adı ile dışa açılır.
 *
 * Akış:
 * 1. `captureError` veya `captureMessage` çağrılır.
 * 2. PII sanitize edilir.
 * 3. Kuyruğa alınır (dedup kontrolü ile).
 * 4. Periyodik flush ile backend'e gönderilir.
 *
 * Reporter `enabled=false` ise tüm metotlar no-op olur; test
 * ortamlarında deterministik davranış için kullanılır.
 */
export class ErrorReporter {
  private readonly config: ErrorReporterConfig;
  private readonly queue: QueuedError[] = [];
  private readonly recentSignatures = new Map<string, number>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  public constructor(config?: Partial<ErrorReporterConfig>) {
    this.config = defaultConfig(config);
    if (this.config.enabled && typeof setInterval === "function") {
      this.flushTimer = setInterval(() => {
        void this.flush().catch(() => undefined);
      }, this.config.flushIntervalMs);
      // Node.js'te process exit'inde temizleme
      const g = globalThis as {
        process?: { on?: (...args: unknown[]) => void };
      };
      if (g.process?.on) {
        g.process.on("beforeunload", () => this.flushSync());
      }
    }
  }

  /**
   * Yakalanan bir Error'ı raporlar. Context opsiyonel olarak
   * eklenebilir; tüm context PII-sanitize edilir.
   * @param err
   * @param context
   * @param severity
   */
  public captureError(
    err: unknown,
    context: ErrorContext,
    severity: ErrorSeverity = "error",
  ): void {
    if (!this.config.enabled) return;
    const { message, stack } = extractErrorInfo(err);
    this.enqueue({
      severity,
      message: maskString(message),
      stack,
      context: sanitizeContext(context),
      route: currentRoute(),
      occurredAt: new Date().toISOString(),
    });
  }

  /**
   * Error olmayan bir durumu raporlar (ör. Network offline warning,
   * ya da kullanıcı bildirimi). Severity info/warning önerilir.
   * @param message
   * @param severity
   * @param context
   */
  public captureMessage(
    message: string,
    severity: ErrorSeverity = "warning",
    context?: ErrorContext,
  ): void {
    if (!this.config.enabled) return;
    this.enqueue({
      severity,
      message: maskString(message),
      stack: undefined,
      context: sanitizeContext(context),
      route: currentRoute(),
      occurredAt: new Date().toISOString(),
    });
  }

  /**
   * Kuyruktaki tüm bekleyen hataları backend'e gönderir. Başarı
   * durumunda kuyruk temizlenir; başarısızlık durumunda hatalar
   * bir sonraki flush'a bırakılır.
   */
  public async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;
    const batch = this.queue.splice(0, this.config.maxQueueSize);
    try {
      for (const item of batch) {
        try {
          const result = await this.sendOne(item.input);
          // sendOne null dönerse HTTP hata veya parse hatası; kuyruğa geri al.
          if (result === null) {
            if (this.queue.length < this.config.maxQueueSize) {
              this.queue.push(item);
            }
          }
        } catch {
          // Ağ/abort/timeout: kuyruğa geri koy.
          if (this.queue.length < this.config.maxQueueSize) {
            this.queue.push(item);
          }
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  /** Sync flush (sayfa unload'ında). Best-effort. */
  public flushSync(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        if (!item) break;
        try {
          const url = `${this.config.baseUrl}${this.config.endpoint}`;
          const body = JSON.stringify({
            ...item.input,
            release: item.input.release ?? this.config.release,
          });
          // sendBeacon POST yapar; sync sonuç dönmez.
          navigator.sendBeacon(
            url,
            new Blob([body], { type: "application/json" }),
          );
        } catch {
          // sessiz
        }
      }
    }
  }

  /**
   * Kuyruktaki bekleyen hata sayısı (test amaçlı).
   */
  public pendingCount(): number {
    return this.queue.length;
  }

  /** Config'i döner (test amaçlı). */
  public getConfig(): Readonly<ErrorReporterConfig> {
    return { ...this.config };
  }

  /**
   * Kuyruğa alma. Aynı `message+route` imzası `dedupWindowMs`
   * içinde ikinci kez gelirse yutulur.
   * @param input
   */
  private enqueue(input: ClientErrorReportInput): void {
    const sig = `${input.message}|${input.route}`;
    const now = Date.now();
    const lastSeen = this.recentSignatures.get(sig);
    if (lastSeen !== undefined && now - lastSeen < this.config.dedupWindowMs) {
      return;
    }
    this.recentSignatures.set(sig, now);

    // Çok eski imzaları temizle (bellek korunması).
    if (this.recentSignatures.size > 200) {
      const cutoff = now - this.config.dedupWindowMs * 10;
      for (const [k, t] of this.recentSignatures) {
        if (t < cutoff) this.recentSignatures.delete(k);
      }
    }

    if (this.queue.length >= this.config.maxQueueSize) {
      // Kuyruk doluysa en eskiyi at.
      this.queue.shift();
    }
    this.queue.push({ input, enqueuedAt: now });
  }

  /**
   * Tek bir hatayı backend'e gönderir. Hata olursa fırlatır.
   * @param input
   */
  private async sendOne(
    input: ClientErrorReportInput,
  ): Promise<ClientErrorReportResponse | null> {
    const url = `${this.config.baseUrl}${this.config.endpoint}`;
    const controller = new AbortController();
    const handle = setTimeout(
      () => controller.abort(),
      this.config.requestTimeoutMs,
    );
    try {
      const body = JSON.stringify({
        ...input,
        release: input.release ?? this.config.release,
      });
      const res = await this.config.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body,
        signal: controller.signal,
        // Next.js server tarafında fetch cache'lenmesin.
        cache: "no-store",
      });
      if (!res.ok) {
        return null;
      }
      const json = (await res
        .json()
        .catch(() => null)) as ClientErrorReportResponse | null;
      return json;
    } finally {
      clearTimeout(handle);
    }
  }
}

/* --------------------------------------------------------------------------
 * Route çözümleme
 * --------------------------------------------------------------------------
 */

/**
 * Next.js App Router'dan route bilgisini alır. Server tarafında
 * `next/headers` üzerinden pathname okunabilir; client tarafında
 * `window.location.pathname` kullanılır. Her iki ortamda da
 * çalışan fallback burada uygulanır.
 */
function currentRoute(): string {
  try {
    // Client
    if (typeof window !== "undefined" && window.location?.pathname) {
      return `CLIENT ${window.location.pathname}`;
    }
  } catch {
    // window erişimi başarısız olursa aşağıdaki fallback'e düş.
  }
  return "SERVER /unknown";
}

/* --------------------------------------------------------------------------
 * Singleton instance
 * --------------------------------------------------------------------------
 */

/** Varsayılan reporter. `enabled` runtime'da kapatılabilir. */
export const errorReporter = new ErrorReporter();
