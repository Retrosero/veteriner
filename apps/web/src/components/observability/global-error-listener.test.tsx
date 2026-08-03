/**
 * @file Tarayıcı genel hata dinleyicisi testleri.
 * @module @vetniva/web/components/observability/global-error-listener.test
 * @description React hata sınırları dışında kalan hata kanallarının merkezi
 * raporlayıcıya yönlendirildiğini ve unmount sonrası dinleyicilerin
 * kaldırıldığını doğrular.
 * @security Gerçek kullanıcı verisi yerine sentetik hata metinleri kullanılır.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GlobalErrorListener } from "./global-error-listener";

const { captureError } = vi.hoisted(() => ({ captureError: vi.fn() }));

vi.mock("@/lib/error-reporter", () => ({
  errorReporter: { captureError },
}));

afterEach(() => {
  cleanup();
  captureError.mockReset();
});

describe("GlobalErrorListener", () => {
  it("yakalanmamış tarayıcı hatasını raporlar", () => {
    render(<GlobalErrorListener />);

    const error = new Error("Beklenmeyen ekran hatası");
    window.dispatchEvent(
      new ErrorEvent("error", {
        error,
        filename: "https://vetniva.test/page.js",
        lineno: 12,
        colno: 5,
      }),
    );

    expect(captureError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        source: "window.error",
        line: 12,
        column: 5,
      }),
    );
  });

  it("yakalanmamış Promise reddini raporlar", () => {
    render(<GlobalErrorListener />);

    const reason = new Error("Arka plan isteği reddedildi");
    const event = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.defineProperty(event, "reason", { value: reason });
    window.dispatchEvent(event);

    expect(captureError).toHaveBeenCalledWith(
      reason,
      expect.objectContaining({ source: "window.unhandledrejection" }),
    );
  });

  it("unmount sonrasında dinleyicileri kaldırır", () => {
    const view = render(<GlobalErrorListener />);
    view.unmount();

    window.dispatchEvent(new Event("error"));
    expect(captureError).not.toHaveBeenCalled();
  });
});
