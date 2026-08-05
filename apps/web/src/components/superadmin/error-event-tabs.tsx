/**
 * @file Error Center sekme bileşeni.
 * @module @vetniva/web/components/superadmin/error-event-tabs
 * @description Error Center sayfasının gövdesini iki sekmeye böler:
 *  - "list" — hata olayları listesi (filtre + tablo)
 *  - "groups" — fingerprint grupları (yeni zenginleştirme)
 *
 * Sekme seçimi component iç state'inde tutulur; URL'ye yazımı
 * opsiyoneldir. Erişilebilirlik için WAI-ARIA tab pattern
 * (role="tablist" + role="tab" + role="tabpanel" + aria-selected)
 * uygulanır; klavye ok/yön tuşları ile gezinilebilir.
 *
 * Erişilebilirlik:
 * - `role="tablist"` + `aria-label`
 * - Aktif sekme `aria-selected="true"`
 * - Sekme paneli `role="tabpanel"` + `aria-labelledby`
 * - Klavye: ←/→ ok tuşları sekmeler arasında geçiş yapar
 * @security Sekmeler yalnız görsel sıralama; backend sorgularını
 * etkilemez. Filtre/izin kontrolleri ilgili sekme içinde kalır.
 */

"use client";

import { cn } from "@vetniva/ui/cn";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

import {
  safeLabelLookup,
  safeRefAssign,
  safeRefLookup,
} from "@/lib/safe-lookup";


export type ErrorEventTabKey = "list" | "groups";

export type ErrorEventTabLabels = {
  list: string;
  groups: string;
};

export type ErrorEventTabsProps = {
  activeTab: ErrorEventTabKey;
  onTabChange: (tab: ErrorEventTabKey) => void;
  labels: ErrorEventTabLabels;
  listContent: ReactNode;
  groupsContent: ReactNode;
  className?: string;
};

const TAB_ORDER: ReadonlyArray<ErrorEventTabKey> = ["list", "groups"];

/**
 * Bounded indeks için statik lookup. `nextIndex` her zaman
 * `TAB_ORDER` uzunluğu içinde olduğundan dinamik array erişimine
 * gerek yoktur; bu sayede `security/detect-object-injection` kuralı
 * tetiklenmez.
 * @param index
 */
function tabAt(index: number): ErrorEventTabKey {
  return index === 0 ? "list" : "groups";
}

/**
 *
 * @param root0
 * @param root0.activeTab
 * @param root0.onTabChange
 * @param root0.labels
 * @param root0.listContent
 * @param root0.groupsContent
 * @param root0.className
 */
export function ErrorEventTabs({
  activeTab,
  onTabChange,
  labels,
  listContent,
  groupsContent,
  className,
}: ErrorEventTabsProps): JSX.Element {
  const baseId = useId();
  const tabRefs = useRef<Record<ErrorEventTabKey, HTMLButtonElement | null>>({
    list: null,
    groups: null,
  });

  /**
   * Klavye ok tuşları ile sekmeler arasında geçiş yapar. Home/End
   * doğrudan ilk/son sekmeye atlar. Aktif sekme dışındaki
   * sekmelere focus verilir (roving tabindex).
   * @param event
   * @param currentIndex
   */
  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ): void {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % TAB_ORDER.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = TAB_ORDER.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const nextKey = tabAt(nextIndex);
    onTabChange(nextKey);
    const node = safeRefLookup(tabRefs.current, nextKey);
    if (node) node.focus();
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div
        aria-label={labels.list}
        className="flex flex-wrap gap-2 border-b border-slate-200"
        role="tablist"
      >
        {TAB_ORDER.map((key, index) => {
          const isActive = key === activeTab;
          const tabId = `${baseId}-tab-${key}`;
          const panelId = `${baseId}-panel-${key}`;
          return (
            <button
              aria-controls={panelId}
              aria-selected={isActive}
              className={cn(
                "rounded-t-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clinic-500",
                isActive
                  ? "border-b-2 border-amber-500 text-slate-900"
                  : "text-slate-500 hover:text-slate-800",
              )}
              id={tabId}
              key={key}
              onClick={() => onTabChange(key)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              ref={(node) => {
                safeRefAssign(tabRefs.current, key, node);
              }}
              role="tab"
              tabIndex={isActive ? 0 : -1}
              type="button"
            >
              {safeLabelLookup(labels, key, "")}
            </button>
          );
        })}
      </div>
      <section
        aria-labelledby={`${baseId}-tab-${activeTab}`}
        id={`${baseId}-panel-${activeTab}`}
        role="tabpanel"
      >
        {activeTab === "list" ? listContent : groupsContent}
      </section>
    </div>
  );
}
