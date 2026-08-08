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