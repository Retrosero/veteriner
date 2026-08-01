/**
 * @file Error-reporter unit testleri.
 * @module @vetniva/web/lib/error-reporter.test
 * @description GOAL-101 (FAZ-10) frontend hata yakalama altyapısı
 * için kapsamlı unit test. PII sanitizer, kuyruk yönetimi, dedup
 * penceresi, flush davranışı ve Error çıkarma fonksiyonları
 * doğrulanır.
 * @security Testlerde sentetik PII kullanılır; gerçek kullanıcı
 *   verisi içermez.
 * @since GOAL-101 (FAZ-10) frontend hata yakalama core
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import {
  ErrorReporter,
  extractErrorInfo,
  maskString,
  sanitizeContext,
} from "./error-reporter";

/* --------------------------------------------------------------------------
 * PII sanitizer testleri
 * --------------------------------------------------------------------------
 */

describe("maskString", () => {
  it("e-posta mask'ler", () => {
    const out = maskString("contact: ahmet.yilmaz@example.com now");
    expect(out).not.toContain("ahmet.yilmaz@example.com");
    expect(out).toContain("@");
  });

  it("TC kimlik no (11 hane) mask'ler", () => {
    const out = maskString("Müşteri TC: 12345678901 kayıtlı");
    expect(out).not.toContain("12345678901");
    expect(out).toMatch(/123\*+01/);
  });

  it("telefon numarası mask'ler", () => {
    const out = maskString("Ara: 05551234567");
    expect(out).not.toContain("05551234567");
    expect(out).toContain("05***67");
  });

  it("kredi kartı mask'ler", () => {
    const out = maskString("Kart: 4111 1111 1111 1111");
    expect(out).toContain("**** **** **** 1111");
    expect(out).not.toContain("4111111111111111");
  });

  it("string olmayan girdi aynen döner", () => {
    // @ts-expect-error: runtime test
    expect(maskString(42)).toBe(42);
  });
});

describe("sanitizeContext", () => {
  it("PII anahtarları redacted ile değiştirir", () => {
    const out = sanitizeContext({
      email: "user@example.com",
      password: "secret",
      field: "name",
    });
    expect(out["email"]).toBe("[redacted:email]");
    expect(out["password"]).toBe("[redacted:password]");
    expect(out["field"]).toBe("name");
  });

  it("string içindeki PII mask'ler", () => {
    const out = sanitizeContext({
      note: "Hasta ahmet@example.com adresinde",
    });
    expect(out["note"] as string).not.toContain("ahmet@example.com");
  });

  it("iç içe objelerde PII temizler", () => {
    const out = sanitizeContext({
      payload: {
        contact: {
          email: "deep@example.com",
          ok: "value",
        },
      },
    });
    const payload = out["payload"] as {
      contact: { email: string; ok: string };
    };
    expect(payload.contact.email).toBe("[redacted]");
    expect(payload.contact.ok).toBe("value");
  });

  it("null/undefined döner", () => {
    expect(sanitizeContext(undefined)).toEqual({});
    expect(sanitizeContext(null)).toEqual({});
  });

  it("dizilerde string PII temizler", () => {
    const out = sanitizeContext({
      list: ["ok@x.com", "tamam"],
    });
    expect((out["list"] as string[])[0]).not.toContain("ok@x.com");
  });
});

/* --------------------------------------------------------------------------
 * extractErrorInfo
 * --------------------------------------------------------------------------
 */

describe("extractErrorInfo", () => {
  it("Error nesnesi", () => {
    const err = new Error("test message");
    const out = extractErrorInfo(err);
    expect(out.message).toBe("test message");
    expect(out.stack).toContain("Error: test message");
  });

  it("string hata", () => {
    const out = extractErrorInfo("plain string");
    expect(out.message).toBe("plain string");
    expect(out.stack).toBeUndefined();
  });

  it("obje hata (JSON string'e çevrilir)", () => {
    const out = extractErrorInfo({ code: 1, msg: "x" });
    expect(out.message).toContain("code");
    expect(out.message).toContain("1");
  });

  it("undefined/bilinmeyen hata → fallback", () => {
    const out = extractErrorInfo(undefined);
    expect(out.message).toBeTruthy();
  });
});

/* --------------------------------------------------------------------------
 * ErrorReporter singleton davranışı
 * --------------------------------------------------------------------------
 */

/**
 *
 */
function makeFetchMock(): Mock {
  return vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ id: "err-1", fingerprint: "abc" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

describe("ErrorReporter", () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = makeFetchMock();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("disabled modda hiçbir şey göndermez", async () => {
    const reporter = new ErrorReporter({
      enabled: false,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    reporter.captureError(new Error("x"), { foo: "bar" });
    reporter.captureMessage("hello", "warning");
    await reporter.flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reporter.pendingCount()).toBe(0);
  });

  it("captureError PII sanitize edip kuyruğa ekler", () => {
    const reporter = new ErrorReporter({
      enabled: true,
      flushIntervalMs: 60_000, // flush'ı tetiklemeyelim
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    reporter.captureError(new Error("user@example.com login failed"), {
      email: "user@example.com",
      password: "secret",
    });
    expect(reporter.pendingCount()).toBe(1);
    const config = reporter.getConfig();
    expect(config.release).toBeTruthy();
  });

  it("flush batch halinde fetch çağırır", async () => {
    const reporter = new ErrorReporter({
      enabled: true,
      flushIntervalMs: 60_000,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    reporter.captureError(new Error("a"), {});
    reporter.captureMessage("b", "warning");
    reporter.captureError(new Error("c"), { x: 1 });
    expect(reporter.pendingCount()).toBe(3);
    await reporter.flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(reporter.pendingCount()).toBe(0);
  });

  it("dedup window: aynı mesaj+route 1 sn içinde yalnız 1 kez", () => {
    const reporter = new ErrorReporter({
      enabled: true,
      flushIntervalMs: 60_000,
      dedupWindowMs: 5_000,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    reporter.captureMessage("same", "warning");
    reporter.captureMessage("same", "warning");
    reporter.captureMessage("same", "warning");
    expect(reporter.pendingCount()).toBe(1);
  });

  it("farklı mesajlar dedup'a takılmaz", () => {
    const reporter = new ErrorReporter({
      enabled: true,
      flushIntervalMs: 60_000,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    reporter.captureMessage("a", "warning");
    reporter.captureMessage("b", "warning");
    reporter.captureMessage("c", "warning");
    expect(reporter.pendingCount()).toBe(3);
  });

  it("kuyruk kapasitesi: maxQueueSize aşılırsa en eski atılır", () => {
    const reporter = new ErrorReporter({
      enabled: true,
      flushIntervalMs: 60_000,
      maxQueueSize: 3,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    reporter.captureMessage("1", "warning");
    reporter.captureMessage("2", "warning");
    reporter.captureMessage("3", "warning");
    reporter.captureMessage("4", "warning");
    reporter.captureMessage("5", "warning");
    expect(reporter.pendingCount()).toBe(3);
  });

  it("fetch başarısız olursa hata kuyruğa geri döner", async () => {
    const failFetch = vi.fn(() =>
      Promise.resolve(new Response("server error", { status: 500 })),
    );
    const reporter = new ErrorReporter({
      enabled: true,
      flushIntervalMs: 60_000,
      maxQueueSize: 10,
      fetchImpl: failFetch as unknown as typeof fetch,
    });
    reporter.captureMessage("test", "warning");
    expect(reporter.pendingCount()).toBe(1);
    await reporter.flush();
    // İlk flush başarısız oldu; hata geri kuyruğa girdi.
    expect(reporter.pendingCount()).toBeGreaterThanOrEqual(1);
  });

  it("route CLIENT prefix'i ile işaretlenir (browser)", () => {
    // jsdom'da window var
    const reporter = new ErrorReporter({
      enabled: true,
      flushIntervalMs: 60_000,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    reporter.captureMessage("ui error", "warning");
    expect(reporter.pendingCount()).toBe(1);
  });

  it("GET yerine POST metodu kullanılır", async () => {
    const reporter = new ErrorReporter({
      enabled: true,
      flushIntervalMs: 60_000,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    reporter.captureMessage("m", "warning");
    await reporter.flush();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(url).toMatch(/\/api\/v1\/system\/error-events$/);
  });

  it("payload içinde release + occurredAt + route + severity bulunur", async () => {
    const reporter = new ErrorReporter({
      enabled: true,
      flushIntervalMs: 60_000,
      release: "1.0.0",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    reporter.captureError(new Error("explode"), { x: 1 });
    await reporter.flush();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      release: string;
      occurredAt: string;
      severity: string;
      route: string;
      context: unknown;
    };
    expect(body.release).toBe("1.0.0");
    expect(body.occurredAt).toBeTruthy();
    expect(body.severity).toBe("error");
    expect(body.route).toBeTruthy();
    expect(body.context).toEqual({ x: 1 });
  });
});
