/**
 * @file [locale] error boundary testleri.
 * @module @vetniva/web/app/[locale]/error.test
 *
 * @description GOAL-101 (FAZ-10) frontend hata yakalama — error
 * sınırının kullanıcıya doğru geri bildirim verdiğini ve reporter'a
 * bildirim gönderdiğini doğrular.
 *
 * @since GOAL-101 (FAZ-10) frontend hata yakalama core
 */

import "@testing-library/jest-dom/vitest";

import React from "react";
import { describe, expect, it, vi } from "vitest";

import { fireEvent, render } from "@testing-library/react";

vi.mock("@/lib/error-reporter", () => ({
  errorReporter: {
    captureError: vi.fn(),
    captureMessage: vi.fn(),
    pendingCount: () => 0,
  },
}));

import { errorReporter } from "@/lib/error-reporter";
import LocaleErrorBoundary from "./error";

describe("LocaleErrorBoundary", () => {
  const sampleError = Object.assign(new Error("explode"), {
    digest: "err-digest-1",
  });

  it("hata mesajı + correlation ID render edilir", () => {
    const { getByTestId, getByRole, getByText } = render(
      <LocaleErrorBoundary
        error={sampleError}
        reset={() => undefined}
      />,
    );

    expect(getByRole("alert")).toBeInTheDocument();
    expect(getByText(/Beklenmeyen bir hata oluştu/)).toBeInTheDocument();
    expect(getByTestId("error-correlation").textContent).toContain(
      "err-digest-1",
    );
  });

  it("mount olduğunda errorReporter.captureError çağrılır", () => {
    const captureError = vi.mocked(errorReporter.captureError);
    captureError.mockClear();
    render(
      <LocaleErrorBoundary
        error={sampleError}
        reset={() => undefined}
      />,
    );
    expect(captureError).toHaveBeenCalledTimes(1);
    const [errArg, ctxArg] = captureError.mock.calls[0]!;
    expect(errArg).toBe(sampleError);
    expect(ctxArg).toMatchObject({
      source: "next-error-boundary",
      digest: "err-digest-1",
    });
  });

  it("tekrar dene butonu reset fonksiyonunu çağırır", () => {
    const reset = vi.fn();
    const { getByRole } = render(
      <LocaleErrorBoundary error={sampleError} reset={reset} />,
    );
    fireEvent.click(getByRole("button", { name: /Tekrar dene/ }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("digest yoksa correlation bloğu gizlenir", () => {
    const errNoDigest = new Error("no digest");
    const { queryByTestId } = render(
      <LocaleErrorBoundary
        error={errNoDigest as Error & { digest?: string }}
        reset={() => undefined}
      />,
    );
    expect(queryByTestId("error-correlation")).toBeNull();
  });
});
