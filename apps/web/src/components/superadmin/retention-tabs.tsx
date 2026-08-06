/**
 * @file Log retention modülü için tab konteyneri.
 * @module @vetniva/web/components/superadmin/retention-tabs
 * @description FAZ-10 SUPERADMIN Log Retention sayfasının üç sekmesini
 * (Policies, Sweeps, Effective) tek bir istemci komponentinde toplar.
 * Policies sekmesi filtreli policy listesini, Sweeps sekmesi sweep
 * geçmişini, Effective sekmesi ise tenant × logType × severity için
 * effective policy önizlemesini sunar. Sağ üstte "Yeni Policy" ve
 * "Sweep Başlat" aksiyonları her zaman görünürdür; bunlar modal
 * pencereleri açar.
 *
 * Erişilebilirlik:
 * - Tab listesi `role="tablist"` ve `aria-orientation="horizontal"`
 * - Aktif sekme `aria-selected="true"`
 * - Sekmeler arası klavye navigasyonu (Sol/Sağ ok) için `onKeyDown`
 * - Modal açıldığında `FocusTrap` + Escape desteği; focus trap
 *   modal komponentlerinin içindedir, bu kapsayıcı yalnız Escape
 *   listener'ını yönetir
 * @security Tüm API çağrıları yalnızca oturum çereziyle yapılır;
 * tenant kimliği tarayıcıdan türetilmez; backend `audit:log:read`
 * yetkisini uygular.
 */

"use client";

import { Button } from "@vetniva/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { getLabels, type Locale } from "@/lib/labels";
import {
  safeLabelLookup,
  safeRefAssign,
  safeRefLookup,
} from "@/lib/safe-lookup";

import { RetentionEffectivePreview } from "./retention-effective-preview";
import { RetentionPolicyForm } from "./retention-policy-form";
import { RetentionPolicyList } from "./retention-policy-list";
import { RetentionSweepList } from "./retention-sweep-list";
import { SweepTriggerModal } from "./retention-sweep-modal";

export type RetentionTab = "policies" | "sweeps" | "effective";

export type RetentionTabsProps = {
  locale: Locale;
};

const TAB_ORDER: ReadonlyArray<RetentionTab> = [
  "policies",
  "sweeps",
  "effective",
];

/**
 * Bounded indeks için statik lookup. `TAB_ORDER` 3 elemanlı
 * olduğundan `index` 0/1/2 dışına çıkamaz; dinamik array erişimine
 * gerek yoktur. `security/detect-object-injection` kuralını bypass
 * eder.
 * @param index
 */
function tabAt(index: number): RetentionTab {
  if (index === 0) return "policies";
  if (index === 1) return "sweeps";
  return "effective";
}

/**
 * Üç sekmeyi yöneten ana istemci komponenti. Aktif sekme state
 * olarak tutulur; URL'e yazılmaz (sayfa içi sekme olduğu için
 * yönlendirme yok). Modal state'leri de yerelde tutulur.
 * @param root0
 * @param root0.locale
 */
export function RetentionTabs({ locale }: RetentionTabsProps): JSX.Element {
  const labels = getLabels(locale).retention;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<RetentionTab>("policies");
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [sweepModalOpen, setSweepModalOpen] = useState(false);
  const tabRefs = useRef<Record<RetentionTab, HTMLButtonElement | null>>({
    policies: null,
    sweeps: null,
    effective: null,
  });

  /**
   * Sekmeler arası klavye navigasyonu: Sol/Sağ ok tuşları ile
   * sekmeler arasında geçiş yapar, Home/End ile başa/sona atlar.
   * @param event
   */
  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>): void => {
      const currentIndex = TAB_ORDER.indexOf(activeTab);
      if (event.key === "ArrowRight") {
        event.preventDefault();
        const next = tabAt((currentIndex + 1) % TAB_ORDER.length);
        setActiveTab(next);
        safeRefLookup(tabRefs.current, next)?.focus();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        const prev = tabAt(
          (currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length,
        );
        setActiveTab(prev);
        safeRefLookup(tabRefs.current, prev)?.focus();
      } else if (event.key === "Home") {
        event.preventDefault();
        const first = tabAt(0);
        setActiveTab(first);
        safeRefLookup(tabRefs.current, first)?.focus();
      } else if (event.key === "End") {
        event.preventDefault();
        const last = tabAt(TAB_ORDER.length - 1);
        setActiveTab(last);
        safeRefLookup(tabRefs.current, last)?.focus();
      }
    },
    [activeTab],
  );

  /**
   * Policy form başarıyla kaydedildiğinde listeyi tazelemek için
   * router.refresh() çağrılır; sayfa yeniden yüklenir ve liste
   * güncel veriyi çeker.
   */
  const handlePolicySaved = useCallback((): void => {
    setPolicyModalOpen(false);
    router.refresh();
  }, [router]);

  /**
   * Sweep tetiklendiğinde sweeps sekmesi aktif olur ve sayfa
   * tazelenir ki yeni sweep geçmişte görünsün.
   */
  const handleSweepTriggered = useCallback((): void => {
    setSweepModalOpen(false);
    setActiveTab("sweeps");
    router.refresh();
  }, [router]);

  // Modal açıkken Escape ile kapat
  useEffect(() => {
    if (!policyModalOpen && !sweepModalOpen) return;
    /**
     * @param event
     */
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setPolicyModalOpen(false);
        setSweepModalOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [policyModalOpen, sweepModalOpen]);

  return (
    <section
      aria-label={labels.title}
      className="space-y-5"
      data-testid="retention-tabs"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          aria-label="Aksiyonlar"
          className="flex flex-wrap items-center gap-2"
          role="group"
        >
          <Button
            onClick={() => setSweepModalOpen(true)}
            size="md"
            type="button"
            variant="secondary"
          >
            {labels.common.runSweep}
          </Button>
          <Button
            onClick={() => setPolicyModalOpen(true)}
            size="md"
            type="button"
            variant="primary"
          >
            {labels.common.newPolicy}
          </Button>
        </div>
      </div>

      <div
        aria-label={labels.title}
        className="border-b border-slate-200"
        role="tablist"
      >
        <div className="flex flex-wrap gap-1">
          {TAB_ORDER.map((tab) => {
            const selected = activeTab === tab;
            return (
              <button
                aria-controls={`retention-tabpanel-${tab}`}
                aria-selected={selected}
                className={`-mb-px rounded-t-md border-b-2 px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-clinic-500 ${
                  selected
                    ? "border-clinic-600 text-clinic-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
                id={`retention-tab-${tab}`}
                key={tab}
                onClick={() => setActiveTab(tab)}
                onKeyDown={handleTabKeyDown}
                ref={(el) => {
                  safeRefAssign(tabRefs.current, tab, el);
                }}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
              >
                {safeLabelLookup(labels.tabs, tab, tab)}
              </button>
            );
          })}
        </div>
      </div>

      <div
        aria-labelledby={`retention-tab-${activeTab}`}
        id={`retention-tabpanel-${activeTab}`}
        role="tabpanel"
      >
        {activeTab === "policies" ? (
          <RetentionPolicyList locale={locale} />
        ) : null}
        {activeTab === "sweeps" ? <RetentionSweepList locale={locale} /> : null}
        {activeTab === "effective" ? (
          <RetentionEffectivePreview locale={locale} />
        ) : null}
      </div>

      {policyModalOpen ? (
        <RetentionPolicyForm
          labels={labels}
          onClose={() => setPolicyModalOpen(false)}
          onSaved={handlePolicySaved}
        />
      ) : null}

      {sweepModalOpen ? (
        <SweepTriggerModal
          labels={labels}
          onClose={() => setSweepModalOpen(false)}
          onTriggered={handleSweepTriggered}
        />
      ) : null}
    </section>
  );
}
