/**
 * @file [locale] global-error boundary testleri.
 * @module @vetniva/web/app/[locale]/global-error.test
 * @description GOAL-101 (FAZ-10) frontend hata yakalama — global
 * error sınırının en kötü durumda bile çalıştığını ve reporter'a
 * bildirim gönderdiğini doğrular.
 * @since GOAL-101 (FAZ-10) frontend hata yakalama core
 */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/error-reporter", () => ({
  errorReporter: {
    captureError: vi.fn(),
    captureMessage: vi.fn(),
    pendingCount: () => 0,
  },
}));

import { errorReporter } from "@/lib/error-reporter";

import GlobalError from "./global-error";

describe("GlobalError", () => {
  const sampleError = Object.assign(new Error("fatal"), {
    digest: "fatal-digest-1",
  });

  it("kendi html+body elementlerini render eder", () => {
    const { getByTestId, getByRole } = render(
      <GlobalError error={sampleError} reset={() => undefined} />,
    );
    expect(getByRole("alert")).toBeInTheDocument();
    expect(getByTestId("global-error-boundary")).toBeInTheDocument();
    expect(getByTestId("global-error-correlation").textContent).toContain(
      "fatal-digest-1",
    );
  });

  it("mount olduğunda errorReporter.captureError çağrılır", () => {
    // Modül mock'unun spy işlevi burada doğrudan doğrulanır.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const captureError = vi.mocked(errorReporter.captureError);
    captureError.mockClear();
    render(<GlobalError error={sampleError} reset={() => undefined} />);
    expect(captureError).toHaveBeenCalledTimes(1);
    const [, ctxArg] = captureError.mock.calls[0]!;
    expect(ctxArg).toMatchObject({
      source: "next-global-error-boundary",
      digest: "fatal-digest-1",
    });
  });

  it("reset butonu tıklanınca reset çağrılır", () => {
    const reset = vi.fn();
    const { getByRole } = render(
      <GlobalError error={sampleError} reset={reset} />,
    );
    fireEvent.click(getByRole("button", { name: /Tekrar dene/ }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("digest yoksa correlation bloğu gizlenir", () => {
    const errNoDigest = new Error("fatal no digest");
    const { queryByTestId } = render(
      <GlobalError
        error={errNoDigest as Error & { digest?: string }}
        reset={() => undefined}
      />,
    );
    expect(queryByTestId("global-error-correlation")).toBeNull();
  });
});
