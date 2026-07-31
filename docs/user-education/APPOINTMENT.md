# Kullanıcı Eğitimi — Randevu Yönetimi

## Amaç
Klinikte veya petshop'ta randevu oluşturma, değiştirme ve
iptal etme işlemlerinin nasıl yapılacağını açıklar.

## Hedef kitle
- VETERINARIAN
- STAFF (resepsiyon)
- OWNER (kendi hayvanı için self-service)

## Senaryolar

### Senaryo 1 — Hayvan sahibi telefonla/içeriden randevu alır

1. Sahip detay sayfasını aç (`/clinic/owners/{id}`).
2. "Hayvanlar" sekmesinden hayvanı seç.
3. "Randevu Al" butonuna tıkla.
4. Açılan formdan veteriner hekim + tarih + saat + hizmet türü
   seç.
5. "Rezerve Et" butonuna tıkla.
6. Sistem uygunluk kontrolü yapar; uygunsa randevu oluşturulur.
7. Onay toast mesajı görünür; randevu takvime eklenir.

### Senaryo 2 — Randevu saatini değiştir (drag-and-drop)

1. Takvim görünümüne git (`/clinic/calendar`).
2. Randevu kartını yeni saate sürükle.
3. Sistem çakışma kontrolü yapar.
4. Çakışma yoksa randevu yeni saatle güncellenir.
5. Sistem otomatik olarak hatırlatma job'unu yeniden planlar.

### Senaryo 3 — Randevuyu iptal et

1. Randevu detay sayfasını aç.
2. "İptal Et" butonuna tıkla.
3. İptal nedeni gir (opsiyonel).
4. "Onayla" butonuna tıkla.
5. Randevu `cancelled` durumuna geçer.
6. Sistem hatırlatma job'unu iptal eder.

### Senaryo 4 — Portal self-service randevu talebi

1. Portal kullanıcısı `/portal/appointments` sayfasına gider.
2. "Yeni Talep" butonuna tıkla.
3. Hayvanını + tarih + saat aralığı + notu girer.
4. "Gönder" butonuna tıkla.
5. Talep `pending` durumunda kliniğe iletilir.
6. Klinik onayladığında randevu kesinleşir; portal
   kullanıcısına SMS/email ile bildirim gider.

## İpuçları

- **Slot çakışması:** Aynı veteriner için aynı saat doluysa
  başka saat seç. Sistem otomatik uyarır.
- **Çalışma saatleri:** Randevu sadece veterinerin çalışma
  saatleri içinde alınabilir.
- **Hatırlatma:** Default 24 saat önce SMS/email gider.
  Randevu oluşturulduktan sonra ayarlanabilir.
- **Kayıt dışı randevu (walk-in):** Direkt muayene başlatılabilir;
  randevuya bağlı olmak zorunlu değildir.

## Sık karşılaşılan sorular

**S: Aynı anda iki hayvan için randevu alabilir miyim?**
C: Hayır, tek bir randevu tek bir hayvana aittir. Birden
fazla hayvan için her biri için ayrı randevu oluştur.

**S: Geçmiş bir randevuyu silebilir miyim?**
C: Hayır, geçmiş randevular append-only'dir. Silinemez;
yanlış kayıt için amendment mekanizması kullanılır.

**S: Portal kullanıcısı kendi başına randevu alabilir mi?**
C: Evet, "online randevu talebi" oluşturur; klinik onayı
gerekir. FAZ-12'de klinik onayı otomatik olabilir.

**S: Randevuyu hangi roller iptal edebilir?**
C: OWNER, VETERINARIAN, STAFF; portal kullanıcısı yalnızca
kendi talebini iptal edebilir.

## Hata durumları

| Hata | Çözüm |
|------|-------|
| Slot çakışması | Başka saat seçin. |
| Geçersiz saat | Çalışma saatleri içinde seçin. |
| Pasif veteriner | Aktif veterinerlerden birini seçin. |
| Yetkisiz | Klinik personeli ile iletişime geçin. |

## İlgili dokümanlar
- `docs/workflows/appointment_create.md` (adım adım)
- `docs/api/api.get._api_v1_calendar_appointments.md`
- `docs/api/api.post._api_v1_calendar_appointments.md`
- `docs/permissions/PERMISSION_CATALOG.yaml#clinic:appointment:*`
- `goals/GOAL-030 → 036_COMPLETION_REPORT.md`
