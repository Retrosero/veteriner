# Kullanıcı Eğitimi — Personel Paneli Kimlik Doğrulama

> **Hedef kitle:** Klinik işletme sahipleri, veteriner hekimler, klinik
> personeli, SUPERADMIN (sistem yöneticisi).
> **Sürüm:** GOAL-011 (FAZ-1) — 2026-07-30.

Bu doküman personel panelinin giriş, parola yönetimi, davet ve oturum
akışlarını ekran görüntüsü olmadan (metin tabanlı) anlatır. Her bölüm
sonunda "İlgili dokümanlar" ile teknik detaylara bağlantı verilir.

---

## 1. İlk kez giriş

Bir kullanıcı sisteme iki yoldan girebilir:

- **Davet yoluyla:** Klinik yöneticisi sizi e-posta ile davet eder.
  E-postadaki "Hesabını etkinleştir" bağlantısına tıklayın.
- **Yönetici tarafından elle oluşturulmuşsa:** Klinik yöneticiniz
  size geçici parola verir; ilk girişte parolanızı değiştirmeniz
  istenir.

### Adımlar (davet yoluyla)

1. E-postadaki bağlantıya tıklayın → **Davet kabul** sayfası açılır.
2. Görünen adınızı yazın (örn. "Dr. Ayşe Kaya").
3. Yeni parolanızı belirleyin. **Parola politikası:**
   - En az 12 karakter
   - En az 1 büyük harf (A-Z)
   - En az 1 küçük harf (a-z)
   - En az 1 rakam (0-9)
4. "Hesabı etkinleştir" düğmesine basın.
5. Otomatik olarak panele yönlendirilirsiniz.

### Adımlar (geçici parola ile)

1. **Giriş** sayfasında e-postanızı ve geçici parolanızı girin.
2. İlk giriş sonrası **Parola değiştir** uyarısı çıkar.
3. Yeni parolanızı belirleyin (yukarıdaki politikaya uygun).

> **Güvenlik notu:** Parolanızı kimseyle paylaşmayın. Sistem
> yöneticisi bile parolanızı göremez.

---

## 2. Günlük giriş

1. **Giriş** sayfasını açın (`/login`).
2. E-postanızı ve parolanızı girin.
3. Birden fazla klinik/tenant'a üye iseniz **klinik seçimi**
   açılır; doğru kliniği seçin.
4. "Giriş" düğmesine basın.

### Oturum süresi

- Giriş yaptıktan sonra **30 gün** boyunca oturumunuz açık kalır.
- 24 saat hareketsizlikten sonra oturum otomatik kapanır (güvenlik).
- "Beni hatırla" seçeneği yoktur; her cihazda yeniden giriş gerekir.

### Çoklu cihaz

- Aynı anda birden fazla cihazda oturum açabilirsiniz (örn. bilgisayar
  + tablet).
- Aktif oturumlarınızı **Ayarlar → Oturumlar** altından
  yönetebilirsiniz. Şüpheli bir oturum görürseniz uzaktan
  kapatabilirsiniz.

---

## 3. Parola sıfırlama (unuttuğunuzda)

1. **Giriş** sayfasında "Şifremi unuttum" bağlantısına tıklayın.
2. E-posta adresinizi girin.
3. "Sıfırlama bağlantısı gönder" düğmesine basın.
4. E-postanıza gelen bağlantıya **1 saat içinde** tıklayın
   (bağlantı süreli).
5. Yeni parolanızı belirleyin ve onaylayın.
6. Otomatik olarak giriş yapılırsınız; diğer cihazlardaki
   oturumlarınız **güvenlik nedeniyle kapatılır**.

> **Önemli:** Sıfırlama bağlantısı e-postanıza 1-2 dakika içinde
> gelmezse spam klasörünü kontrol edin. Hâlâ gelmediyse klinik
> yöneticinize bildirin.

### Hata durumları

- **"E-posta veya parola hatalı"** — e-posta veya parola yanlış.
  Bilgileri kontrol edin.
- **"Hesabınız geçici olarak kilitlendi"** — çok fazla yanlış
  deneme yapıldı. 15 dakika bekleyip tekrar deneyin.
- **"Sıfırlama bağlantısı geçersiz veya süresi dolmuş"** — bağlantı
  1 saatlik. Yeni sıfırlama talebi gönderin.

---

## 4. Parola değiştirme (oturum açıkken)

1. Sağ üstte profil menüsünden **Ayarlar → Güvenlik** seçin.
2. "Parola değiştir" bölümünde:
   - **Mevcut parola** — şu anki parolanız.
   - **Yeni parola** — yeni parolanız (yukarıdaki politikaya uygun).
   - **Yeni parola (tekrar)** — onay için.
3. "Parolayı güncelle" düğmesine basın.

> Parolanız değiştiğinde diğer cihazlardaki oturumlarınız açık
> kalır; isterseniz **Ayarlar → Oturumlar** altından kapatabilirsiniz.

---

## 5. Kullanıcı davet etme (klinik yöneticisi için)

> Bu bölüm yalnızca **OWNER** veya **SUPERADMIN** rolündeki
> kullanıcılar için geçerlidir.

1. **Ayarlar → Kullanıcılar** sayfasına gidin.
2. "Yeni kullanıcı davet et" düğmesine basın.
3. Davet edilecek kişinin e-posta adresini girin.
4. Atanacak rolü seçin:
   - **OWNER** — İşletme sahibi (tüm yetkiler).
   - **VETERINARIAN** — Veteriner hekim (klinik işlemler).
   - **STAFF** — Klinik personeli (sınırlı yetkiler).
5. "Davet gönder" düğmesine basın.
6. Davetli kişiye e-posta ile bağlantı gider. Bağlantı **7 gün**
   geçerlidir.
7. Davetli kişi bağlantıya tıklayıp parolasını oluşturduğunda
   kullanıcı aktif olur.

### Bekleyen davet

- Aynı kişiye zaten bekleyen davet gönderilmişse yeni davet
  gönderemezsiniz. Önce mevcut daveti iptal edin veya davetli
  kişinin kabul etmesini bekleyin.
- Bekleyen davetleri **Ayarlar → Kullanıcılar → Davetler** altında
  görebilir ve iptal edebilirsiniz.

---

## 6. Çıkış (logout)

- Sağ üstte profil menüsünden **Çıkış** seçeneğine tıklayın.
- Çıkış yaptığınızda sadece o cihazdaki oturumunuz kapanır.
- **Tüm cihazlardan çıkış** için **Ayarlar → Oturumlar** altında
  "Tüm oturumları kapat" düğmesini kullanın.

> **Güvenlik:** Ortak kullanılan bir bilgisayardan çıkış yaparken
> mutlaka "Tüm oturumları kapat" seçeneğini kullanın.

---

## 7. Oturum yönetimi (güvenlik)

**Ayarlar → Oturumlar** altında:

- **Aktif oturumlar** listesi:
  - Cihaz (user-agent özeti)
  - IP adresi (maskeli; son oktet `***`)
  - Son kullanım zamanı
  - "Bu cihaz" rozeti (mevcut oturum)
- Tek tek oturum kapatma: listede oturumun yanındaki çöp kutusu
  ikonuna tıklayın.
- Tümünü kapatma: sayfanın üstündeki "Tüm oturumları kapat"
  düğmesi.

Şüpheli bir oturum görürseniz (tanımadığınız cihaz/konum):
1. Hemen parolanızı değiştirin (yukarıdaki bölüm 4).
2. Tüm oturumları kapatın.
3. Klinik yöneticinize bildirin.

---

## 8. Hesap kilidi (brute-force koruması)

5 kez üst üste yanlış parola girilirse hesabınız 15 dakika
kilitlenir. Bu süre içinde giriş denerseniz:

- **"Hesabınız geçici olarak kilitlendi"** mesajı alırsınız.
- Beklemeniz gereken süre ekranda gösterilir.

Kilit süresi dolduktan sonra tekrar deneyebilirsiniz. Hesabınız
sürekli kilitleniyorsa:
- Parolanızı sıfırlayın (yukarıdaki bölüm 3).
- Veya klinik yöneticiniz hesabınızı sıfırlasın.

---

## 9. Sık sorulan sorular (SSS)

**S: Parolamı unuttum, e-postam da değişti. Ne yapmalıyım?**
C: Klinik yöneticinizle iletişime geçin. Yönetici sizin için yeni
   bir davet oluşturabilir.

**S: Davet bağlantımın süresi doldu. Yeni bağlantı alabilir miyim?**
C: Klinik yöneticinizden yeni bir davet göndermesini isteyin.

**S: Aynı anda iki cihazda oturum açabilir miyim?**
C: Evet. Aynı anda birden fazla cihazda oturum açabilirsiniz.
   Yönetmek için **Ayarlar → Oturumlar**'a gidin.

**S: Eski parolamı geri alabilir miyim?**
C: Hayır. Parolalar bcrypt ile tek yönlü hash'lenir; geri alınamaz.
   Sıfırlama bağlantısı kullanmanız gerekir.

**S: Sistem yöneticisi parolamı görebilir mi?**
C: Hayır. Sistem yöneticisi dahil hiç kimse parolanızı göremez.
   Yalnızca sıfırlama yapabilir.

**S: Hesabım neden askıya alındı (suspended)?**
C: Klinik yöneticiniz tarafından geçici olarak devre dışı
   bırakılmış olabilir. Yöneticiyle iletişime geçin.

---

## 10. İlgili dokümanlar

- API: `docs/api/API_CATALOG.md` (`/auth` ve `/me` bölümleri)
- Hata kodları: `docs/errors/ERROR_CATALOG.md` (`VET-AUTH-*`)
- Alan sözlüğü: `docs/fields/FIELD_GLOSSARY.md` (User, UserSession,
  UserInvitation, PasswordResetToken bölümleri)
- AI bilgi havuzu: `docs/ai/AI_CHUNKS.yaml` (`auth-*` ve
  `glossary-user*` chunk'ları)
- i18n: `packages/i18n/src/locales/tr-TR.json` (`auth.*` ve
  `error.VET-AUTH-*` anahtarları)
