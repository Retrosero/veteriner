# VetNiva — Apple Esintili Yeşil Tasarım Promptu

Bu doküman Google Stitch için hazırlanmıştır. Her ekran üretiminde önce
**Ana Tasarım Promptu**, ardından ilgili **ekran promptu** kullanılmalıdır.
Prompt dili İngilizcedir; ekranda görünen bütün metinler Türkçe olmalıdır.

> Hedef: Apple ürünlerinin dingin, özenli, premium ve anlaşılır hissinden
> ilham alan; fakat Apple arayüzünü kopyalamayan, VetNiva’ya özgü modern
> veteriner klinik yönetim uygulaması.

---

## Ana Tasarım Promptu — Her Ekrana Ekle

```text
Design a premium, production-ready, desktop-first veterinary clinic management application called “VetNiva”. It is a secure SaaS app for veterinary clinics and petshops in Türkiye. Create high-fidelity product UI, never a marketing landing page. All visible interface text must be Turkish (tr-TR) with correct Turkish characters and realistic veterinary data; never use lorem ipsum.

DESIGN CHARACTER
Create an original interface inspired by the clarity, restraint, spaciousness, material quality and calm confidence associated with premium Apple software. Do NOT copy Apple UI, icons, layouts, proprietary controls or branding. The result must feel distinctly VetNiva: warm, clinical, trustworthy, modern and efficient for a busy veterinary team.

COLOR AND MATERIAL SYSTEM
- Primary visual direction: luminous white surfaces and refined veterinary green, with soft natural green tints. Avoid blue as the primary brand color.
- Background: #F7F8F7, main elevated surfaces: #FFFFFF, subtle grouped surface: #F1F5F1, table header: #F6F8F6.
- Primary VetNiva green: #167A4A. Hover/pressed: #10633B. Deep green text/identity: #0D4D2E. Soft selected green: #E6F4EC. Pale green wash: #F0F8F3.
- Text: #1D1D1F primary, #5F6368 secondary, #86868B tertiary. Border: #E1E5E2. Divider: #ECEFED.
- Status colors: success #248A3D with pale #EAF6EC; warning #B86B00 with pale #FFF4E5; danger #C3362C with pale #FCEBEA; information #2775B6 with pale #EAF3FB. Always pair status color with label and icon.
- Use large areas of white and purposeful whitespace. Green is an accent for actions, selection, positive status, progress and brand moments — do not flood every card with green.
- No gradients, no neon green, no harsh black surfaces, no glassmorphism, no overly glossy effects, no large decorative illustrations.

TYPOGRAPHY, SPACING, SHAPE
- Use SF Pro Display / SF Pro Text if available; otherwise Inter. Excellent Turkish character support is required.
- Type scale: 28px page title / 34px line-height semibold; 20px section title; 17px body; 15px table/form body; 13px label/utility; 11–12px metadata. Use tabular numerals for dates, quantities and monetary values.
- Airy but operational: 8px spacing base; 16px standard component gap; 24px section gap; 32px between major sections. Page gutters 32px desktop and 16px mobile.
- Rounded corners: 14px for primary panels, 10px for controls, 999px only for chips, toggles and avatars. Use exceptionally subtle 1px borders and restrained elevation: 0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(20,45,30,.06) only for menus/modals.
- Icons: thin, rounded, familiar outline icons, 18–20px, consistent stroke width. Do not use emoji as UI icons.

APP SHELL — IDENTICAL ON EVERY AUTHENTICATED SCREEN
- Desktop left sidebar: 248px wide, warm white, fine right divider. Top brand area has a 34px deep-green rounded-square with a simple original white leaf-and-paw mark, “VetNiva” wordmark, and subtitle “Klinik Yönetimi” in muted text.
- Navigation items: Anasayfa, Hastalar, Randevular, Muayene, Aşılar, Petshop, Finans. Footer group: Ayarlar, Çıkış. Each has a thin rounded icon.
- Active navigation: soft green #E6F4EC surface, deep green icon and text, 10px radius, no heavy left stripe. Hover is #F1F5F1. Inactive text is #4B5563.
- Top bar: 72px high, transparent/page background visually blending with content; no heavy bar. Left displays small breadcrumb then page title. Right: command-style global search “Ara…”, notification icon, compact clinic switcher “Pati Klinik”, circular user avatar “DY”. Use a clean 1px divider only if necessary.
- Main content max width 1600px. Use an intentional editorial layout: clear title zone, concise subtitle, then content sections. Do not place every item inside separate cards.
- Mobile at 390px: sidebar becomes a clean full-height drawer; header keeps menu, short title, notifications, avatar. Keep generous 16px edge spacing and use bottom sheets for filters/drawers.

COMPONENT SYSTEM
- Primary button: VetNiva green fill #167A4A, white text, 42px high, 10px radius, medium weight, understated plus icon when appropriate. Hover #10633B, pressed darker, loading spinner plus “Kaydediliyor…”.
- Secondary button: white fill, #E1E5E2 1px border, #1D1D1F text, 42px high. Hover pale green, never use heavy shadows.
- Tertiary action: text-only deep green with a 36px hover surface. Destructive action is red text/border and always requires confirmation.
- Inputs: 44px high, white, 1px #D5DBD7 border, 10px radius, 15px text. Focus: #167A4A border plus 3px low-opacity green ring. Labels above, helper/error below. Never use placeholder as the only label.
- Segmented controls: grouped white background with border; selected segment has white surface, small shadow and deep-green text. Use for calendar view and compact mode selection.
- Toggle: soft gray track, green active track, accessible label to the left. Do not use toggles for irreversible actions.
- Chips: compact soft-color pill with 12px text, status icon and label. Examples: “Planlandı”, “Bekliyor”, “Muayenede”, “Tamamlandı”, “İptal”, “Gecikmiş”.
- Toast: compact floating bottom-right card, icon, Turkish message, dismiss control. Use a green check for success, not a full green panel.

TABLE, SEARCH, FILTER AND SORTING SYSTEM
- Data lists use one spacious bordered white panel, 14px radius, not many nested cards. Its top toolbar is 64px high and its table header is soft gray-green (#F6F8F6).
- Toolbar left: search input with magnifier and contextual placeholder; “Filtrele” button with funnel icon and active-filter count; optional compact quick-filter chips. Right: “Sütunlar”, “Dışa aktar” and the page primary action.
- Search input width 320px desktop; clear X appears only when text exists. Search should not visually dominate the page.
- Filter button opens a 360px polished popover. Header: funnel icon, “Filtreler”, right aligned “Temizle”. Groups have clear labels and 12px vertical gaps. Use checkbox multi-select, radio single-select, searchable dropdown, and paired date fields. Footer is separated with “Vazgeç” and green “Uygula”. After applying, show removable soft-green filter chips under the toolbar.
- Table header labels: 12px medium, #5F6368, sentence case. Sortable header has neutral dual chevrons; active sort has a single deep-green up/down chevron. Cycle: no sort → ascending → descending. No sort icon for unsortable fields.
- Table rows: 56–64px, white, delicate dividers, #F7FBF8 hover. First useful identity column stays sticky on horizontal mobile scroll. Last “İşlemler” column right aligned with 32px circular ellipsis button.
- Row menu: “Görüntüle”, “Düzenle”, contextual action; divider; destructive “İptal” or “Arşivle”. Never place “Sil” on clinical or financial records.
- Pagination footer: “Toplam 128 kayıttan 1–25 arası gösteriliyor”, page-size dropdown 25/50/100, rounded previous/next controls, current page is pale green with deep-green text.

FORMS, DETAILS, MODALS AND SAFE STATES
- Forms: use a 960px maximum readable area, 2-column desktop grid for short related fields, single-column mobile. Organize fields into quiet white sections with title and one-line helper text; do not over-card the page.
- Long form save bar sticks gently to the bottom: left unsaved state, right “Vazgeç” and green “Kaydet”.
- Detail header: meaningful avatar/thumbnail, name, summary metadata, status chip, contextual actions. Tabs have simple text and a 2px green active underline; no pill-tab row.
- Modal: 480–560px, white, 16px radius, small elevation, dim but transparent overlay. Include direct title, consequence text, optional reason field, “Vazgeç” and clearly labeled confirm. Destructive confirmation cannot use green.
- Empty state: centered in content panel with a 64px pale-green icon circle, concise title, one sentence and primary CTA. Example “Henüz randevu yok” / “İlk randevuyu oluşturarak başlayın.”
- Loading state: tonal skeleton matching the final layout, never an empty page. Error state: quiet inline alert with icon, “Bilgiler yüklenemedi. Lütfen tekrar deneyin.” and “Yeniden dene”. Never show technical errors.

CLINICAL PRODUCT RULES
- This is multi-tenant clinic software: never expose tenant IDs, database IDs, raw API errors or technical jargon.
- Clinical and financial entries are append-only. Design “Düzeltme oluştur”, “İptal ve ters kayıt” and audit history; do not design one-click deletion.
- Inventory quantity is derived from stock movements. Do not design direct editable stock quantity fields.
- Use tasteful, privacy-conscious visual hierarchy for allergies and sensitive clinical data. Warnings must include text and icon, not color only.

OUTPUT REQUIREMENTS
- Produce a polished high-fidelity UI screen, desktop 1440px wide. When asked, add a 390px mobile companion screen.
- Include realistic populated data. Keep the exact shell, colors, component rules and spacing consistent across all VetNiva screens.
- The interface should feel calm, premium and fast to scan during a busy clinic day.
```

---

## Sayfa Promptları

### 1. Anasayfa

```text
Using the VetNiva design system above, create the “Anasayfa” dashboard. Page title: “Günaydın, Dr. Ayşe Yılmaz”; subtitle: “4 Ağustos 2026, Salı”. Right side primary action: “+ Yeni Randevu”.

Use a calm editorial composition instead of a dense dashboard. Top row: four refined compact metric cards with thin outline icons and no large colored backgrounds: “Bugünkü Randevular 18”, “Bekleyen Hastalar 4”, “Stok Uyarısı 3”, “Bugünkü Tahsilat ₺12.480,00”. Add low-emphasis contextual captions.

Below, create a large “Bugünkü Randevular” white panel with compact rows: Saat, Hayvan, Hasta Sahibi, İşlem, Veteriner, Durum. Add “Tümünü Gör” text action. Alongside, make a narrow “Hızlı İşlemler” panel with elegant icon actions: Yeni Hasta Sahibi, Yeni Hayvan, Yeni Randevu, Yeni Satış.

At bottom show two understated panels: “Dikkat Gerektirenler” for delayed vaccine, low stock and open balance; “Sistem Durumu” for API, Veritabanı, Kuyruk and Depolama. Maintain substantial whitespace and a premium white-and-green feel.
```

### 2. Hastalar

```text
Using the VetNiva design system above, create the populated “Hastalar” list page. Title “Hastalar”, subtitle “Hasta sahiplerini ve hayvan kayıtlarını yönetin.” Primary action “+ Yeni Hasta”.

Toolbar: search placeholder “Hasta sahibi, hayvan adı veya mikroçip ara...”; outlined “Filtrele” with funnel and badge 3; quick chip “Aktif”; text actions “Sütunlar” and “Dışa aktar”. Under it show selected chips “Kedi”, “Alerji var”, “Son 30 gün” with x remove icons.

Table columns: Hayvan, Hasta Sahibi, Tür / Irk, Yaş, Mikroçip No, Son Ziyaret, Uyarılar, İşlemler. Create realistic rows. First row: green-tinted cat avatar with “P”, “Pamuk” primary, “Mehmet Kaya” below; Kedi · British Shorthair; 3 yaş; 900113000123456; 21.07.2026; amber icon chip “Penisilin alerjisi”. Show the sort state on “Son Ziyaret”. Use refined row hover, subtle dividers, ellipsis action controls and pagination.

Also create a second variation showing the open “Filtreler” popover: Durum, Tür, Sağlık Uyarıları and Son Ziyaret date range; footer “Vazgeç” and “Uygula”.
```

### 3. Hasta Detayı ve Yeni Hasta Formu

```text
Create two connected VetNiva patient screens using the same design system.

PATIENT DETAIL: Page breadcrumb “Hastalar / Pamuk”. Header with refined pale-green pet avatar, “Pamuk”, “Kedi · British Shorthair · 3 yaş”, active chip, owner “Mehmet Kaya”, phone, microchip number. Right actions “Düzenle” and ellipsis. Tabs: Genel Bakış, Zaman Çizelgesi, Aşılar, Muayeneler, Dosyalar, Sahiplik Geçmişi. In General Overview, include an amber but elegant alert “Penisilin alerjisi”, profile facts, last visit, next appointment and a vertical timeline.

NEW PATIENT: Page title “Yeni Hasta Kaydı”; clear two-column form in quiet sections. Section “Hasta Sahibi”: searchable existing owner select plus “+ Yeni Hasta Sahibi”. Section “Hayvan Bilgileri”: Adı, Tür segmented control Kedi/Köpek/Kuş, Irk, Cinsiyet, Doğum tarihi, Renk, Mikroçip no. Section “Sağlık Uyarıları”: Alerjiler, Kronik durumlar, Not. Use subtle validation under one intentionally invalid microchip field. Sticky bottom bar has “Vazgeç” and “Kaydet”.
```

### 4. 

### 5. Muayene

```text
Create VetNiva’s active “Muayene” workspace. Header patient strip: pale-green pet avatar, “Pamuk”, Kedi · British Shorthair · 3 yaş, owner Mehmet Kaya; distinct amber allergy chip “Penisilin alerjisi”; last weight 4,8 kg. Right actions: “Hasta Detayı”, “Dosya Ekle”, green “Muayeneyi Tamamla”.

Main 8/4 column layout. Left contains calm expandable sections: Şikayet ve Öykü, Vital Bulgular (Kilo, Ateş, Nabız, Solunum), SOAP Notu with S/O/A/P labels, Tanı, Tedavi Planı, Reçete, Kontrol Randevusu. Right is a sticky visit summary: active visit timer, completion checklist, recent vaccinations and prior visit links. Use well-spaced inputs and clinical calm. Do not create an AI diagnosis tool.

Create a second state for a signed clinical record: locked “İmzalandı” chip, clinician and timestamp, read-only sections, audit history and “Düzeltme Oluştur” action instead of edit/delete.
```

### 6. Aşılar

```text
Create the VetNiva “Aşılar” tracking page. Title “Aşılar”, subtitle “Aşı uygulamalarını ve yaklaşan tekrarları takip edin.” Top compact metric filters: “Bugün 6”, “Yaklaşan 14”, “Gecikmiş 3”. Primary action “+ Aşı Uygula”.

List toolbar includes search, date range, status, protocol and veterinarian filters. Table: Hayvan, Sahip, Aşı / Protokol, Uygulama Tarihi, Sonraki Tarih, Lot / SKT, Durum, İşlemler. Show one overdue row using a restrained red chip, never a whole red row.

Create an “Aşı Uygula” form state with selected patient summary and sections for protocol, date/time, dose, lot, expiry, veterinarian, application site and note. Right summary panel lists available lots and clearly says “Kaydedildiğinde stok hareketi oluşturulur.” Use confirmation language that respects immutable clinical records.
```

### 7. Petshop ve Finans

```text
Create two coordinated premium VetNiva screens using the same green-and-white system.

PETSHOP: Title “Petshop”; tabs “Ürünler”, “Stok Hareketleri”, “Satın Alma”, “Tedarikçiler”; primary “+ Yeni Ürün”. Product table: Ürün, Barkod, Kategori, Depo/Raf, Mevcut Stok, Yeniden Sipariş Seviyesi, Son Kullanma, Durum, İşlemler. Mevcut stok is display-only. Use a small low-stock warning chip. Add a separate right-side or next screen POS composition: product search/category chips on left, calm “Sepet” surface on right with quantity stepper, totals and green “Tahsilata Geç” button.

FINANCE: Title “Finans”; subtitle “Tahsilatları, giderleri ve günlük kasa durumunu takip edin.” Date range and “+ Yeni Tahsilat”. Four restrained metrics: Bugünkü Tahsilat, Açık Bakiye, Nakit Kasa, Bu Ay Gelir. Below use a concise collection trend chart and payment method breakdown. Transaction table: Tarih-Saat, Belge/Referans, Müşteri, Tür, Ödeme Yöntemi, Tutar, Durum, İşlemler. Use a ledger-like detail experience and “İptal ve Ters Kayıt Oluştur”, never delete.
```

### 8. Ayarlar

```text
Create the VetNiva “Ayarlar” screen. Use a quiet internal settings navigation on the left and broad detail pane on the right. Internal items: Klinik Bilgileri, Şubeler, Kullanıcılar, Roller ve İzinler, Randevu Ayarları, Bildirimler, Dosya ve Depolama, Güvenlik, Veri Dışa Aktarma.

Show “Klinik Bilgileri” selected. Its pane has a simple title and helper text, then grouped white sections: clinic logo upload, clinic name, contact information, address, timezone, working hours grid and default appointment duration. Use a sticky save bar. Avoid an overly dense admin appearance.

Also show a “Kullanıcılar” table variation with avatar/name, e-mail, role, branch, last login, status and actions; CTA “+ Kullanıcı Davet Et”. The invitation drawer has e-mail, role, branch and optional message.
```

---

## Durum Varyasyonları

Bu bloklardan biri sayfa promptunun sonuna eklenebilir.

```text
Create the EMPTY STATE variation of this exact VetNiva screen. Preserve the app shell, title and toolbar. Replace only the content area with a 64px pale-green icon circle, title, one concise Turkish explanation and one green primary CTA. Keep it premium, calm and not cartoonish.
```

```text
Create the LOADING STATE variation of this exact VetNiva screen. Preserve layout dimensions and use refined neutral skeletons for final components. Keep title and navigation visible. Do not use a blank page or a large spinner.
```

```text
Create the ERROR STATE variation of this exact VetNiva screen. Preserve all safe shell content. In the affected panel show a quiet error card with icon, “Bilgiler yüklenemedi. Lütfen tekrar deneyin.” and secondary “Yeniden dene”. Do not expose technical details.
```

```text
Create a 390px MOBILE variation of this exact VetNiva screen. Use the same brand system, 16px gutters, drawer navigation, one-column form layout, bottom sheets for filters and drawers, and horizontally scrollable tables with a sticky identity column.
```
