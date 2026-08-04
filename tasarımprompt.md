# VetNiva — Google Stitch Tasarım Prompt Paketi

Bu dosyadaki **Ana Sistem Promptu** her ekran üretiminde en başa eklenmelidir.
Ardından tasarlanacak ekrana ait **Sayfa Promptu** eklenmelidir. Google Stitch'in
daha tutarlı sonuç üretmesi için talimatlar İngilizce, arayüzde görünen metinler
Türkçe verilmiştir.

---

## 1. Ana Sistem Promptu — Her Ekranda Zorunlu

```text
Design a production-ready responsive desktop-first SaaS web application named “VetNiva”, a veterinary clinic and petshop management platform for Türkiye. Create high-fidelity application UI screens, not a marketing website. Interface language must be Turkish (tr-TR), with correct Turkish characters. Use realistic Turkish veterinary data; never use lorem ipsum.

VISUAL DIRECTION
- Calm, trustworthy, modern clinical software. Professional and compact, but warm enough for veterinary care.
- Do not use gradients, glassmorphism, oversized illustrations, excessive rounded cards, neon colors, or generic dashboard mockups.
- Use a 12-column desktop grid, max content width 1440px, 24px page gutters, 24px vertical rhythm. Desktop target: 1440px wide. Also produce a mobile variant at 390px wide when requested.
- Font: Inter or a similarly neutral, highly legible sans-serif. Use 14px as default body and table text; 12px utility text; 16px form labels where needed; 20–24px page title. Use tabular numerals for money, quantities, dates, and times.
- White canvas, #FAFAFC page background, white panels, #E5E7EB borders, #111827 primary text, #6B7280 secondary text. VetNiva clinical blue is #0359A1; use it for primary actions, active navigation, links, focus, and selected controls. Hover blue: #02477F. Light blue selected background: #EFF6FF. Green success: #15803D. Amber warning: #B45309. Red destructive: #B91C1C. Never rely on color alone for status.
- Border radius: 8px for controls and panels; 6px for small chips. Shadow: very subtle only on elevated menus/modals. Prefer borders over shadows.

GLOBAL APP SHELL (use identically on every authenticated page)
- Left sidebar: fixed 256px wide on desktop, white, right border. At top display a 32px blue square with a simple white paw mark, then “VetNiva”.
- Sidebar navigation order with outline icons: Anasayfa, Hastalar, Randevular, Muayene, Aşılar, Petshop, Finans. Bottom divider then Ayarlar and Çıkış. Active item: pale blue background, blue icon and dark blue label. Inactive: gray icon/text, light gray hover background.
- Top bar: 64px high, white, bottom border. Left: compact mobile menu button and current page title + one-line description. Right: global search field (desktop), Turkish/English language selector, notification bell with unread dot, user avatar “DY”, user name “Dr. Ayşe Yılmaz”, role “Veteriner”, dropdown caret.
- Main content: breadcrumb above title: “Anasayfa / [current page]”. Page title and short explanatory subtitle. Put primary action button on the far right of the title row.
- On mobile: sidebar is a left drawer with overlay; top bar keeps menu, short title, notification, avatar. Page content is single column. Data tables become horizontally scrollable with the first identifier column sticky.

COMPONENT LANGUAGE AND STATES
- Primary button: solid #0359A1, white text, 40px high, 8px radius, left icon only when meaningful. Example: “+ Yeni Randevu”. Hover darker blue; disabled pale gray-blue; loading shows a small spinner and text such as “Kaydediliyor…”.
- Secondary button: white, gray border, dark text; hover pale gray. Destructive action: red text/border; confirmation required.
- Inputs: 40px high, white surface, #D1D5DB border, 8px radius. Focus: blue border and 2px soft blue focus ring. Label appears above input; required labels show a red asterisk. Help/error copy goes below input, never placeholder-only labeling.
- Selects show a clear chevron; searchable selects show search icon and “Ara...” placeholder. Date fields use dd.MM.yyyy; time uses HH:mm; money uses Turkish format, e.g. “₺1.250,00”.
- Status chips are compact, icon + label: green “Tamamlandı/Aktif”, amber “Bekliyor/Beklemede”, blue “Planlandı/Muayenede”, gray “Taslak/Arşiv”, red “İptal/Gecikmiş”.
- Toasts appear at bottom right: success, error, warning and info; include a concise Turkish message and dismiss button.
- Empty state: centered inside the content panel with a subtle line icon, one clear sentence, explanatory line, and one primary CTA. Example: “Henüz randevu yok” / “İlk randevuyu oluşturarak başlayın.” / “+ Yeni Randevu”.
- Loading state: preserve layout with skeleton rows/cards; never show a blank white page. Error state: small inline alert with retry action and support-safe copy; no technical stack traces.
- Accessibility: visible keyboard focus, 44px touch targets on mobile, contrast at least WCAG AA, meaningful labels and aria-friendly intent. Do not encode urgency or status only by color.

DATA TABLE STANDARD (use this exact visual language wherever a list is required)
- Desktop table sits in one bordered white panel. Panel header may contain title/count and actions. Header row: #F9FAFB background, 12px medium uppercase-ish or sentence-case labels, sort chevrons only on sortable fields.
- Rows: 52–60px high, white, thin bottom separators, gentle blue/gray hover. Use checkbox first column only for genuine bulk actions. Use avatar/animal initials only when helpful.
- First useful identity column is sticky when horizontally scrolling. Last column is right-aligned “İşlemler” with a 32px ellipsis button. Menu items: “Görüntüle”, “Düzenle”, contextual action, divider, destructive “İptal/Arşivle”.
- Sort: clicking header cycles neutral → ascending → descending. Indicate current sort with a filled up/down chevron and screen-readable label. Do not show chevrons on fields that cannot be sorted.
- Pagination footer: “Toplam 128 kayıttan 1–25 arası gösteriliyor”, page-size select (25 / 50 / 100), previous/next icon buttons, page numbers with current page blue-filled.
- Table toolbar directly above table: left side free-text search; next filter button with funnel icon and active-filter count badge; optional date-range and status quick filters; right side “Sütunlar”, “Dışa aktar”, and primary create button as relevant.
- Filter popover: 320–360px wide, white surface, title “Filtreler”, “Tümünü temizle” text action, groups separated by dividers. Use checkboxes for multi-select, radio buttons for a single option, date range with “Başlangıç” and “Bitiş”. Sticky footer: secondary “Vazgeç”, primary “Uygula”. After applying, show each filter as removable chips under the toolbar.

FORM / DETAIL STANDARD
- Use a maximum form reading width of 960px. Section cards have title, short helper copy, and 16–24px internal padding. Avoid presenting every field in a single card.
- Desktop forms use 2 columns for related short fields and full width for long text. Mobile is always one column.
- Sticky bottom action bar for long forms: left “Taslak kaydedildi” or unsaved-change status; right secondary “Vazgeç” and primary “Kaydet”. Destructive actions must not sit adjacent to primary save.
- Detail pages have a compact summary header, status chip, key metadata, right-side actions, then tabs. Tabs: “Genel Bakış”, relevant history/timeline, files, financial context. Active tab blue underline, not a pill.
- Confirmation modal: 480px wide desktop, title, concise consequence text, optional reason textarea for clinical/financial cancellation, secondary cancel, destructive confirm. Never make destructive actions one-click.

IMPORTANT PRODUCT RULES TO REFLECT IN THE DESIGN
- VetNiva is multi-tenant clinic software. Do not expose tenant IDs, technical IDs, database concepts, or raw API errors.
- Clinical notes and financial records are append-only. Design “Düzeltme” / “İptal ve ters kayıt” flows; do not show irreversible delete for those records.
- Stock quantity is derived from movements. Never design an editable raw “stok miktarı” field; use stock movement or stock count workflows.
- Show private health/owner data only in purposeful screens. Make sensitive notes visually contained and avoid displaying them in broad list views.

OUTPUT
- Produce one polished, coherent high-fidelity screen at a time using this design system.
- Include realistic populated data plus explicit loading, empty and error-state callouts where requested.
- Keep component shapes, spacing, colors, icons, table behavior, filter behavior and buttons identical across every VetNiva page.
```

---

## 2. Sayfa Promptları

Her bölüm, yukarıdaki Ana Sistem Promptu’nun hemen arkasına eklenmelidir.

### 2.1 Anasayfa / Dashboard

```text
Create the VetNiva “Anasayfa” dashboard. Header: “Günaydın, Dr. Ayşe Yılmaz” and subtitle “4 Ağustos 2026, Salı”. Primary action: “+ Yeni Randevu”.

First row: four equal KPI cards with a small outline icon, label, strong value, subtle trend/context line: “Bugünkü Randevular 18”, “Bekleyen Hastalar 4”, “Stok Uyarısı 3”, “Bugünkü Tahsilat ₺12.480,00”. KPI cards must be compact and clickable only when they lead to a relevant filtered list.

Below: 8-column panel “Bugünkü Randevular” with a compact table: Saat, Hasta Sahibi, Hayvan, İşlem, Veteriner, Durum. Include rows at 09:30, 10:15, 11:00. Right aligned action “Tüm Randevuları Gör”. Next to it a 4-column “Hızlı İşlemler” panel with four icon buttons: Yeni Hasta Sahibi, Yeni Hayvan, Yeni Randevu, Yeni Satış.

Bottom row: “Dikkat Gerektirenler” list with overdue vaccine, low stock, unpaid balance; “Sistem Durumu” compact list showing API, Veritabanı, Kuyruk, Depolama with green status indicators and a “Detaylar” link. Do not use charts unless a direct decision is supported.
```

### 2.2 Hastalar — Liste, Filtre, Detay ve Yeni Kayıt

```text
Create four linked VetNiva screens for the Patients module: (1) patient list, (2) expanded filter state, (3) patient detail, (4) create patient form.

LIST: Title “Hastalar”, subtitle “Hasta sahiplerini ve hayvan kayıtlarını yönetin.” Primary CTA “+ Yeni Hasta”. Toolbar: search “Hasta sahibi, hayvan adı veya mikroçip ara...”; filter button with badge “3”; quick status filter “Aktif”; “Sütunlar”; “Dışa aktar”. Table columns: Hayvan, Hasta Sahibi, Tür / Irk, Yaş, Mikroçip No, Son Ziyaret, Uyarılar, İşlemler. Use realistic rows: Pamuk / Mehmet Kaya / Kedi - British Shorthair / 3 yaş / 900113000123456 / 21.07.2026 / “Penisilin alerjisi” amber warning. Display animal name as primary and owner below in smaller muted text. Row click opens detail.

FILTER POPOVER: show sections: Durum (Aktif, Arşiv), Tür (Kedi, Köpek, Kuş), Uyarı (Alerji var, Kronik durum var), Son ziyaret date range. Include “Tümünü temizle”, “Vazgeç”, “Uygula”. Show applied filter chips under toolbar.

DETAIL: Summary header with pet avatar/initial, “Pamuk”, species/breed, active chip, owner “Mehmet Kaya”, phone, microchip number, actions “Düzenle” and ellipsis. Tabs: Genel Bakış, Zaman Çizelgesi, Aşılar, Muayeneler, Dosyalar, Sahiplik Geçmişi. General overview shows alert card “Penisilin alerjisi”, key facts, latest visit, and next appointment. Timeline uses dated vertical events and concise clinical labels.

CREATE FORM: Title “Yeni Hasta Kaydı”. Sections: Hasta Sahibi (existing owner searchable select or “+ Yeni Hasta Sahibi”), Hayvan Bilgileri (Adı, Tür required segmented selection Kedi/Köpek/Kuş, Irk, Cinsiyet, Doğum tarihi, Renk, Mikroçip no), Sağlık Uyarıları (Alerjiler, Kronik durumlar), Not. Sticky bottom bar “Vazgeç” and “Kaydet”. Show inline validation for a missing animal name and invalid microchip format.
```

### 2.3 Randevular — Takvim, Liste, Yeni Randevu ve Bekleme Listesi

```text
Create four linked VetNiva screens for Appointments: (1) calendar view, (2) list view, (3) new appointment drawer/form, (4) waiting list.

CALENDAR: Title “Randevular”, subtitle “Klinik randevularını planlayın ve takip edin.” Primary CTA “+ Yeni Randevu”. Top controls: previous/next chevrons, button “Bugün”, date label “4–10 Ağustos 2026”, view switch “Gün / Hafta / Ay” with Hafta selected, and resource dropdown “Tüm Veterinerler”. Week grid starts 08:00 and ends 20:00, 30-minute increments; columns Dr. Ayşe Yılmaz, Dr. Ahmet Çelik, Dr. Burcu Akın. Use compact colored appointment blocks with time, pet, owner and a status color accent: “09:30 Pamuk — Mehmet Kaya / Aşı kontrolü”. Include an unobtrusive current-time indicator.

LIST: alternate toolbar view with search, date range, Veteriner, Durum filters. Table: Tarih-Saat, Hasta, Hasta Sahibi, İşlem Nedeni, Veteriner, Durum, İşlemler. Statuses: Planlandı, Geldi, Muayenede, Tamamlandı, İptal. Bulk selection only for reminders/export, not cancellation.

NEW APPOINTMENT: use a right-side 560px drawer, preserving visible calendar behind it. Fields: Hasta Sahibi searchable select, Hayvan searchable dependent select, Tarih, Saat, Veteriner, Oda/Kaynak, İşlem Nedeni, Süre (15/30/45/60 dk), Not, reminder toggle. Show a conflict warning card if selected vet has an overlapping slot, with “Uygun zamanı gör” action. Footer buttons: “Vazgeç”, “Randevu Oluştur”.

WAITING LIST: title “Bekleme Listesi”; compact list with priority chip, preferred date/time, patient, owner, contact consent, requested reason and actions “Randevuya dönüştür”, “Bildirim gönder”, ellipsis. Include a small empty state.
```

### 2.4 Muayene — Kuyruk, Muayene Çalışma Alanı ve Klinik Kayıt

```text
Create three linked VetNiva screens for Consultation: (1) today’s clinical queue, (2) active examination workspace, (3) read-only signed examination with amendment action.

QUEUE: Title “Muayene”, subtitle “Bugünkü hasta akışını yönetin.” Top counters: Bekliyor 4, Muayenede 1, Tamamlandı 7. List columns: Saat, Hayvan / Sahip, Başvuru Nedeni, Veteriner, Durum, quick actions. Selected waiting row has “Muayeneyi Başlat” primary action. Show a discreet identity check prompt before starting.

WORKSPACE: prominent patient strip at top: Pamuk, cat/British Shorthair, 3 years, owner Mehmet Kaya, allergy warning in amber, last weight. Actions on right: “Hasta Detayı”, “Dosya Ekle”, “Muayeneyi Tamamla”. Main content uses two columns: left 8 columns with accordion/section cards “Şikayet ve Öykü”, “Vital Bulgular” (weight, temperature, pulse, respiratory rate), “SOAP Notu” with four labeled text areas, “Tanı”, “Tedavi Planı”, “Reçete”, “Kontrol Randevusu”; right 4 columns sticky summary with active visit clock, checklist completion, related vaccinations, past visits. Avoid an AI diagnosis interface.

SIGNED RECORD: use a locked status chip “İmzalandı”, signed timestamp and clinician. Sections are read-only. Provide “Düzeltme Oluştur” rather than edit/delete; its modal asks for mandatory amendment reason and explains that original clinical record remains preserved.
```

### 2.5 Aşılar — Takip Listesi, Uygulama ve Aşı Kartı

```text
Create three linked VetNiva screens for Vaccinations: (1) vaccination tracking list, (2) administer vaccination form, (3) patient vaccine card.

LIST: Title “Aşılar”, subtitle “Aşı uygulamalarını ve yaklaşan tekrarları takip edin.” KPI filter chips: “Bugün 6”, “Yaklaşan 14”, “Gecikmiş 3”. Toolbar search, date range, status, protocol and veterinarian filter. Table columns: Hayvan, Sahip, Aşı / Protokol, Uygulama Tarihi, Sonraki Tarih, Lot / SKT, Durum, İşlemler. Overdue rows have a red accessible status chip, not a red background.

ADMINISTER: Title “Aşı Uygula”. Show selected patient summary. Form sections: Aşı Protokolü (searchable select), Uygulama tarihi/saat, Doz and unit, Lot number, Son kullanma tarihi, uygulayan veteriner, administration site, note. A stock availability panel on the right shows available lots; selecting a lot clearly states that a stock movement will be recorded. Confirmation creates an immutable clinical record; cancellation/amendment language must be explicit.

VACCINE CARD: clean printable patient card with owner, pet, microchip and a chronological table. Include QR/print icon only as a secondary action. Future due dates and reminders should be obvious, with no marketing styling.
```

### 2.6 Petshop ve Stok — Ürünler, Stok Uyarıları ve Satış Ekranı

```text
Create three linked VetNiva screens: (1) product/inventory list, (2) stock alert page, (3) petshop POS sale.

PRODUCTS: Title “Petshop”, subtitle “Ürün, stok ve satış işlemlerini yönetin.” Tabs: Ürünler, Stok Hareketleri, Satın Alma, Tedarikçiler. Primary CTA “+ Yeni Ürün”. Table: Ürün, Barkod, Kategori, Depo/Raf, Mevcut Stok, Rezerve, Yeniden Sipariş Seviyesi, Son Kullanma, Durum, İşlemler. Quantity is display-only. Each product detail offers “Stok Hareketi Oluştur” and shows an immutable movement timeline.

STOCK ALERTS: separate clear page title “Stok Uyarıları”, with alert filter tabs “Düşük Stok”, “Yaklaşan SKT”, “Gecikmiş”. Each alert card/table row states product, current quantity/threshold or expiry date, warehouse, recommended action and acknowledgement. Actions: “Satın Alma Talebi Oluştur”, “Uyarıyı Onayla”.

POS: split layout. Left 7 columns: barcode/product search with scan icon, category chips, product grid/list with stock availability. Right 5 columns: “Sepet” panel, customer/owner optional search, pet optional search, item rows with quantity stepper, unit price, discount, remove action; summary Ara Toplam, İndirim, KDV, Genel Toplam. Primary “Tahsilata Geç”. Payment modal supports Nakit, Kart, Havale and partial payment, then receipt confirmation. Use Turkish Lira and no fake payment provider branding.
```

### 2.7 Finans — Tahsilatlar, Kasa ve Raporlar

```text
Create three linked VetNiva screens: (1) financial overview, (2) transaction list/detail, (3) day-end close.

OVERVIEW: Title “Finans”, subtitle “Tahsilatları, giderleri ve günlük kasa durumunu takip edin.” Header date range and “+ Yeni Tahsilat”. KPI cards: Bugünkü Tahsilat, Açık Bakiye, Nakit Kasa, Bu Ay Gelir. Below, a compact income/collection trend chart with clear axes and a payment method breakdown; charts must be secondary to actionable values.

TRANSACTIONS: table toolbar with date range, type (Tahsilat, İade, Gider, Ters Kayıt), method, user and status filters. Columns: Tarih-Saat, Belge/Referans, Müşteri, Tür, Ödeme Yöntemi, Tutar, Durum, İşlemler. Money right-aligned. Transaction detail has a ledger-style summary, links to relevant sale/clinical record, audit trail, and “İptal ve Ters Kayıt Oluştur” only when permitted. Never show Delete.

DAY END: title “Gün Sonu”. Present expected cash, counted cash input, variance, card total, transfer total and a reconciliation checklist. If variance exists, show amber/red explanation area with mandatory reason. Primary “Gün Sonunu Kapat”; confirmation modal makes the finality explicit.
```

### 2.8 Ayarlar — Klinik, Kullanıcılar, Roller, Bildirimler ve Güvenlik

```text
Create the VetNiva “Ayarlar” page. Use a settings layout with a 220px internal left sub-navigation and detail pane. Sub-navigation: Klinik Bilgileri, Şubeler, Kullanıcılar, Roller ve İzinler, Randevu Ayarları, Bildirimler, Dosya ve Depolama, Güvenlik, Veri Dışa Aktarma.

Default pane “Klinik Bilgileri”: title, helper text, logo upload, clinic name, tax fields, phone, email, address, timezone, working hours grid, default appointment duration. Use grouped form cards and a sticky save bar.

USERS: table with avatar/name, email, role, branch, last login, status, actions; CTA “+ Kullanıcı Davet Et”. Invitation drawer with email, role, branch and message. Roles detail uses permission groups with expandable sections and read-only explanation of sensitive permissions.

NOTIFICATIONS: channels (E-posta, SMS, WhatsApp when configured) display configured/not configured status; do not imply unconfigured providers work. Toggles for appointment and vaccination reminders, with template preview.

SECURITY: active sessions, password policy, two-factor enrollment state and audit-log export request. Sensitive actions require confirmation and re-authentication cue.
```

---

## 3. Ortak Durum Promptları

Bu kısa promptlar ilgili ana sayfa promptuna eklenerek aynı ekranın alternatif durumları da üretilebilir.

```text
Create the EMPTY STATE variation of this exact screen. Keep the full global shell, header, toolbar and filters visible. Replace only the content region with an accessible empty state, realistic Turkish copy, one primary CTA and no decorative illustration larger than 96px.
```

```text
Create the LOADING STATE variation of this exact screen. Keep the same layout dimensions. Use neutral skeleton rows, cards and input placeholders; retain visible page title and sidebar. Do not use a spinner as the only loading indicator.
```

```text
Create the ERROR STATE variation of this exact screen. Keep safe already-loaded shell content. In the affected content panel, show a compact red-bordered alert: “Bilgiler yüklenemedi. Lütfen tekrar deneyin.” and secondary “Yeniden dene” action. Do not expose technical error details.
```

```text
Create the MOBILE 390px variation of this exact screen. Use the same components and hierarchy, one-column content, compact top bar, closed sidebar drawer, full-width primary actions where needed, horizontally scrollable tables with sticky identity column, and bottom sheets instead of desktop drawers/popovers.
```
