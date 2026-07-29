# Google Stitch Tasarım Promptları

Bu dosya, VetNiva pilot sürümünün tüm ekranları için Google Stitch
(`https://stitch.withgoogle.com/`) ile tasarım üretmek amacıyla
hazırlanmış prompt şablonlarını içerir. Workflow:

1. Bu dosyadan ilgili sayfanın "Stitch Prompt" bölümünü kopyala
2. Google Stitch'e yapıştır
3. Tasarımı indir (`Download → HTML` veya ekran görüntüsü)
4. `docs/design/screens/` altına kaydet (`web.layout.png`, `web.login.png` vb.)
5. Mavis'e (orchestrator) teslim et; kod tarafına entegrasyon için

## Genel tasarım sistemi (tüm sayfalarda geçerli)

### Renk paleti

| Token         | Değer                   | Kullanım                                     |
| ------------- | ----------------------- | -------------------------------------------- |
| Primary       | `#0359a1` (clinic-700)  | Ana butonlar, aktif link, vurgu              |
| Primary hover | `#064b85` (clinic-800)  | Hover state                                  |
| Success       | `#10b981` (success-500) | "Çalışıyor" badge, onay mesajları            |
| Warning       | `#f59e0b` (warn-500)    | "Kısmen çalışıyor" badge, uyarılar           |
| Danger        | `#ef4444` (danger-500)  | "Çalışmıyor" badge, hatalar, silme işlemleri |
| Text          | `#111827` (gray-900)    | Ana metin                                    |
| Muted         | `#6b7280` (gray-500)    | İkincil metin, etiketler                     |
| Border        | `#e5e7eb` (gray-200)    | Kart/alan kenarlıkları                       |
| Background    | `#fafafc`               | Sayfa arka planı                             |
| Surface       | `#ffffff`               | Kart, panel, modal                           |

### Tipografi

- Font: System UI (-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto)
- Heading: 24/20/18px, font-weight 600
- Body: 14/16px, font-weight 400
- Caption: 12px, font-weight 400, color muted

### Spacing

- Skala: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px
- Kart padding: 16-24px
- Bölüm arası: 32-48px

### Yuvarlatma

- Inputs/butonlar: 6px
- Kartlar: 8-10px
- Badge/chip: 999px (full)

### Bileşenler (tüm sayfalarda)

- **Button**: primary (mavi), secondary (beyaz + border), ghost (şeffaf), danger (kırmızı); sm/md/lg
- **Input**: 40px yükseklik, focus state mavi ring
- **Card**: beyaz arka plan, 1px border, 8-10px radius, hafif gölge
- **Badge**: yeşil/sarı/kırmızı/mavi; küçük pill şekli
- **Table**: zebra stripe yok; hover state; sticky header
- **Empty state**: ikon + başlık + yardım metni + CTA butonu
- **Loading state**: spinner + mesaj
- **Error state**: kırmızı ikon + başlık + correlation ID gösterimi

### Erişilebilirlik

- Tüm interaktif öğelerde `aria-label`
- Form alanlarında label-input ilişkisi
- Renk kontrastı WCAG AA
- Klavye navigasyonu (Tab, Enter, Escape)
- Focus ring her zaman görünür

### Responsive

- Mobile breakpoint: < 640px
- Tablet: 640-1024px
- Desktop: > 1024px
- Tasarımlar öncelikle desktop (1280px) için hazırlanır; tablet ve mobile varyantları sonra

### Türkçe metin kuralları

- Tarih formatı: `gg.aa.yyyy` (ör. `29.07.2026`)
- Saat formatı: `HH:mm` (24 saat)
- Para birimi: `₺1.234,56` (Türk Lirası)
- Ondalık: virgül
- Yüklü ifadeler küçük harfle başlar; başlıklar büyük harfle başlar
- "Hata", "Uyarı", "Bilgi" durum etiketleri büyük harfle

---

## GRUP 1 — Temel Altyapı (MVP-1)

### 1. App Layout Shell

**Amaç:** Tüm authenticated sayfalar için ortak kabuk. Sol sidebar, üst
header, ana içerik alanı.

**Stitch Prompt:**

```
Design a desktop SaaS application shell for a Turkish veterinary
clinic management system called VetNiva. The layout is for a clinical
staff user (not a pet owner portal).

**Layout structure:**
- Fixed left sidebar (260px wide) on a white background with a subtle
  right border
  - Top: VetNiva logo (small paw icon + "VetNiva" wordmark, clinic blue)
  - Primary navigation section: "Anasayfa" (Dashboard), "Hastalar"
    (Patients), "Randevular" (Appointments), "Muayene" (Consultation),
    "Aşılar" (Vaccinations), "Petshop", "Finans"
  - Secondary section at bottom: "Ayarlar" (Settings), "Çıkış" (Sign out)
  - Active nav item has a soft clinic-blue background tint and bold text
- Top header (64px tall) on white with bottom border
  - Left: page title + breadcrumb (e.g. "Hastalar / Hasta Sahipleri")
  - Right: notification bell icon, locale switcher (TR | EN pill), user
    avatar circle with name tooltip
- Main content area on light gray background with 32px padding all around
  - Content max-width 1200px, centered

**Visual style:**
- Color: clinic primary #0359a1 for active states and logo
- Border radius: 8px for the active nav background
- Sidebar items: 40px height, 12px horizontal padding, 6px radius
- Icons: outline style, 20px, gray-500 default, clinic-700 when active
- Typography: system sans, 14px body, 13px nav labels
- Subtle shadow on top: 0 1px 0 0 #e5e7eb
- Hover: light gray background on nav items

**Sample Turkish content (visible in mockup):**
- Logo: "VetNiva" (with paw icon)
- Nav: "Anasayfa", "Hastalar", "Randevular", "Muayene", "Aşılar", "Petshop", "Finans"
- Bottom nav: "Ayarlar", "Çıkış"
- Breadcrumb: "Anasayfa / Hastalar"
- User: "Dr. Ayşe Yılmaz" with avatar initials "AY"

**Sample English equivalents (in locale switcher):**
- "Home", "Patients", "Appointments", "Consultation", "Vaccinations",
  "Petshop", "Finance", "Settings", "Sign out"

Generate a single desktop mockup at 1280x800 with the sidebar, header,
and a sample content area showing a list of patient owners (placeholder
rows: name, phone, animal count, last visit, status badge).
```

---

### 2. Login

**Amaç:** Klinik personeli ve hasta sahibi portal kullanıcısı için
kimlik doğrulama ekranı. Tek oturum açma noktası.

**Stitch Prompt:**

```
Design a centered login card for a Turkish veterinary clinic SaaS
called VetNiva. The page is the entry point for both clinic staff and
pet owner portal users.

**Layout:**
- Full-viewport light gray background with a very subtle paw-print
  pattern at 5% opacity
- Centered card: 440px wide, ~520px tall, white surface, 12px radius,
  subtle shadow (0 4px 12px rgba(0,0,0,0.08))
- Card content top-to-bottom:
  1. Logo lockup: paw icon + "VetNiva" wordmark in clinic blue, 32px tall,
     centered, 48px top padding
  2. Heading: "Hesabınıza giriş yapın" (24px, semibold, dark)
  3. Subtext: "Klinik yönetim sistemi" (14px, muted)
  4. Email input field (full-width, 40px tall, with email icon prefix)
  5. Password input field (full-width, 40px tall, with eye toggle icon suffix)
  6. "Şifremi unuttum?" link (right-aligned, clinic blue, 13px)
  7. "Giriş Yap" primary button (full-width, 44px tall, clinic blue,
     white text, semibold)
  8. Divider with "veya" (or) in the middle
  9. Secondary button: "Portal Girişi" (outline, full-width) for pet owners
  10. Footer (24px bottom padding): locale switcher (TR | EN pill, 12px
      text) and "© 2026 VetNiva" small text side-by-side

**Visual style:**
- Color: clinic primary #0359a1 for button and links
- Inputs: 1px gray border, focus state 2px clinic ring
- Button: 6px radius, full-width
- Form field labels are placeholders (no separate label, placeholder text)
- Error state slot (initially hidden): red text below password field
  with correlation ID

**Sample Turkish content:**
- "Hesabınıza giriş yapın"
- "E-posta"
- "Şifre"
- "Şifremi unuttunuz?"
- "Giriş Yap"
- "veya"
- "Portal Girişi"
- "© 2026 VetNiva"

**Sample English content (locale switcher):**
- "Sign in to your account"
- "Email"
- "Password"
- "Forgot password?"
- "Sign in"
- "or"
- "Portal Sign in"

Generate a single 1280x800 mockup showing the login screen with
placeholder content. No background imagery except the subtle paw
pattern.
```

---

### 3. Dashboard

**Amaç:** Giriş sonrası ilk ekran. Klinik personeli için günlük iş
önceliklerini özetler: bugünkü randevular, bekleyen hastalar, sistem
durumu, hızlı erişim.

**Stitch Prompt:**

```
Design a veterinary clinic staff dashboard for VetNiva (Turkish
language). The user is Dr. Ayşe Yılmaz, a veterinarian. The page
appears right after login.

**Layout:**
- Page header: "Günaydın, Dr. Ayşe" (h1, 24px) + "Bugün 29 Temmuz
  2026, Salı" (subtitle, 14px, muted)
- 4-column KPI row (each card has icon top-left, big number, label,
  delta vs. yesterday):
  1. "Bugünkü Randevular" — value 12, delta "+2", icon calendar
  2. "Bekleyen Hastalar" — value 4, delta "−1", icon paw
  3. "Stok Uyarısı" — value 3, delta "+1", warning color, icon alert
  4. "Bugünkü Tahsilat" — value "₺4.250", delta "+₺850", icon cash
- Two-column area below KPIs:
  - Left column (wider, 2/3): "Bugünkü Randevular" card with timeline
    list of 5 appointments: time | patient name + animal | reason |
    status pill (Beklemede / Muayenede / Tamamlandı)
  - Right column (1/3): "Hızlı İşlemler" card with 4 large icon-buttons
    stacked: "Yeni Hasta Sahibi", "Yeni Hayvan", "Yeni Randevu",
    "Yeni Satış"
- Bottom row, full-width: "Sistem Durumu" strip — single line card
  showing: API ✓ Çalışıyor, Veritabanı ✓ Çalışıyor (12ms), Kuyruk
  ✓ Çalışıyor, Sürüm 0.1.0 (devlocal), build 5a3dd2f, with a
  "Detaylar" link to the health page

**Visual style:**
- Same design system as the app shell (sidebar + header from screen 1)
- KPI cards: 1px border, white surface, 6px radius
- Delta chips: green for positive, red for negative, neutral gray
- Timeline list: alternating subtle background tints, hover state
- Status pills: Beklemede (warning), Muayenede (info/clinic-blue),
  Tamamlandı (success)
- Typography: 32px KPI numbers, semibold; 14px labels, muted

**Sample Turkish content:**
- "Günaydın, Dr. Ayşe"
- "Bugün 29 Temmuz 2026, Salı"
- "Bugünkü Randevular", "Bekleyen Hastalar", "Stok Uyarısı",
  "Bugünkü Tahsilat"
- "Hızlı İşlemler", "Yeni Hasta Sahibi", "Yeni Hayvan", "Yeni Randevu",
  "Yeni Satış"
- "Sistem Durumu", "API Çalışıyor", "Veritabanı Çalışıyor",
  "Detaylar"
- "Beklemede", "Muayenede", "Tamamlandı"

Generate a 1280x900 mockup with the full app shell and the dashboard
content. Show the time "09:30" next to a sample appointment for
patient "Mehmet Kaya" with animal "Pamuk (Kedi)" reason "Aşı kontrolü".
```

---

## Stitch Kullanım Talimatları (operatör için)

1. Tarayıcıda `https://stitch.withgoogle.com/` adresine git
2. Google hesabınla giriş yap
3. "New Project" → "Web app" seç (mobile için "Mobile app")
4. Sol paneldeki metin kutusuna yukarıdaki "Stitch Prompt" bölümünü
   olduğu gibi yapıştır
5. Üretilen tasarımı incele; gerekirse prompt'u düzeltip yeniden üret
6. Sağ üstteki "Download" butonu → "HTML" indir (veya PNG ekran
   görüntüsü)
7. İndirilen dosyayı `docs/design/screens/` altına şu formata göre kaydet:
   - `web.layout.png` veya `web.layout.html`
   - `web.login.png` veya `web.login.html`
   - `web.dashboard.png` veya `web.dashboard.html`
8. Tasarımı Mavis'e teslim et; kod tarafına entegrasyon başlar

### Doğrulama checklist'i (her tasarım için)

- [ ] Türkçe metinler doğru (aksan, noktalama, karakter)
- [ ] Klinik renk paleti kullanılmış (mavi #0359a1 ağırlıklı)
- [ ] Sistem font tercih edilmiş
- [ ] Mobil/tablet için ayrı varyant önerilmiş (Stitch sürümüne göre)
- [ ] Erişilebilirlik: butonlarda aria-label, form alanlarında label
- [ ] Yükleme/boş/hata state'leri gösterilmiş (en az 1 örnek)
- [ ] Tasarım 1280px desktop için optimize edilmiş

### Bilinen kısıtlamalar

- Stitch sadece statik tasarım üretir; etkileşim/prototype eklemez
- Hasta sahibi portalı (PET_OWNER_PORTAL rolü) için ayrı bir layout
  gerekebilir; GOAL-001'de belli olur
- i18n anahtarları için çeviri metni tasarımda placeholder olarak
  kullanılır; gerçek anahtarlar `packages/i18n/src/locales/tr-TR.json`
  içinde tutulur

---

## Sonraki gruplar (henüz prompt yazılmadı)

- Grup 2 — Klinik Temel: 6 sayfa
- Grup 3 — Randevu: 2 sayfa
- Grup 4 — Muayene & Aşı: 4 sayfa
- Grup 5 — Petshop: 3 sayfa
- Grup 6 — Finans: 3 sayfa
- Grup 7 — Yönetim: 3 sayfa

MVP-1 onaylandıktan sonra sırayla eklenecek.
