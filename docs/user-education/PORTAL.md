# Kullanıcı Eğitimi — Portal (Hayvan Sahibi Arayüzü)

## Amaç
Hayvan sahiplerinin kendi hayvanlarına ait verileri
görebileceği, randevu talebi oluşturabileceği ve
bildirim alabileceği portalın nasıl kullanılacağını
açıklar.

## Hedef kitle
- PET_OWNER_PORTAL (hayvan sahipleri)

## Senaryolar

### Senaryo 1 — Portal hesabı oluştur (davet)

1. Klinik personeli sizin için portal daveti oluşturur.
2. SMS/email ile bir davet bağlantısı alırsınız.
3. Bağlantıya tıklayın; şifre belirleyin.
4. Hesabınız aktif olur.

### Senaryo 2 — Hayvanlarımı gör

1. `/portal/pets` sayfasına gidin.
2. Sahip olduğunuz tüm hayvanlar listelenir.
3. Bir hayvana tıklayarak detay sayfasını açın:
   - Aşı kartı
   - Muayene geçmişi (PDF)
   - Reçeteler
   - Lab sonuçları
   - Aşı hatırlatmaları

### Senaryo 3 — Aşı kartı görüntüle

1. Hayvan detay sayfasında "Aşı Kartı" sekmesi.
2. Yapılan tüm aşılar, tarihleri, lot numaraları ve sonraki
   hatırlatma tarihleri görünür.
3. PDF olarak indirilebilir.

### Senaryo 4 — Reçete indirme

1. Hayvan detayında "Reçeteler" sekmesi.
2. Reçeteyi seçin → "PDF İndir" butonuna tıklayın.
3. Veya "Portal'a Gönderildi" ibareli reçeteleri görüntüleyin
   (klinik tarafından paylaşılanlar).

### Senaryo 5 — Online randevu talebi

1. `/portal/appointments` sayfasına gidin.
2. "Yeni Talep" butonuna tıkla.
3. Hayvanınızı + tarih + saat aralığı + notu girin.
4. "Gönder" butonuna tıkla.
5. Talep `pending` durumunda kliniğe iletilir.
6. Klinik onayladığında SMS/email ile bildirim alırsınız.

### Senaryo 6 — Sahiplik devri

1. Hayvanınızı bir aile üyesine devretmek istiyorsanız
   klinik personeli ile iletişime geçin.
2. Klinik, `ownership-transfer` akışını başlatır.
3. Aktarım onayından sonra yeni sahip hayvanı görür.

### Senaryo 7 — Hesap silme (KVKK)

1. Hesabınızı silmek istiyorsanız klinik personeli ile
   iletişime geçin.
2. KVKK silme talebi oluşturulur.
3. 30 gün içinde işlenir; veriler anonimleştirilir.
4. Tıbbi kayıtlar yasal saklama süresince tutulur
   (anonimleştirilmiş).

## İpuçları

- **Bildirim tercihleri:** `/portal/settings/notifications` ile
  SMS/email tercihlerinizi yönetin.
- **Dil:** `/[locale]` parametresi ile tr-TR / en-GB
  değiştirebilirsiniz.
- **Çocuk profili:** Aile bireylerinin hayvanlarını
  görebilmeniz için klinik tarafından "ortak sahiplik"
  tanımlanmalı.

## Sık karşılaşılan sorular

**S: Başka birinin hayvanını görebilir miyim?**
C: Yalnızca aktif sahiplik kaydınız olan hayvanları
görebilirsiniz. Sahiplik devri (GOAL-022) ile yeni
hayvan eklenir.

**S: Aşı randevumu nasıl alabilirim?**
C: Hayvan detayında "Aşı Kartı" → yaklaşan hatırlatmalar
listelenir → "Randevu Talep Et" ile doğrudan talep
oluşturabilirsiniz.

**S: Eski muayenelere erişebilir miyim?**
C: Evet, tüm muayene geçmişi (imzalanmış olanlar) görünür.
PDF olarak indirebilirsiniz.

**S: Bildirim almıyorum?**
C: SMS/email tercihlerinizi kontrol edin. Telefon numaranızın
doğru olduğundan emin olun.

**S: Hesabımı dondurabilir miyim?**
C: Klinik personeli ile iletişime geçin. Hesap dondurma
mevcut; tüm veriler korunur.

## Hata durumları

| Hata | Çözüm |
|------|-------|
| Davet geçersiz | Yeni davet talep edin. |
| Hesap kilitli | Klinik ile iletişime geçin. |
| Sahiplik yok | Klinik tarafından sahiplik tanımlanmalı. |
| Yetkisiz | Kendi hayvanlarınızı görebilirsiniz. |

## İlgili dokümanlar
- `docs/api/api.post._api_v1_portal_invitations.md`
- `goals/GOAL-033 → 036_COMPLETION_REPORT.md` (portal)
- `goals/GOAL-022_COMPLETION_REPORT.md` (sahiplik devri)
- `goals/GOAL-126_COMPLETION_REPORT.md` (KVKK)
- `docs/permissions/PERMISSION_CATALOG.yaml#portal:*`
