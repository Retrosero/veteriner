/**
 * @file İlk kullanım asistanı (onboarding) servisi.
 * @module apps/api/common/onboarding/onboarding.service
 * @description GOAL-117 (FAZ-11) — Uygulama kullanımı ve
 * navigasyon sorularına cevap veren, role/modül-bazlı senaryo
 * eşleştirme yapan, tıbbi soruları reddeden asistan servisi.
 *
 * Tasarım ilkeleri:
 * - Teşhis/tedavi/doz ASLA üretmez; medical/dosage/diagnosis/
 *   treatment anahtar kelimeleri `refusal` ile sonuçlanır.
 * - Yalnız uygulama içi adımlar (sayfa + aksiyon) üretir.
 * - Senaryolar statik kodda tutulur (Faz 11); Faz 12+ ile
 *   docs/ai/AI_CHUNKS.yaml'a taşınır.
 * - LLM entegrasyonu YOK (template-based); retrieval ile zenginleştirme
 *   Faz 12+'da.
 * @security PII taşımaz. Sadece public sayfa yolu + buton adı.
 * @since GOAL-117 (FAZ-11) ilk kullanım asistanı
 */

import { Injectable, Logger } from "@nestjs/common";

import { isModuleKey, type ModuleKey } from "../modules/module.types.js";

import type {
  LocalizedOnboardingScenario,
  OnboardingAskInput,
  OnboardingAskResponse,
  OnboardingRefusalReason,
  OnboardingRole,
  OnboardingScenario,
  OnboardingScenarioListResponse,
} from "./onboarding.types.js";
import type {
  ActorContext,
  ActorRole,
} from "../actor/actor-context.service.js";

/**
 * Tıbbi içerik reddi için anahtar kelime → kategori eşlemesi
 * (Türkçe + İngilizce). Sorgu bu kelimelerden birini içeriyorsa
 * asistan reddeder; kategori UI tarafında sebep gösterimi için
 * kullanılır. Yanlış pozitif azaltmak için uzun, bağlamsal
 * kelimeler tercih edildi.
 */
type MedicalRefusalKeyword = {
  /** Lokalize anahtar kelime (>=4 char, normalize sonrası). */
  keyword: string;
  /** Reddi nedeni. */
  category: OnboardingRefusalReason;
};

const MEDICAL_REFUSAL_KEYWORDS_TR: ReadonlyArray<MedicalRefusalKeyword> = [
  // Doz
  { keyword: "ilaç dozu", category: "dosage" },
  { keyword: "doz önerisi", category: "dosage" },
  { keyword: "ilaç miktarı", category: "dosage" },
  // Tanı
  { keyword: "tanı koy", category: "diagnosis" },
  { keyword: "teşhis koy", category: "diagnosis" },
  { keyword: "teşhis nedir", category: "diagnosis" },
  { keyword: "ne hastalığı", category: "diagnosis" },
  { keyword: "hangi hastalık", category: "diagnosis" },
  // Tedavi
  { keyword: "tedavi öner", category: "treatment" },
  { keyword: "tedavi önerisi", category: "treatment" },
  { keyword: "ne tedavisi", category: "treatment" },
  { keyword: "uygun tedavi", category: "treatment" },
  { keyword: "doğru ilaç", category: "treatment" },
  { keyword: "hangi antibiyotik", category: "treatment" },
  { keyword: "ağrı kesici", category: "treatment" },
  { keyword: "ateş düşür", category: "treatment" },
  { keyword: "zehirlenme tedavi", category: "treatment" },
  // Tıbbi (genel)
  { keyword: "hangi ilaç", category: "medical" },
  { keyword: "ameliyat gerekir", category: "medical" },
  { keyword: "acilen ameliyat", category: "medical" },
  { keyword: "ölür mü", category: "medical" },
  { keyword: "öldürür mü", category: "medical" },
  { keyword: "zehirli mi", category: "medical" },
];

const MEDICAL_REFUSAL_KEYWORDS_EN: ReadonlyArray<MedicalRefusalKeyword> = [
  { keyword: "diagnose", category: "diagnosis" },
  { keyword: "what disease", category: "diagnosis" },
  { keyword: "what condition", category: "diagnosis" },
  { keyword: "treatment recommend", category: "treatment" },
  { keyword: "should i treat", category: "treatment" },
  { keyword: "what treatment", category: "treatment" },
  { keyword: "antibiotic", category: "treatment" },
  { keyword: "painkiller", category: "treatment" },
  { keyword: "fever reducer", category: "treatment" },
  { keyword: "right drug", category: "treatment" },
  { keyword: "poisoning treatment", category: "treatment" },
  { keyword: "which medication", category: "medical" },
  { keyword: "surgery needed", category: "medical" },
  { keyword: "will die", category: "medical" },
  { keyword: "is it poisonous", category: "medical" },
  { keyword: "dosage", category: "dosage" },
  { keyword: "dose", category: "dosage" },
];

/**
 * Tüm onboarding senaryoları. Senaryo eklemek için yalnızca bu
 * listeye bir kayıt eklemek yeterlidir. Cross-ref'ler
 * (related_chunks / related_pages / related_api) opsiyoneldir.
 * @since GOAL-117 (FAZ-11)
 */
const ONBOARDING_SCENARIOS: ReadonlyArray<OnboardingScenario> = [
  // --- 1) HAYVAN SAHİBİ KAYDI --------------------------------------------------
  {
    id: "create-patient-owner",
    category: "patient_owner",
    module: "clinic",
    triggers: [
      "yeni hasta sahibi",
      "sahip ekle",
      "hasta sahibi kayıt",
      "müşteri kaydı",
      "owner ekle",
      "add new owner",
      "register owner",
    ],
    title: {
      "tr-TR": "Yeni hasta sahibi (müşteri) kaydı",
      "en-GB": "Register a new patient owner",
    },
    summary: {
      "tr-TR":
        "Klinikteki yeni bir hasta sahibini (müşteriyi) sisteme ekleme adımları.",
      "en-GB":
        "Steps to register a new client/patient owner in the clinic system.",
    },
    roles: ["STAFF", "VETERINARIAN", "OWNER"],
    related_chunks: ["flow-owner_create"],
    related_pages: ["web.app.locale.clinic.owners"],
    related_api: ["POST /api/v1/clinic/owners"],
    steps: [
      {
        order: 1,
        route: "/[locale]/clinic/owners",
        title: {
          "tr-TR": "Sahip listesi sayfasını aç",
          "en-GB": "Open the owners list page",
        },
        description: {
          "tr-TR": "Sol menüden 'Müşteriler / Sahipler' bağlantısına tıklayın.",
          "en-GB": "Click 'Owners' in the left menu.",
        },
        action: "navigate",
        required_permission: "clinic:owner:read",
      },
      {
        order: 2,
        route: "/[locale]/clinic/owners",
        title: {
          "tr-TR": "Yeni Sahip butonuna tıkla",
          "en-GB": "Click 'New Owner'",
        },
        description: {
          "tr-TR": "Sağ üstteki 'Yeni Sahip' butonu ile form açılır.",
          "en-GB": "Click the 'New Owner' button on the top right.",
        },
        action: "open_form",
        required_permission: "clinic:owner:create",
      },
      {
        order: 3,
        route: "/[locale]/clinic/owners/new",
        title: {
          "tr-TR": "Formu doldur ve kaydet",
          "en-GB": "Fill the form and save",
        },
        description: {
          "tr-TR":
            "Ad, soyad, telefon, e-posta, adres ve KVKK onayı zorunludur.",
          "en-GB":
            "First name, last name, phone, e-mail, address and GDPR consent are required.",
        },
        action: "submit",
        required_permission: "clinic:owner:create",
      },
    ],
  },

  // --- 2) HAYVAN KAYDI ---------------------------------------------------------
  {
    id: "create-patient",
    category: "patient_owner",
    module: "clinic",
    triggers: [
      "yeni hayvan",
      "hayvan ekle",
      "hasta kaydı",
      "pet kayıt",
      "yavru kayıt",
      "add new patient",
      "register pet",
      "add animal",
    ],
    title: {
      "tr-TR": "Yeni hayvan (hasta) kaydı",
      "en-GB": "Register a new patient (animal)",
    },
    summary: {
      "tr-TR": "Kliniğe gelen yeni bir hayvanı sisteme ekleme adımları.",
      "en-GB": "Steps to register a new animal in the clinic system.",
    },
    roles: ["STAFF", "VETERINARIAN", "OWNER"],
    related_chunks: ["flow-patient_create"],
    related_pages: ["web.app.locale.clinic.patients"],
    related_api: ["POST /api/v1/clinic/patients"],
    steps: [
      {
        order: 1,
        route: "/[locale]/clinic/patients",
        title: {
          "tr-TR": "Hasta listesi sayfasını aç",
          "en-GB": "Open the patients list page",
        },
        description: {
          "tr-TR": "Sol menüden 'Hayvanlar / Hastalar' bağlantısına tıklayın.",
          "en-GB": "Click 'Patients' in the left menu.",
        },
        action: "navigate",
        required_permission: "clinic:patient:read",
        highlight: true,
      },
      {
        order: 2,
        route: "/[locale]/clinic/patients",
        title: {
          "tr-TR": "Yeni Hasta butonuna tıkla",
          "en-GB": "Click 'New Patient'",
        },
        description: {
          "tr-TR": "Sağ üstteki 'Yeni Hasta' butonu ile form açılır.",
          "en-GB": "Click the 'New Patient' button on the top right.",
        },
        action: "open_form",
        required_permission: "clinic:patient:create",
      },
      {
        order: 3,
        route: "/[locale]/clinic/patients/new",
        title: {
          "tr-TR": "Sahibi seç veya oluştur",
          "en-GB": "Select or create the owner",
        },
        description: {
          "tr-TR": "Önce sahibi seçin; sahip yoksa 'Yeni Sahip' ile ekleyin.",
          "en-GB":
            "Select an existing owner or create a new one with 'New Owner'.",
        },
        action: "select_owner",
        required_permission: "clinic:patient:create",
      },
      {
        order: 4,
        route: "/[locale]/clinic/patients/new",
        title: {
          "tr-TR": "Hayvan bilgilerini gir",
          "en-GB": "Enter animal details",
        },
        description: {
          "tr-TR":
            "Tür, ırk, doğum tarihi, cinsiyet, mikroçip (varsa) zorunludur.",
          "en-GB":
            "Species, breed, birth date, sex, microchip (if any) are required.",
        },
        action: "submit",
        required_permission: "clinic:patient:create",
        highlight: true,
      },
    ],
  },

  // --- 3) RANDEVU OLUŞTURMA ----------------------------------------------------
  {
    id: "create-appointment",
    category: "appointment",
    module: "appointments",
    triggers: [
      "randevu al",
      "randevu oluştur",
      "randevu nasıl",
      "randevu ekle",
      "appointment create",
      "book appointment",
      "schedule appointment",
    ],
    title: {
      "tr-TR": "Randevu oluşturma",
      "en-GB": "Create an appointment",
    },
    summary: {
      "tr-TR": "Telefon, içeriden veya portal üzerinden randevu alma adımları.",
      "en-GB":
        "Steps to book an appointment by phone, in-clinic or via the portal.",
    },
    roles: ["STAFF", "VETERINARIAN", "OWNER"],
    related_chunks: ["flow-appointment_create"],
    related_pages: ["web.app.locale.clinic.calendar"],
    related_api: ["POST /api/v1/clinic/appointments"],
    steps: [
      {
        order: 1,
        route: "/[locale]/clinic/calendar",
        title: {
          "tr-TR": "Takvim sayfasını aç",
          "en-GB": "Open the calendar page",
        },
        description: {
          "tr-TR": "Sol menüden 'Takvim' bağlantısına tıklayın.",
          "en-GB": "Click 'Calendar' in the left menu.",
        },
        action: "navigate",
        required_permission: "clinic:appointment:read",
        highlight: true,
      },
      {
        order: 2,
        route: "/[locale]/clinic/calendar",
        title: {
          "tr-TR": "Uygun saat slotuna tıkla",
          "en-GB": "Click an available time slot",
        },
        description: {
          "tr-TR":
            "Açılan hızlı formda sahibi, hayvanı, hizmeti ve notu girin.",
          "en-GB": "Pick owner, pet, service and notes in the quick form.",
        },
        action: "open_form",
        required_permission: "clinic:appointment:create",
      },
      {
        order: 3,
        route: "/[locale]/clinic/calendar",
        title: {
          "tr-TR": "Rezerve Et",
          "en-GB": "Reserve",
        },
        description: {
          "tr-TR": "'Rezerve Et' butonu ile sistem uygunluk kontrolü yapar.",
          "en-GB":
            "'Reserve' button validates availability and creates the appointment.",
        },
        action: "submit",
        required_permission: "clinic:appointment:create",
      },
    ],
  },

  // --- 4) AŞI KAYDI ------------------------------------------------------------
  {
    id: "record-vaccination",
    category: "vaccination",
    module: "vaccinations",
    triggers: [
      "aşı kaydı",
      "aşı nasıl",
      "aşı uygula",
      "aşı yap",
      "aşı ekle",
      "vaccination record",
      "record vaccine",
      "apply vaccine",
    ],
    title: {
      "tr-TR": "Aşı kaydı (uygulama) oluşturma",
      "en-GB": "Record a vaccination",
    },
    summary: {
      "tr-TR": "Bir hayvana aşı uygulaması kaydetme adımları.",
      "en-GB": "Steps to record a vaccine application.",
    },
    roles: ["VETERINARIAN", "STAFF", "OWNER"],
    related_chunks: ["flow-vaccination_record"],
    related_pages: ["web.app.locale.clinic.patients"],
    related_api: ["POST /api/v1/clinic/vaccines/applications"],
    steps: [
      {
        order: 1,
        route: "/[locale]/clinic/patients/{patientId}",
        title: {
          "tr-TR": "Hasta detay sayfasını aç",
          "en-GB": "Open the patient detail page",
        },
        description: {
          "tr-TR": "Hasta listesinden hayvanın detay sayfasını açın.",
          "en-GB": "Open the patient detail from the patients list.",
        },
        action: "navigate",
        required_permission: "clinic:patient:read",
      },
      {
        order: 2,
        route: "/[locale]/clinic/patients/{patientId}/vaccinations/new",
        title: {
          "tr-TR": "Yeni Aşı butonuna tıkla",
          "en-GB": "Click 'New Vaccination'",
        },
        description: {
          "tr-TR": "Aşı kartı sekmesinden 'Yeni Aşı' butonuna tıklayın.",
          "en-GB": "Click 'New Vaccination' in the vaccine card tab.",
        },
        action: "open_form",
        required_permission: "clinic:vaccine:apply",
        highlight: true,
      },
      {
        order: 3,
        route: "/[locale]/clinic/patients/{patientId}/vaccinations/new",
        title: {
          "tr-TR": "Aşı, lot ve uygulama bilgisi",
          "en-GB": "Pick vaccine, lot, application",
        },
        description: {
          "tr-TR":
            "Katalogdan aşı seçin, lot numarası ve uygulama yolunu girin.",
          "en-GB": "Pick the vaccine from the catalog and fill lot + route.",
        },
        action: "submit",
        required_permission: "clinic:vaccine:apply",
        highlight: true,
      },
    ],
  },

  // --- 5) STOK DÜŞÜMÜ ----------------------------------------------------------
  {
    id: "stock-movement",
    category: "inventory",
    module: "inventory",
    triggers: [
      "stok düş",
      "stok hareketi",
      "stok çıkışı",
      "stok ekle",
      "stock movement",
      "stock out",
      "stock in",
    ],
    title: {
      "tr-TR": "Stok hareketi (giriş / çıkış) oluşturma",
      "en-GB": "Create a stock movement",
    },
    summary: {
      "tr-TR": "Depo / raf / lot üzerinden stok girişi veya çıkışı oluşturma.",
      "en-GB": "Create a stock in/out movement for a lot.",
    },
    roles: ["STAFF", "VETERINARIAN", "OWNER"],
    related_chunks: ["flow-stock_movement"],
    related_pages: ["web.app.locale.inventory"],
    related_api: ["POST /api/v1/inventory/stock-movements"],
    steps: [
      {
        order: 1,
        route: "/[locale]/inventory/stock-movements",
        title: {
          "tr-TR": "Stok hareketleri sayfasını aç",
          "en-GB": "Open the stock movements page",
        },
        description: {
          "tr-TR": "Sol menüden 'Stok Hareketleri' bağlantısına tıklayın.",
          "en-GB": "Click 'Stock Movements' in the left menu.",
        },
        action: "navigate",
        required_permission: "inventory:stock:read",
      },
      {
        order: 2,
        route: "/[locale]/inventory/stock-movements",
        title: {
          "tr-TR": "Hareket tipi seç (giriş/çıkış)",
          "en-GB": "Pick movement type (in/out)",
        },
        description: {
          "tr-TR": "Üst sağdaki 'Yeni Hareket' butonu ile tipi seçin.",
          "en-GB": "Click 'New Movement' and pick the type.",
        },
        action: "open_form",
        required_permission: "inventory:stock:write",
      },
      {
        order: 3,
        route: "/[locale]/inventory/stock-movements/new",
        title: {
          "tr-TR": "Lot, miktar ve neden gir",
          "en-GB": "Enter lot, quantity and reason",
        },
        description: {
          "tr-TR": "Lot seçin, miktar ve hareket nedeni zorunludur.",
          "en-GB": "Pick a lot and enter quantity + reason.",
        },
        action: "submit",
        required_permission: "inventory:stock:write",
        highlight: true,
      },
    ],
  },

  // --- 6) PETSHOP SATIŞ --------------------------------------------------------
  {
    id: "petshop-sale",
    category: "petshop",
    module: "petshop",
    triggers: [
      "petshop satış",
      "satış yap",
      "pos satış",
      "petshop pos",
      "petshop sale",
      "make a sale",
    ],
    title: {
      "tr-TR": "Petshop POS satışı",
      "en-GB": "Petshop POS sale",
    },
    summary: {
      "tr-TR": "Petshop / mağaza ürünlerinde yeni satış oluşturma.",
      "en-GB": "Create a new sale in the petshop POS.",
    },
    roles: ["STAFF", "OWNER"],
    related_chunks: ["flow-petshop_sale"],
    related_pages: ["web.app.locale.petshop.sales"],
    related_api: ["POST /api/v1/petshop/sales"],
    steps: [
      {
        order: 1,
        route: "/[locale]/petshop/sales",
        title: {
          "tr-TR": "Petshop satış ekranını aç",
          "en-GB": "Open the petshop sales screen",
        },
        description: {
          "tr-TR": "Sol menüden 'Petshop → Satışlar' bağlantısına tıklayın.",
          "en-GB": "Click 'Petshop → Sales' in the left menu.",
        },
        action: "navigate",
        required_permission: "petshop:sale:read",
        highlight: true,
      },
      {
        order: 2,
        route: "/[locale]/petshop/sales/new",
        title: {
          "tr-TR": "Ürünleri sepete ekle",
          "en-GB": "Add items to the cart",
        },
        description: {
          "tr-TR": "Barkod okutarak veya ürün arayarak ürünleri ekleyin.",
          "en-GB": "Add items by scanning a barcode or searching the catalog.",
        },
        action: "add_to_cart",
        required_permission: "petshop:sale:create",
      },
      {
        order: 3,
        route: "/[locale]/petshop/sales/new",
        title: {
          "tr-TR": "Ödeme al ve satışı tamamla",
          "en-GB": "Take payment and complete sale",
        },
        description: {
          "tr-TR": "Ödeme yöntemini (nakit/kart/havale) seçin ve 'Onayla'.",
          "en-GB": "Pick a payment method (cash/card/transfer) and 'Confirm'.",
        },
        action: "submit",
        required_permission: "petshop:sale:create",
      },
    ],
  },

  // --- 7) TAHSİLAT -------------------------------------------------------------
  {
    id: "payment-collection",
    category: "billing",
    module: "billing",
    triggers: [
      "tahsilat",
      "ödeme al",
      "borç öde",
      "fatura öde",
      "collect payment",
      "take payment",
      "invoice payment",
    ],
    title: {
      "tr-TR": "Tahsilat (ödeme) alma",
      "en-GB": "Collect a payment",
    },
    summary: {
      "tr-TR": "Açık fatura için tahsilat kaydı oluşturma.",
      "en-GB": "Create a payment record for an open invoice.",
    },
    roles: ["STAFF", "OWNER"],
    related_chunks: ["flow-payment_collection"],
    related_pages: ["web.app.locale.billing.invoices"],
    related_api: ["POST /api/v1/payments"],
    steps: [
      {
        order: 1,
        route: "/[locale]/billing/invoices",
        title: {
          "tr-TR": "Faturalar sayfasını aç",
          "en-GB": "Open the invoices page",
        },
        description: {
          "tr-TR": "Sol menüden 'Faturalar' bağlantısına tıklayın.",
          "en-GB": "Click 'Invoices' in the left menu.",
        },
        action: "navigate",
        required_permission: "billing:invoice:read",
      },
      {
        order: 2,
        route: "/[locale]/billing/invoices/{invoiceId}",
        title: {
          "tr-TR": "Tahsil Et butonuna tıkla",
          "en-GB": "Click 'Collect'",
        },
        description: {
          "tr-TR": "Açık faturada 'Tahsil Et' butonu ödeme formunu açar.",
          "en-GB": "Click 'Collect' on an open invoice.",
        },
        action: "open_form",
        required_permission: "billing:payment:create",
        highlight: true,
      },
      {
        order: 3,
        route: "/[locale]/billing/invoices/{invoiceId}/collect",
        title: {
          "tr-TR": "Ödeme yöntemini seç ve kaydet",
          "en-GB": "Pick payment method and save",
        },
        description: {
          "tr-TR": "Tutar ve ödeme yöntemini seçin, kasa ile eşleştirin.",
          "en-GB": "Pick amount and method, link to a cash session.",
        },
        action: "submit",
        required_permission: "billing:payment:create",
      },
    ],
  },

  // --- 8) LAB SONUÇ GİRİŞİ -----------------------------------------------------
  {
    id: "lab-result-entry",
    category: "laboratory",
    module: "laboratory",
    triggers: [
      "lab sonuç",
      "lab sonucu gir",
      "tetkik sonucu",
      "lab result",
      "enter lab result",
    ],
    title: {
      "tr-TR": "Laboratuvar sonucu girme",
      "en-GB": "Enter a lab result",
    },
    summary: {
      "tr-TR": "Tamamlanmış bir laboratuvar isteği için sonuç kaydetme.",
      "en-GB": "Record a result for a completed lab order.",
    },
    roles: ["VETERINARIAN", "STAFF"],
    related_chunks: ["flow-lab_result_entry"],
    related_pages: ["web.app.locale.clinic.lab-orders"],
    related_api: ["POST /api/v1/clinic/lab-orders/:orderId/result"],
    steps: [
      {
        order: 1,
        route: "/[locale]/clinic/lab-orders",
        title: {
          "tr-TR": "Lab istekleri sayfasını aç",
          "en-GB": "Open the lab orders page",
        },
        description: {
          "tr-TR":
            "Sol menüden 'Laboratuvar → İstekler' bağlantısına tıklayın.",
          "en-GB": "Click 'Lab → Orders' in the left menu.",
        },
        action: "navigate",
        required_permission: "clinic:lab_order:read",
      },
      {
        order: 2,
        route: "/[locale]/clinic/lab-orders/{orderId}",
        title: {
          "tr-TR": "Sonuç Gir butonuna tıkla",
          "en-GB": "Click 'Enter Result'",
        },
        description: {
          "tr-TR": "Detay sayfasında 'Sonuç Gir' butonu formu açar.",
          "en-GB": "Click 'Enter Result' on the detail page.",
        },
        action: "open_form",
        required_permission: "clinic:lab_result:create",
        highlight: true,
      },
      {
        order: 3,
        route: "/[locale]/clinic/lab-orders/{orderId}/result",
        title: {
          "tr-TR": "Analyte + değer + flag gir",
          "en-GB": "Enter analyte + value + flag",
        },
        description: {
          "tr-TR": "Analyte, değer, birim ve abnormal flag seçilir.",
          "en-GB": "Pick analyte, value, unit and abnormal flag.",
        },
        action: "submit",
        required_permission: "clinic:lab_result:create",
      },
    ],
  },

  // --- 9) PORTAL: SAHİBİN HAYVANLARINI GÖRME -----------------------------------
  {
    id: "portal-view-pets",
    category: "portal",
    module: "portal",
    triggers: [
      "portal",
      "hayvanlarım",
      "kendi hayvanım",
      "portal giriş",
      "my pets",
      "portal login",
    ],
    title: {
      "tr-TR": "Portal: hayvanlarımı görüntüleme",
      "en-GB": "Portal: view my pets",
    },
    summary: {
      "tr-TR":
        "Hasta sahibi portalına giriş yaparak kendi hayvanlarını görüntüleme.",
      "en-GB": "Sign in to the patient owner portal to view your pets.",
    },
    roles: ["PET_OWNER_PORTAL"],
    related_chunks: ["flow-portal_pets"],
    related_pages: ["web.app.locale.portal.pets"],
    related_api: ["GET /api/v1/portal-pets"],
    steps: [
      {
        order: 1,
        route: "/[locale]/login",
        title: {
          "tr-TR": "Portal giriş sayfası",
          "en-GB": "Open the portal login",
        },
        description: {
          "tr-TR": "Portal URL'sine gidin ve e-posta/şifre ile giriş yapın.",
          "en-GB": "Go to the portal URL and sign in with email/password.",
        },
        action: "navigate",
        highlight: true,
      },
      {
        order: 2,
        route: "/[locale]/portal/pets",
        title: {
          "tr-TR": "Hayvanlarım listesi",
          "en-GB": "My pets list",
        },
        description: {
          "tr-TR": "Sol menüden 'Hayvanlarım' açılır.",
          "en-GB": "Click 'My Pets' in the menu.",
        },
        action: "navigate",
      },
      {
        order: 3,
        route: "/[locale]/portal/pets/{petId}",
        title: {
          "tr-TR": "Detay",
          "en-GB": "Detail",
        },
        description: {
          "tr-TR": "Aşı kartı, randevu ve sağlık kayıtları görüntülenir.",
          "en-GB": "Vaccine card, appointments and medical records are listed.",
        },
        action: "open_detail",
      },
    ],
  },

  // --- 10) SUPERADMIN: TENANT YÖNETİMİ ----------------------------------------
  {
    id: "superadmin-tenant",
    category: "admin",
    module: "core",
    triggers: [
      "tenant yönet",
      "yeni tenant",
      "superadmin",
      "manage tenants",
      "new tenant",
    ],
    title: {
      "tr-TR": "Superadmin: tenant yönetimi",
      "en-GB": "Superadmin: manage tenants",
    },
    summary: {
      "tr-TR": "Yeni tenant oluşturma veya mevcut tenant'ı yönetme.",
      "en-GB": "Create a new tenant or manage an existing one.",
    },
    roles: ["SUPERADMIN"],
    related_chunks: ["flow-superadmin_tenant"],
    related_pages: ["web.superadmin.locale.tenants"],
    related_api: ["POST /api/v1/superadmin/tenants"],
    steps: [
      {
        order: 1,
        route: "/[locale]/superadmin/tenants",
        title: {
          "tr-TR": "Tenant listesi",
          "en-GB": "Tenant list",
        },
        description: {
          "tr-TR": "Superadmin panelinden 'Tenantlar' sayfasını açın.",
          "en-GB": "Open 'Tenants' in the superadmin panel.",
        },
        action: "navigate",
        required_permission: "superadmin:tenant:read",
        highlight: true,
      },
      {
        order: 2,
        route: "/[locale]/superadmin/tenants",
        title: {
          "tr-TR": "Yeni Tenant",
          "en-GB": "New Tenant",
        },
        description: {
          "tr-TR": "Sağ üstteki 'Yeni Tenant' ile form açılır.",
          "en-GB": "Click 'New Tenant' on the top right.",
        },
        action: "open_form",
        required_permission: "superadmin:tenant:create",
      },
      {
        order: 3,
        route: "/[locale]/superadmin/tenants/new",
        title: {
          "tr-TR": "Tenant bilgisi ve paket seçimi",
          "en-GB": "Tenant info and plan",
        },
        description: {
          "tr-TR":
            "Ülke, paket ve özellikleri seçin, yönetici kullanıcı atayın.",
          "en-GB": "Pick country, plan and features, assign an admin user.",
        },
        action: "submit",
        required_permission: "superadmin:tenant:create",
      },
    ],
  },
];

/**
 * Onboarding servisi. Tek bir DI instance; senaryolar sabit
 * koddan gelir. Public metotlar:
 *
 * - `ask(input, actor)` → kullanıcı sorusunu yanıtla
 * - `listScenarios(role, enabledModules)` → role/modül-bazlı liste
 * - `isMedicalRefusal(query, locale)` → dışarıdan test edilebilir.
 * @since GOAL-117 (FAZ-11)
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  /**
   * Tüm senaryoları role/modül filtresinden geçirerek döner.
   * `enabledModules` boşsa modül filtresi uygulanmaz (tümü
   * varsayılır).
   * @param role
   * @param enabledModules
   */
  public listScenarios(
    role: OnboardingRole,
    enabledModules?: ReadonlyArray<ModuleKey> | null,
  ): OnboardingScenarioListResponse {
    const filtered = ONBOARDING_SCENARIOS.filter((sc) =>
      this.isScenarioVisible(sc, role, enabledModules ?? null),
    );

    return {
      role,
      totalScenarios: ONBOARDING_SCENARIOS.length,
      scenarios: filtered.map((sc) => ({
        id: sc.id,
        category: sc.category,
        module: sc.module,
        title: this.localizeString(sc.title, this.detectLocale()),
        summary: this.localizeString(sc.summary, this.detectLocale()),
        stepCount: sc.steps.length,
        highlight: sc.steps.some((s) => s.highlight === true),
      })),
    };
  }

  /**
   * Kullanıcı sorusunu yanıtla. Sıralama:
   * 1. Tıbbi reddi kontrol et → varsa `refusal` döner.
   * 2. Trigger eşleşmesi ara; en iyi 1 senaryo + 2 alternatif döner.
   * 3. Eşleşme yoksa out_of_scope mesajı.
   *
   * `currentPage` verildiyse senaryo adımları kullanıcının
   * bulunduğu sayfaya yakınsa highlight yapılır.
   * @param input
   * @param actor
   */
  public ask(
    input: OnboardingAskInput,
    actor: ActorContext,
  ): OnboardingAskResponse {
    const start = Date.now();
    const queryId = `ob-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    // 1) Tıbbi reddi
    const refusal = this.detectMedicalRefusal(input.query, input.locale);
    if (refusal) {
      this.logger.warn({
        msg: "onboarding.ask.refusal",
        query_id: queryId,
        reason: refusal,
        locale: input.locale,
        tenant_id: actor.tenantId,
        role: actor.role,
      });
      return {
        query_id: queryId,
        answer: this.refusalMessage(refusal, input.locale),
        generationSource: "refusal",
        duration_ms: Date.now() - start,
        refusalReason: refusal,
      };
    }

    // 2) Senaryo eşleşmesi
    const role = this.toOnboardingRole(actor.role);
    const enabledModules = this.parseEnabledModules(input.enabledModules);
    const normalized = this.normalize(input.query);

    const candidates = ONBOARDING_SCENARIOS.map((sc) => ({
      scenario: sc,
      score: this.scoreScenario(sc, normalized, input.currentPage),
    }))
      .filter((c) => c.score > 0)
      .filter((c) =>
        this.isScenarioVisible(c.scenario, role, enabledModules ?? null),
      )
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      this.logger.log({
        msg: "onboarding.ask.out_of_scope",
        query_id: queryId,
        locale: input.locale,
        tenant_id: actor.tenantId,
        role: actor.role,
      });
      return {
        query_id: queryId,
        answer: this.outOfScopeMessage(input.locale),
        generationSource: "retrieval",
        duration_ms: Date.now() - start,
      };
    }

    const [best, ...rest] = candidates;
    if (!best) {
      // Defensive: TS narrowing için (filter sonrası en az 1 kayıt olmalı)
      return {
        query_id: queryId,
        answer: this.outOfScopeMessage(input.locale),
        generationSource: "retrieval",
        duration_ms: Date.now() - start,
      };
    }

    const localized = this.localizeScenario(best.scenario, input.locale);

    this.logger.log({
      msg: "onboarding.ask.match",
      query_id: queryId,
      scenario_id: best.scenario.id,
      scenario_score: best.score,
      alternatives: rest.length,
      locale: input.locale,
      tenant_id: actor.tenantId,
      role: actor.role,
    });

    return {
      query_id: queryId,
      answer: localized.summary,
      generationSource: "template",
      scenario: localized,
      alternatives: rest.slice(0, 2).map((c) => ({
        id: c.scenario.id,
        title: this.localizeString(c.scenario.title, input.locale),
        score: c.score,
      })),
      duration_ms: Date.now() - start,
    };
  }

  /**
   * Tıbbi reddi tespit eder. `null` dönerse soru güvenli.
   * Dışarıdan test edilebilir (spec dosyasında).
   *
   * Eşleşme kuralı:
   * - `<rakam>+birim` (örn. "5 mg", "10 ml") → doz sorgusu.
   * - Anahtar kelime sözlüğündeki her satır için:
   *   (a) doğrudan substring eşleşmesi VEYA
   *   (b) anahtar kelimenin 4+ char'lık TÜM kelimelerinin
   *       sorguda tam/prefix eşleşme yapması.
   * Reddi nedeni eşleşen satırın `category` alanından gelir;
   * "doz" kelimesinin geçtiği anahtar satırda bile "tedavi"
   * kelimesi de varsa "treatment" dönülür (kategoriye bağlı).
   * @param query
   * @param locale
   */
  public detectMedicalRefusal(
    query: string,
    locale: OnboardingAskInput["locale"],
  ): OnboardingRefusalReason | null {
    const n = this.normalize(query);
    const queryWords = new Set(n.split(/\s+/).filter((w) => w.length > 0));

    // Doz sorgusu en yüksek öncelik (sıralama önemli).
    if (/\b\d+\s?(mg|ml|kg|iu|mg\/kg|doz|dose)\b/.test(n)) {
      return "dosage";
    }

    const keywords =
      locale === "tr-TR"
        ? MEDICAL_REFUSAL_KEYWORDS_TR
        : MEDICAL_REFUSAL_KEYWORDS_EN;

    for (const { keyword, category } of keywords) {
      const nkw = this.normalize(keyword);
      if (nkw.length < 4) continue;
      const directHit = n.includes(nkw);
      const kwWords = nkw.split(/\s+/).filter((w) => w.length >= 4);
      let wordPrefixHit = false;
      if (kwWords.length > 0) {
        wordPrefixHit = kwWords.every((kwW) => {
          if (queryWords.has(kwW)) return true;
          for (const qw of queryWords) {
            if (qw.length > kwW.length && qw.startsWith(kwW)) return true;
          }
          return false;
        });
      }
      if (!directHit && !wordPrefixHit) continue;
      return category;
    }
    return null;
  }

  // --- internal helpers -------------------------------------------------------

  /**
   * Senaryo bu role + modül setinde görünür mü?
   * @param scenario
   * @param role
   * @param enabledModules
   */
  private isScenarioVisible(
    scenario: OnboardingScenario,
    role: OnboardingRole,
    enabledModules: ReadonlyArray<ModuleKey> | null,
  ): boolean {
    if (!scenario.roles.includes(role)) {
      return false;
    }
    if (enabledModules && scenario.module !== "core") {
      if (!enabledModules.includes(scenario.module)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Trigger kelimelerine göre eşleşme skoru. CurrentPage verildiyse
   * o sayfayla ilgili senaryolara küçük bonus.
   *
   * Eşleşme kuralı:
   * - Tam trigger phrase sorguya substring ise → +25 (çok güçlü)
   * - Aksi halde, her trigger kelimesi (>=4 char) için sorgu
   *   kelimelerinden tam eşleşme ya da prefix eşleşme → +5.
   *   Bu sayede "pet" tetikleyicisi "petshop" sorgusuna yanlış
   *   pozitif dönmez; "ekle" tetikleyicisi "eklenir" sözcüğüne
   *   eşleşmez.
   * @param scenario
   * @param normalizedQuery
   * @param currentPage
   */
  private scoreScenario(
    scenario: OnboardingScenario,
    normalizedQuery: string,
    currentPage: string | undefined,
  ): number {
    const queryWords = new Set(
      normalizedQuery.split(/\s+/).filter((w) => w.length > 0),
    );
    let score = 0;
    for (const trigger of scenario.triggers) {
      const t = this.normalize(trigger);
      if (normalizedQuery.includes(t)) {
        if (normalizedQuery === t) {
          score += 100;
        } else {
          score += 25;
        }
      } else {
        const words = t.split(" ").filter((w) => w.length >= 4);
        for (const w of words) {
          if (queryWords.has(w)) {
            score += 5;
          } else {
            for (const qw of queryWords) {
              if (qw.length > w.length && qw.startsWith(w)) {
                // Sorgu kelimesi tetikleyici kelimesinin ekli
                // hâli olabilir (örn. "tanısı" ↔ "tanı").
                score += 5;
                break;
              }
            }
          }
        }
      }
    }
    if (currentPage && scenario.related_pages) {
      for (const rp of scenario.related_pages) {
        if (currentPage.includes(rp.replace("web.app.locale.", ""))) {
          score += 10;
        }
      }
    }
    return score;
  }

  private normalize(value: string): string {
    return value
      .toLocaleLowerCase("tr-TR")
      .replace(/[?!.,;:()"'`]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private detectLocale(): OnboardingAskInput["locale"] {
    // Process ortamından veya default'tan tr-TR; UI tarafı açıkça
    // göndermediğinde test/dev ortamında bile deterministik
    // davranmak için fallback.
    return "tr-TR";
  }

  private toOnboardingRole(role: ActorRole): OnboardingRole {
    // SYSTEM ve PET_OWNER_PORTAL dışındaki roller OnboardingRole
    // tarafından kabul edilmiyor; SYSTEM'i OWNER'a indirge ki
    // internal job'lar da asistanı kullanabilsin.
    if (role === "SYSTEM") return "OWNER";
    return role;
  }

  private parseEnabledModules(
    enabled: OnboardingAskInput["enabledModules"],
  ): ReadonlyArray<ModuleKey> | null {
    if (!enabled || enabled.length === 0) return null;
    const valid = enabled.filter((m): m is ModuleKey => isModuleKey(m));
    return valid;
  }

  private localizeString(
    value: { "tr-TR": string; "en-GB": string },
    locale: OnboardingAskInput["locale"],
  ): string {
    return locale === "tr-TR" ? value["tr-TR"] : value["en-GB"];
  }

  private localizeScenario(
    scenario: OnboardingScenario,
    locale: OnboardingAskInput["locale"],
  ): LocalizedOnboardingScenario {
    return {
      ...scenario,
      title: this.localizeString(scenario.title, locale),
      summary: this.localizeString(scenario.summary, locale),
      steps: scenario.steps.map((s) => ({
        ...s,
        title: this.localizeString(s.title, locale),
        description: this.localizeString(s.description, locale),
      })),
    };
  }

  private refusalMessage(
    reason: OnboardingRefusalReason,
    locale: OnboardingAskInput["locale"],
  ): string {
    // `reason` parametresi UI tarafına `refusalReason` alanı
    // üzerinden ayrıca dönüyor; mesaj metni kategoriden bağımsız
    // olarak ortak.
    void reason;
    if (locale === "tr-TR") {
      return (
        "Bu soru tıbbi/tedavi/ilaç dozu kapsamına girdiği için yanıt veremem. " +
        "Lütfen klinik personeline veya veteriner hekiminize danışın. " +
        "Ben yalnızca uygulama kullanımı (sayfalar, butonlar, adımlar) konusunda yardımcı olurum."
      );
    }
    return (
      "I cannot answer this question as it falls under medical / treatment / " +
      "dosage scope. Please consult clinic staff or your veterinarian. " +
      "I can only help with app usage (pages, buttons, steps)."
    );
  }

  private outOfScopeMessage(locale: OnboardingAskInput["locale"]): string {
    if (locale === "tr-TR") {
      return (
        "Bu konu için uygun bir uygulama adımı bulunamadı. " +
        "Örnekler: 'aşı kaydı nasıl yapılır?', 'randevu nasıl alınır?', 'stok düşümü nasıl yapılır?'. " +
        "Soruyu bu örnekler gibi yeniden ifade edersen yardımcı olabilirim."
      );
    }
    return (
      "No app-usage step was found for this question. " +
      "Try: 'how to record a vaccination?', 'how to book an appointment?', 'how to make a stock out?'."
    );
  }
}
