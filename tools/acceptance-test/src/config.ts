/**
 * @file Pilot kabul (UAT) testi senaryo katalogu.
 * @module @vetniva/acceptance-test/config
 *
 * @description GOAL-121 (FAZ-12) kapsaminda pilot veterinerle
 * uygulanacak 10 uctan uca kabul senaryosu tanimlanir. Her
 * senaryo pilot kullanicinin UI uzerunden sirayla tikladigi
 * aksiyonlara karsilik gelen API adimlarindan olusur.
 *
 * Onemli notlar:
 *  - API yollari (path) gercek controller prefix'lerine
 *    birebir uyar (apps/api/src/modules/<...>).
 *  - Placeholder'lar {ownerId}/{patientId}/{appointmentId}
 *    gibi onceki adimlardan otomatik cozulur (runner.ts).
 *  - Pilot kullanicinin rolu (OWNER/VETERINARIAN/STAFF/
 *    PET_OWNER_PORTAL) her senaryoda acikca belirtilir;
 *    runner bu bilgiyi log/rapora yazar, auth ayarlari
 *    operasyonel katmandan CLI argumanlari ile gelir.
 *  - expectStatus: POST icin 201, digerleri 200/204.
 *  - expectField: response body'sinde truthy olmasi beklenen
 *    alan (nokta notasyonu); bos ise kontrol yapilmaz.
 *
 * @since GOAL-121 (FAZ-12) pilot kabul testleri
 */

import type { UatScenarioConfig, UatScenarioKey } from "./types.js";

/** 10 pilot kabul senaryosu. Sira pilot akisini yansitir. */
export const SCENARIOS: ReadonlyArray<UatScenarioConfig> = [
  {
    key: "new_owner_patient",
    title: "Yeni musteri ve hayvan kaydi",
    description:
      "Resepsiyon: yeni musteri (owner) ve hayvan (patient) kaydi, ardindan zaman cizelgesi kontrolu.",
    module: "owner",
    actorRole: "STAFF",
    priority: 1,
    steps: [
      {
        name: "create_owner",
        label: "Yeni musteri kaydi olustur",
        method: "POST",
        path: "/api/v1/clinic/owners",
        body: {
          firstName: "Pilot",
          lastName: "Musteri",
          phone: "{runPhone}",
          email: "pilot.musteri+{runSuffix}@example.com",
          consentKvkk: true,
          consentMarketing: false,
        },
        expectStatus: 201,
        expectField: "id",
      },
      {
        name: "get_owner",
        label: "Musteri detayini goruntule",
        method: "GET",
        path: "/api/v1/clinic/owners/{ownerId}",
        expectStatus: 200,
        expectField: "id",
      },
      {
        name: "create_patient",
        label: "Yeni hayvan kaydi olustur",
        method: "POST",
        path: "/api/v1/clinic/patients",
        body: {
          ownerId: "{ownerId}",
          name: "Karabas",
          species: "dog",
          breed: "Kangal",
          gender: "male",
          neutered: false,
          birthDate: "2022-01-15",
        },
        expectStatus: 201,
        expectField: "id",
      },
      {
        name: "get_patient_timeline",
        label: "Hayvan zaman cizelgesini ac",
        method: "GET",
        path: "/api/v1/clinic/patients/{patientId}/timeline?limit=10",
        expectStatus: 200,
      },
    ],
  },
  {
    key: "appointment",
    title: "Randevu olusturma ve yonetimi",
    description:
      "Resepsiyon: takvimden uygun saat, randevu olustur, detay gor, iptal et.",
    module: "appointment",
    actorRole: "STAFF",
    priority: 1,
    steps: [
      {
        name: "list_calendar_today",
        label: "Bugunun takvimini ac",
        method: "GET",
        path: "/api/v1/calendar/days/2026-08-02",
        expectStatus: 200,
      },
      {
        name: "create_appointment",
        label: "Randevu olustur",
        method: "POST",
        path: "/api/v1/clinic/appointments",
        body: {
          patientId: "{patientId}",
          branchId: "{branchId}",
          veterinarianId: "9c0a2f2a-697e-4bf0-a1bd-b965bdb171b9",
          type: "consultation",
          start: "{runAppointmentStart}",
          durationMin: 20,
          notes: "Genel kontrol",
        },
        expectStatus: 201,
        expectField: "id",
      },
      {
        name: "get_appointment",
        label: "Randevu detayini ac",
        method: "GET",
        path: "/api/v1/clinic/appointments/{appointmentId}",
        expectStatus: 200,
        expectField: "id",
      },
      {
        name: "cancel_appointment",
        label: "Randevuyu iptal et",
        method: "POST",
        path: "/api/v1/clinic/appointments/{appointmentId}/cancel",
        body: { reason: "Pilot kapsaminda iptal" },
        expectStatus: 200,
      },
    ],
  },
  {
    key: "examination",
    title: "Muayene baslatma ve tamamlama",
    description:
      "Veteriner: muayene ac, vital bulgulari gir, SOAP notu ekle, muayeneyi tamamla.",
    module: "examination",
    actorRole: "VETERINARIAN",
    priority: 1,
    steps: [
      {
        name: "start_examination",
        label: "Muayene baslat",
        method: "POST",
        path: "/api/v1/clinic/examinations",
        body: {
          appointmentId: "{appointmentId}",
          type: "consultation",
          chiefComplaint: "Genel kontrol",
        },
        expectStatus: 201,
        expectField: "id",
      },
      {
        name: "get_examination",
        label: "Muayene detayini ac",
        method: "GET",
        path: "/api/v1/clinic/examinations/{examinationId}",
        expectStatus: 200,
        expectField: "id",
      },
      {
        name: "complete_examination",
        label: "Muayeneyi tamamla",
        method: "POST",
        path: "/api/v1/clinic/examinations/{examinationId}/complete",
        body: {},
        expectStatus: 200,
      },
    ],
  },
  {
    key: "vaccination",
    title: "Asi uygulamasi ve asi karti",
    description: "Veteriner: asi uygulama kaydi ac, asi kartini goruntule.",
    module: "vaccination",
    actorRole: "VETERINARIAN",
    priority: 2,
    steps: [
      {
        name: "create_vaccine_application",
        label: "Asi uygulamasi kaydet",
        method: "POST",
        path: "/api/v1/clinic/vaccines/applications",
        body: {
          patientId: "{patientId}",
          protocolId: "{vaccineProtocolId}",
          lot: { lot: "PILOT-LOT-001", expiryDate: "2030-12-31", stockProductId: "{vaccineStockProductId}" },
          applicationDate: "{runAppointmentStart}",
        },
        expectStatus: 201,
        expectField: "id",
      },
      {
        name: "get_vaccine_card",
        label: "Asi kartini goruntule",
        method: "GET",
        path: "/api/v1/clinic/vaccines/cards/patient/{patientId}",
        expectStatus: 200,
      },
    ],
  },
  {
    key: "petshop_sale",
    title: "Petshop satis",
    description:
      "Resepsiyon/satis: petshop satis taslagi ac, urun ekle, satisi tamamla.",
    module: "petshop",
    actorRole: "STAFF",
    priority: 2,
    steps: [
      {
        name: "create_sale",
        label: "Petshop satis taslagi ac",
        method: "POST",
        path: "/api/v1/petshop/sales",
        body: {
          lines: [
            {
              productId: "{productId}",
              unit: "unit",
              quantity: "1",
              unitPrice: "100.00",
            },
          ],
          customerOwnerId: "{ownerId}",
          customerPatientId: "{patientId}",
          paymentMethod: "cash",
          paidAmount: "0",
        },
        expectStatus: 201,
        expectField: "sale.id",
      },
      {
        name: "get_sale",
        label: "Satis detayini gor",
        method: "GET",
        path: "/api/v1/petshop/sales/{saleId}",
        expectStatus: 200,
        expectField: "sale.id",
      },
      {
        name: "complete_sale",
        label: "Satisi tamamla",
        method: "POST",
        path: "/api/v1/petshop/sales/{saleId}/complete",
        body: { paymentMethod: "cash" },
        expectStatus: 200,
      },
    ],
  },
  {
    key: "collection",
    title: "Tahsilat",
    description: "Kasa: tahsilat kaydi ac ve dogrula.",
    module: "payment",
    actorRole: "STAFF",
    priority: 1,
    steps: [
      {
        name: "create_payment",
        label: "Tahsilat kaydi ac",
        method: "POST",
        path: "/api/v1/payments",
        body: {
          sourceType: "petshop_sale",
          sourceId: "{saleId}",
          amount: "250.00",
          method: "cash",
          reference: "PILOT-PMT-{runSuffix}",
        },
        expectStatus: 201,
        expectField: "id",
      },
      {
        name: "get_payment",
        label: "Tahsilat detayini gor",
        method: "GET",
        path: "/api/v1/payments/{paymentId}",
        expectStatus: 200,
        expectField: "id",
      },
    ],
  },
  {
    key: "surgery",
    title: "Ameliyat planlama ve tamamlama",
    description: "Veteriner: ameliyat plani ac, baslat, tamamla.",
    module: "surgery",
    actorRole: "VETERINARIAN",
    priority: 2,
    steps: [
      {
        name: "create_surgery_plan",
        label: "Ameliyat plani olustur",
        method: "POST",
        path: "/api/v1/clinic/surgery-plans",
        body: {
          patientId: "{patientId}",
          leadSurgeonUserId: "9c0a2f2a-697e-4bf0-a1bd-b965bdb171b9",
          operationType: "ovariohysterectomy",
          scheduledAt: "{runSurgeryStart}",
          notes: "Pilot UAT cerrahi planı",
        },
        expectStatus: 201,
        expectField: "id",
      },
      {
        name: "start_surgery",
        label: "Ameliyati baslat",
        method: "POST",
        path: "/api/v1/clinic/surgery-plans/{surgeryId}/start",
        expectStatus: 200,
      },
      {
        name: "complete_surgery",
        label: "Ameliyati tamamla",
        method: "POST",
        path: "/api/v1/clinic/surgery-plans/{surgeryId}/complete",
        expectStatus: 200,
      },
    ],
  },
  {
    key: "hospitalization",
    title: "Yatis ve kafes yonetimi",
    description: "Veteriner: yatis ac, kafese yerlestir, taburcu et.",
    module: "hospitalization",
    actorRole: "VETERINARIAN",
    priority: 2,
    steps: [
      {
        name: "create_hospitalization",
        label: "Yatis ac",
        method: "POST",
        path: "/api/v1/clinic/hospitalizations",
        body: {
          patientId: "{patientId}",
          reason: "Gozlem",
        },
        expectStatus: 201,
        expectField: "id",
      },
      {
        name: "admit_hospitalization",
        label: "Yatisi aktiflestir",
        method: "POST",
        path: "/api/v1/clinic/hospitalizations/{hospitalizationId}/admit",
        body: { cageId: "{cageId}" },
        expectStatus: 200,
      },
      {
        name: "discharge_hospitalization",
        label: "Taburcu et",
        method: "POST",
        path: "/api/v1/clinic/hospitalizations/{hospitalizationId}/discharge",
        body: { summary: "Saglikli, eve gidebilir" },
        expectStatus: 200,
      },
    ],
  },
  {
    key: "laboratory",
    title: "Laboratuvar istegi",
    description: "Veteriner: lab istegi ac, numune al, tamamla.",
    module: "lab",
    actorRole: "VETERINARIAN",
    priority: 2,
    steps: [
      {
        name: "create_lab_order",
        label: "Lab istegi ac",
        method: "POST",
        path: "/api/v1/clinic/lab-orders",
        body: {
          patientId: "{patientId}",
          labTestId: "{labTestId}",
          sourceType: "manual",
          priority: "routine",
          notes: "Pilot UAT laboratuvar isteği",
        },
        expectStatus: 201,
        expectField: "id",
      },
      {
        name: "collect_lab_sample",
        label: "Numune al",
        method: "POST",
        path: "/api/v1/clinic/lab-orders/{labOrderId}/collect",
        body: { collectedAt: "{runAppointmentStart}", collectedByUserId: "9c0a2f2a-697e-4bf0-a1bd-b965bdb171b9", sampleQuality: "ok" },
        expectStatus: 200,
      },
      {
        name: "complete_lab_order",
        label: "Is emrini kapat",
        method: "POST",
        path: "/api/v1/clinic/lab-orders/{labOrderId}/complete",
        expectStatus: 200,
      },
    ],
  },
  {
    key: "portal",
    title: "Hasta sahibi portali",
    description:
      "Portal: hasta sahibi online randevu talebi olusturur; klinik onaylar.",
    module: "portal",
    actorRole: "PET_OWNER_PORTAL",
    priority: 3,
    steps: [
      {
        name: "create_portal_request",
        label: "Online randevu talebi olustur",
        method: "POST",
        path: "/api/v1/portal-appointments/requests",
        body: {
          patientId: "{patientId}",
          requestedDate: "2026-08-10",
          reason: "Yillik kontrol",
        },
        expectStatus: 201,
        expectField: "id",
      },
      {
        name: "approve_portal_request",
        label: "Klinik talebi onaylar",
        method: "POST",
        path: "/api/v1/clinic/portal-appointments/requests/{portalRequestId}/approve",
        body: { appointmentId: "{appointmentId}" },
        expectStatus: 200,
      },
    ],
  },
];

/** Senaryo anahtarindan config getirir. */
export function getScenario(key: UatScenarioKey): UatScenarioConfig {
  const found = SCENARIOS.find((s) => s.key === key);
  if (!found) {
    throw new Error(`Bilinmeyen pilot senaryosu: ${String(key)}`);
  }
  return found;
}

/** Tum senaryo anahtarlari. */
export function listScenarioKeys(): ReadonlyArray<UatScenarioKey> {
  return SCENARIOS.map((s) => s.key);
}

/** Oncelik seviyesine gore senaryolari filtreler. */
export function scenariosByPriority(
  priority: 1 | 2 | 3,
): ReadonlyArray<UatScenarioConfig> {
  return SCENARIOS.filter((s) => s.priority === priority);
}
