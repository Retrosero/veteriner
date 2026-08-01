/**
 * @file Onboarding service unit testleri.
 * @module apps/api/common/onboarding/onboarding.service.spec
 * @description OnboardingService'in temel davranışlarını doğrular:
 * - Role-bazlı senaryo filtreleme
 * - Modül-bazlı senaryo filtreleme
 * - Trigger eşleşmesi
 * - Tıbbi soruların reddi (medical / dosage / diagnosis / treatment)
 * - Locale (tr-TR / en-GB) desteği
 * - Out-of-scope mesajı
 * - currentPage bonus scoring.
 * @since GOAL-117 (FAZ-11) ilk kullanım asistanı
 */

import { beforeEach, describe, expect, it } from "vitest";

import { OnboardingService } from "./onboarding.service.js";

import type { ActorContext } from "../actor/actor-context.service.js";
import type { ModuleKey } from "../modules/module.types.js";

const VET: ActorContext = {
  actorId: "usr-vet-test",
  actorType: "user",
  role: "VETERINARIAN",
  tenantId: "tnt-test",
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-vet",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const STAFF: ActorContext = {
  ...VET,
  actorId: "usr-staff-test",
  role: "STAFF",
  correlationId: "req-staff",
};

describe("OnboardingService", () => {
  let service: OnboardingService;

  beforeEach(() => {
    service = new OnboardingService();
  });

  // --- 1) Role-bazlı senaryo filtreleme ----------------------------------------

  describe("listScenarios role filtering", () => {
    it("VETERINARIAN klinik + aşı + lab senaryolarını görür", () => {
      const res = service.listScenarios("VETERINARIAN");
      const ids = res.scenarios.map((s) => s.id);
      expect(ids).toContain("create-patient");
      expect(ids).toContain("record-vaccination");
      expect(ids).toContain("lab-result-entry");
      // Petshop senaryosu VETERINARIAN için yok
      expect(ids).not.toContain("petshop-sale");
      // Portal senaryosu VETERINARIAN için yok
      expect(ids).not.toContain("portal-view-pets");
    });

    it("PET_OWNER_PORTAL yalnızca portal senaryosunu görür", () => {
      const res = service.listScenarios("PET_OWNER_PORTAL");
      const ids = res.scenarios.map((s) => s.id);
      expect(ids).toEqual(["portal-view-pets"]);
    });

    it("SUPERADMIN yalnızca admin senaryolarını görür", () => {
      const res = service.listScenarios("SUPERADMIN");
      const ids = res.scenarios.map((s) => s.id);
      expect(ids).toContain("superadmin-tenant");
      expect(ids).not.toContain("create-patient");
      expect(ids).not.toContain("record-vaccination");
    });
  });

  // --- 2) Modül-bazlı senaryo filtreleme ---------------------------------------

  describe("listScenarios module filtering", () => {
    it("petshop modülü kapalıyken petshop-sale gizlenir", () => {
      const enabled: ModuleKey[] = [
        "clinic",
        "appointments",
        "vaccinations",
        "inventory",
        "billing",
        "laboratory",
      ];
      const res = service.listScenarios("STAFF", enabled);
      const ids = res.scenarios.map((s) => s.id);
      expect(ids).not.toContain("petshop-sale");
    });

    it("tüm modüller açıkken petshop-sale STAFF için görünür", () => {
      const enabled: ModuleKey[] = [
        "clinic",
        "appointments",
        "vaccinations",
        "inventory",
        "petshop",
        "billing",
        "laboratory",
        "portal",
        "imaging",
        "hospitalization",
      ];
      const res = service.listScenarios("STAFF", enabled);
      const ids = res.scenarios.map((s) => s.id);
      expect(ids).toContain("petshop-sale");
    });

    it("enabledModules null ise filtre uygulanmaz", () => {
      const res = service.listScenarios("STAFF", null);
      const ids = res.scenarios.map((s) => s.id);
      expect(ids.length).toBeGreaterThan(0);
    });
  });

  // --- 3) Trigger eşleşmesi + answer -------------------------------------------

  describe("ask scenario matching", () => {
    it("aşı kaydı sorusu record-vaccination senaryosunu tetikler", () => {
      const res = service.ask(
        {
          query: "aşı kaydı nasıl yapılır?",
          locale: "tr-TR",
        },
        VET,
      );
      expect(res.generationSource).toBe("template");
      expect(res.scenario?.id).toBe("record-vaccination");
      expect(res.scenario?.steps.length).toBeGreaterThan(0);
      expect(res.answer.length).toBeGreaterThan(0);
    });

    it("İngilizce soru İngilizce başlık döner", () => {
      const res = service.ask(
        {
          query: "how to record a vaccination?",
          locale: "en-GB",
        },
        VET,
      );
      expect(res.scenario?.id).toBe("record-vaccination");
      expect(res.scenario?.title).toContain("Record");
    });

    it("alternatifler en fazla 2 ile sınırlı", () => {
      const res = service.ask(
        {
          query: "kayıt nasıl yapılır?",
          locale: "tr-TR",
        },
        STAFF,
      );
      expect(res.alternatives?.length ?? 0).toBeLessThanOrEqual(2);
    });

    it("eşleşme yoksa retrieval + out_of_scope mesajı", () => {
      const res = service.ask(
        {
          query: "tamamen alakasız xyz sorgu",
          locale: "tr-TR",
        },
        VET,
      );
      expect(res.scenario).toBeUndefined();
      expect(res.generationSource).toBe("retrieval");
      expect(res.answer).toMatch(/uygun|örnekler/i);
    });

    it("currentPage bonus: hasta sayfasındayken create-patient yüksek skor alır", () => {
      const res = service.ask(
        {
          query: "yeni hasta kaydı",
          locale: "tr-TR",
          currentPage: "/tr/clinic/patients",
        },
        STAFF,
      );
      expect(res.scenario?.id).toBe("create-patient");
    });
  });

  // --- 4) Tıbbi reddi ----------------------------------------------------------

  describe("ask medical refusal", () => {
    it("tanı koy sorusu medical reddi tetikler", () => {
      const res = service.ask(
        {
          query: "kedimin böbrek yetmezliği tanısı koyabilir misin?",
          locale: "tr-TR",
        },
        VET,
      );
      expect(res.generationSource).toBe("refusal");
      expect(res.refusalReason).toBe("diagnosis");
      expect(res.answer.toLowerCase()).toContain("veteriner");
    });

    it("doz sorgusu dosage reddi tetikler", () => {
      const res = service.ask(
        {
          query: "amoksisilin 5 mg doz öner",
          locale: "tr-TR",
        },
        VET,
      );
      expect(res.refusalReason).toBe("dosage");
    });

    it("İngilizce dosage sorgusu reddedilir", () => {
      const res = service.ask(
        {
          query: "what dosage of amoxicillin should I give?",
          locale: "en-GB",
        },
        VET,
      );
      expect(res.refusalReason).toBe("dosage");
    });

    it("tedavi önerisi reddedilir", () => {
      const res = service.ask(
        {
          query: "kedim için tedavi önerir misin?",
          locale: "tr-TR",
        },
        VET,
      );
      expect(["treatment", "medical"]).toContain(res.refusalReason);
    });

    it("İngilizce diagnose sorgusu reddedilir", () => {
      const res = service.ask(
        {
          query: "can you diagnose my dog?",
          locale: "en-GB",
        },
        VET,
      );
      expect(res.refusalReason).toBe("diagnosis");
    });

    it("refusal sonrası scenario dönmez", () => {
      const res = service.ask(
        {
          query: "kedime hangi antibiyotik uygun?",
          locale: "tr-TR",
        },
        VET,
      );
      expect(res.scenario).toBeUndefined();
      expect(res.alternatives).toBeUndefined();
    });
  });

  // --- 5) detectMedicalRefusal doğrudan test -----------------------------------

  describe("detectMedicalRefusal", () => {
    it("güvenli soru null döner", () => {
      expect(
        service.detectMedicalRefusal("aşı nasıl yapılır?", "tr-TR"),
      ).toBeNull();
      expect(
        service.detectMedicalRefusal("how to book appointment?", "en-GB"),
      ).toBeNull();
    });

    it("büyük-küçük harf ve noktalama normalize edilir", () => {
      expect(
        service.detectMedicalRefusal("TEŞHİS koy!!", "tr-TR"),
      ).not.toBeNull();
    });
  });

  // --- 6) enabledModules ask üzerinde -----------------------------------------

  describe("ask module filtering", () => {
    it("enabledModules boşsa modül filtresi uygulanmaz", () => {
      const res = service.ask(
        {
          query: "petshop satış nasıl yapılır?",
          locale: "tr-TR",
          enabledModules: [],
        },
        STAFF,
      );
      expect(res.scenario?.id).toBe("petshop-sale");
    });

    it("enabledModules petshop hariçse petshop senaryosu dönmez", () => {
      const res = service.ask(
        {
          query: "petshop pos satışı oluşturma",
          locale: "tr-TR",
          enabledModules: ["clinic", "appointments"],
        },
        STAFF,
      );
      // Modül filtrelendi: petshop-sale dönmesin.
      // (Sorgu jenerik kelime içermediği için başka senaryo
      // tetiklenmemeli; eşleşme yoksa retrieval + out_of_scope.)
      expect(res.scenario?.id ?? null).not.toBe("petshop-sale");
    });
  });

  // --- 7) Role + tenant kombinasyonu ------------------------------------------

  describe("role-tenant security", () => {
    it("STAFF klinik senaryosunu görür ama SUPERADMIN tenant senaryosunu görmez", () => {
      const staffRes = service.listScenarios("STAFF");
      const superRes = service.listScenarios("SUPERADMIN");
      const staffIds = staffRes.scenarios.map((s) => s.id);
      const superIds = superRes.scenarios.map((s) => s.id);
      expect(staffIds).toContain("create-patient");
      expect(superIds).not.toContain("create-patient");
    });

    it("PET_OWNER_PORTAL rolü klinik senaryosunu görmez", () => {
      const res = service.listScenarios("PET_OWNER_PORTAL");
      const ids = res.scenarios.map((s) => s.id);
      expect(ids).not.toContain("create-patient");
    });
  });

  // --- 8) OWNER rolü kapsamı -------------------------------------------------

  it("OWNER tüm operasyonel senaryoları görür (klinik, petshop, fatura)", () => {
    const res = service.listScenarios("OWNER");
    const ids = res.scenarios.map((s) => s.id);
    expect(ids).toContain("create-patient");
    expect(ids).toContain("payment-collection");
  });
});
