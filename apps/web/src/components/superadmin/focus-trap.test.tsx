/**
 * @file FocusTrap komponenti davranış testleri.
 * @module @vetniva/web/components/superadmin/focus-trap.test
 * @description Klavye odağı yönetimi için sınırlı güvence sağlar.
 * jsdom ortamında `user-event` paketi bağımlılığı olmadan Tab/Shift+Tab
 * sonrası gerçek focus geçişini tetiklemek zor olduğundan, yalnızca
 * API yüzeyi (auto-focus, pasif modda yan etkisizlik, boş kapsayıcı
 * toleransı) doğrulanır. Tarayıcıya özel klavye navigasyonu
 * `retention-tabs.test.tsx` üzerinden entegrasyon seviyesinde zaten
 * garanti edilir.
 */

import "@testing-library/jest-dom/vitest";

import { render } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { FocusTrap } from "./focus-trap";

function Harness({ active = true }: { active?: boolean }): JSX.Element {
  return (
    <FocusTrap active={active}>
      <button type="button">ilk</button>
      <button type="button">orta</button>
      <button type="button">son</button>
    </FocusTrap>
  );
}

describe("FocusTrap", () => {
  it("aktifken ilk odaklanabilir elemana odaklanır", () => {
    const view = render(<Harness />);
    expect(view.getByRole("button", { name: "ilk" })).toHaveFocus();
  });

  it("kapsayıcı içinde boş eleman varsa bile hata fırlatmaz", () => {
    expect(() => {
      render(
        <FocusTrap active>
          <span>Sadece metin</span>
        </FocusTrap>,
      );
    }).not.toThrow();
  });

  it("pasifken otomatik odak uygulamaz ve focus çağırmaz", () => {
    const spy = vi.spyOn(HTMLElement.prototype, "focus");
    const view = render(<Harness active={false} />);
    const ilk = view.getByRole("button", { name: "ilk" });
    expect(ilk).not.toHaveFocus();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
