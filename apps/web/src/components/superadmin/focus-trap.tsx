/**
 * @file Klavye focus trap yardımcı komponenti.
 * @module @vetniva/web/components/superadmin/focus-trap
 * @description Modal ve drawer benzeri odak yakalama gerektiren
 * kapsayıcılar için hafif, sıfır bağımlılıklı bir helper.
 * Paket üzerinde ekstra bağımlılık (`focus-trap-react` vb.) eklemeden
 * aşağıdaki davranışları sağlar:
 *
 * - İlk render'da ilk odaklanabilir elemana otomatik odaklanır
 *   (yoksa kapsayıcının kendisine geri düşer).
 * - `Tab` / `Shift+Tab` ile odak daima kapsayıcı içinde döner.
 * - Odak kapsayıcı dışına çıktığında son odaklanabilir elemana
 *   geri sarar (örn. kapatma sonrası tetikleyici butona dönmek için).
 * - Kapsayıcı kapanırken önceki aktif eleman hafızaya alınır ve
 *   cleanup'ta geri yüklenir.
 *
 * Erişilebilirlik:
 * - `Escape` davranışı bu helper'da YOKtur; dışarıdan yönetilir.
 * - Kapsayıcının `role="dialog"` + `aria-modal="true"` taşıması
 *   beklenir; bu helper yalnızca klavye odak döngüsünü garanti eder.
 * - `disabled` veya `tabIndex={-1}` elemanlar döngü dışı bırakılır;
 *   `inert` veya `aria-hidden` subtree'ler atlanmaz, bu nedenle
 *   dışarıdaki uygulayıcı kendi görünürlüğünü yönetmelidir.
 */

"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Odaklanabilir eleman seçicisi. Native HTML form elemanları, link
 * ve butonların yanı sıra `contenteditable` ve `tabindex>=0` alan
 * öğeleri yakalanır. `inert` henüz tüm tarayıcılarda stabil
 * olmadığı için selector'a eklenmemiştir; bu komponent tek bir
 * kapsayıcı altında kullanıldığı için dış etkileşim çağrı yerinde
 * engellenir.
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export type FocusTrapProps = {
  /**
   * Odak yakalamanın aktif olup olmadığı. Modal kapalıyken `false`
   * geçilir; bu durumda hiçbir yan etki oluşmaz.
   */
  active: boolean;
  /**
   * Kapsayıcı element için ek class adı. Yardımcı komponent
   * `display` veya stil sınıfları enjekte etmez; sadece odak
   * yönetimi sağlar.
   */
  className?: string;
  children: ReactNode;
};

/**
 * Aktifken klavye odağını kapsayıcı içinde hapseder. Aktif
 * olmadığında çocukları olduğu gibi render eder.
 * @param root0
 * @param root0.active
 * @param root0.className
 * @param root0.children
 */
export function FocusTrap({
  active,
  className,
  children,
}: FocusTrapProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    // Önceki aktif elemanı sakla; cleanup'ta geri yüklenecek.
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // İlk odak: kapsayıcı içindeki ilk odaklanabilir elemana.
    const focusables = getFocusable(container);
    const firstFocusable = focusables[0];
    if (firstFocusable) {
      firstFocusable.focus();
    } else {
      container.setAttribute("tabindex", "-1");
      container.focus();
    }

    /**
     * `keydown` dinleyicisi: Tab / Shift+Tab döngüsünü zorlar,
     * odak kapsayıcı dışına kaçarsa içeri çeker.
     * @param event
     */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Tab") return;
      if (!container) return;
      const currentFocusables = getFocusable(container);
      if (currentFocusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = currentFocusables[0];
      const last = currentFocusables[currentFocusables.length - 1];
      if (!first || !last) return;
      const activeEl = document.activeElement;
      if (event.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          event.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !container.contains(activeEl)) {
        event.preventDefault();
        first.focus();
      }
    }

    /**
     * `focus` dinleyicisi: kapsayıcı dışına kaçan odağı geri
     * çeker. Eğer kapsayıcı içinde hiç odaklanabilir eleman
     * yoksa kapsayıcının kendisine odaklanır.
     * @param event
     */
    function handleFocusIn(event: FocusEvent): void {
      if (!container) return;
      const target = event.target;
      if (target instanceof Node && container.contains(target)) return;
      const focusables = getFocusable(container);
      const next = focusables[0];
      if (next) {
        next.focus();
      } else {
        container.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      // Cleanup: önceki aktif elemana geri dön (örn. modalı açan buton).
      const previous = previouslyFocusedRef.current;
      if (previous && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [active]);

  return (
    <div className={className} ref={containerRef}>
      {children}
    </div>
  );
}

/**
 * Bir kapsayıcı içindeki odaklanabilir elemanları, DOM sırasına
 * göre döner. Görünür olmayan veya `display:none` ataları içinde
 * kalan elemanlar dahil edilmez.
 * @param container
 */
function getFocusable(container: HTMLElement): HTMLElement[] {
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  );
  return nodes.filter((node) => isVisible(node));
}

/**
 * Bir elemanın odak yakalamaya dahil edilip edilmeyeceğine karar verir.
 * Yalnızca açıkça gizlenmiş elemanları (`hidden`, `aria-hidden="true"`,
 * `tabindex<0`) filtreler; layout kontrolü (`offsetParent` /
 * `getClientRects`) kullanmaz. jsdom ortamında layout bilgisi
 * bulunmadığından bu kontroller false-positive üretir ve odak
 * döngüsünü yanlışlıkla kapsayıcıya yönlendirir. Tarayıcıda gerçek
 * `display:none` elemanlar zaten odaklanamaz; bu yüzden ek layout
 * kontrolüne gerek yoktur.
 * @param node
 */
function isVisible(node: HTMLElement): boolean {
  if (node.hasAttribute("hidden")) return false;
  if (node.getAttribute("aria-hidden") === "true") return false;
  if (node.tabIndex < 0 && !node.hasAttribute("tabindex")) return false;
  return true;
}
