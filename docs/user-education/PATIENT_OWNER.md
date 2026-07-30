# Hasta Sahibi (PATIENT_OWNER) — VetNiva Portal Kullanım Kılavuzu

> **Not:** Bu rehber **GOAL-025** ile başlayan portal
> akışının (davet, kabul) temel kullanımını anlatır. Portal
> login ekranı, hayvan listesi ve online randevu talebi
> **GOAL-033 / GOAL-034 / GOAL-035** (FAZ-3) ile birlikte
> gelecektir. Bu commit'te yalnızca davet → kabul akışı
> aktiftir.

## Hoş geldiniz

VetNiva portalı, kliniğinizin hayvanlarınızın tıbbi geçmişine
dijital olarak eriştiğiniz güvenli bir alandır. Portalı
kullanmaya başlamak için kliniğinizin size gönderdiği **davet
bağlantısına** ihtiyacınız vardır. Davet **tek kullanımlık** ve
**sürelidir** (1-30 gün).

Portalda şunları yapabileceksiniz (GOAL-033+ ile birlikte):

- Hayvanlarınızın profilini görüntüleme (GOAL-034)
- Klinik tarafından paylaşılan tıbbi kayıtları inceleme
- Aşı, muayene ve kontrol hatırlatmalarını görme
- Klinikle iletişim (GOAL-035 online randevu talebi)
- KVKK kapsamındaki haklarınızı yönetme (silme, erişim, düzeltme)

## Görevler

### Portal hesabı oluşturma (davet üzerinden)

**Amaç:** Klinik tarafından gönderilen davet bağlantısıyla
VetNiva portal hesabınızı aktive etmek.

**Ön koşul:** Klinik tarafından e-posta adresinize gönderilmiş
davet bağlantısı. Bağlantı 1-30 gün geçerlidir.

**Adımlar:**

1. **E-postanızdaki bağlantıyı açın.** Bağlantı
   `https://app.vetniva.com/portal/accept?token=<uuid>` formundadır.
2. **"Daveti kabul et"** butonuna tıklayın. Sistem sizin için bir
   portal hesabı oluşturur ve sizi otomatik olarak giriş yapar.
3. **Giriş yapıldı.** Artık kliniğinizin paylaştığı
   hayvan(lar)ınızı görebilirsiniz.

**Beklenen sonuç:**

- `https://app.vetniva.com/portal` adresinde kendi hesabınıza
  yönlendirilirsiniz.
- Davet `pending → accepted` olarak işaretlenir; aynı bağlantı
  bir daha kullanılamaz.
- Klinik tarafında audit log'a `audit:portal.invite.accept`
  (info) yazılır.

**Hata durumunda:**

- `VET-PORTAL-0001` ("Portal davet bağlantısı geçersiz. Lütfen
  yenileyin.") — Token süresi dolmuş veya iptal edilmiş.
  Klinikle iletişime geçin; yeni davet oluşturabilirler.
- `VET-PORTAL-0002` ("Portal hesabınız kilitlendi. Klinik ile
  iletişime geçin.") — Davet zaten kabul edilmiş. Aynı
  bağlantı iki kez kullanılamaz; tek giriş ekranından giriş
  yapın (GOAL-033 ile birlikte).

### Hayvanlarımı görüntüleme (GOAL-034 ile birlikte)

**Amaç:** Kendinize ait hayvanların listesini ve temel bilgilerini
görmek.

**Ön koşul:** Aktif portal hesabı + klinik tarafından en az bir
hayvan paylaşılmış olmalı.

**Adımlar:**

1. Portal ana sayfasında "Hayvanlarım" bölümüne gidin.
2. Hayvan kartlarında ad, tür, ırk, doğum tarihi ve son
   muayene tarihini görürsünüz.
3. Bir hayvana tıklayarak detay sayfasına geçebilirsiniz
   (aşı geçmişi, alerjiler, kronik durumlar).

**Güvenlik:** Yalnızca **kendinize ait** hayvanları
görebilirsiniz. Başka bir hasta sahibinin hayvanı sizin
hesabınızda **görünmez**.

### Randevu talebi (GOAL-035 ile birlikte — ileride)

**Amaç:** Klinik ziyareti için online randevu talebi oluşturmak.

**Ön koşul:** Aktif portal hesabı + en az bir hayvan.

**Adımlar (ileride):**

1. Hayvan detay sayfasında "Randevu Talep Et" butonuna tıklayın.
2. Tarih/saat tercihi ve kısa açıklama girin.
3. Talep klinik resepsiyonuna iletilir; onay/ret bildirimi
   portal bildirim kutusuna gelir.

**Beklenen sonuç:** Klinik onayladığında randevu oluşur; e-posta
ve portal bildirimi ile haber verilir.

> Şu an (GOAL-025 sonrası) bu özellik aktiftir; FAZ-3 ile
> birlikte GOAL-035 kapsamında devreye alınacaktır.

## KVKK hakları

VetNiva, **6698 sayılı KVKK** (ve ileride UK GDPR) kapsamında
verilerinizi korur. Aşağıdaki haklarınız geçerlidir:

- **Bilgi edinme hakkı:** Hangi verilerinizin işlendiğini
  öğrenme (`GET /api/v1/portal/me/data-export` — FAZ-3+).
- **Düzeltme hakkı:** Yanlış verilerinizin düzeltilmesini
  isteme. Klinikle iletişime geçin.
- **Silme hakkı:** Belirli verilerinizin silinmesini talep
  etme. Klinik değerlendirir; tıbbi zorunluluk nedeniyle
  reddedebilir (yasal yükümlülük).
- **İletişim izni:** Pazarlama e-postaları için `marketing`
  izninizi portal profilinden (`kvkk.marketing` toggle)
  yönetebilirsiniz.

**Veri saklama:** Tıbbi kayıtlar yasal zorunluluk nedeniyle
**7 yıl** saklanır; bu süre boyunca talep ettiğiniz
erişim/düzeltme işlemleri uygulanır.

## Sık sorulan sorular

**S: Davet bağlantım çalışmıyor, ne yapmalıyım?**
C: Bağlantının süresi dolmuş veya klinik tarafından iptal
edilmiş olabilir. Klinikle iletişime geçin; size yeni bir
davet göndersinler (ücretsiz).

**S: Davet bağlantısını e-postamda bulamıyorum.**
C: Spam/gereksiz klasörünü kontrol edin. Gönderen adres
`noreply@vetniva.com` (veya klinik custom domain) olmalı.
Hâlâ bulamadıysanız klinikten yeni davet isteyin.

**S: Portal hesabımı nasıl silerim?**
C: KVKK kapsamında silme hakkınız saklıdır. Klinikle
iletişime geçin; talebiniz iş kuralı ve yasal zorunluluklar
çerçevesinde değerlendirilir. Tıbbi kayıtlar yasal süre
dolana kadar saklanır.

**S: E-posta adresimi değiştirdim, ne olacak?**
C: Klinikle iletişime geçin; eski davet iptal edilir ve yeni
e-posta adresinize yeni davet gönderilir.

**S: Aynı bağlantıyla ikinci kez giriş yapabilir miyim?**
C: Hayır. Davet tek kullanımlıktır; kabul sonrası `accepted`
olarak işaretlenir. Tekrar giriş için (GOAL-033) portal
login ekranını kullanacaksınız.

**S: Hayvanımın tıbbi kayıtlarını göremiyorum.**
C: Klinik henüz kayıtları paylaşmamış olabilir (GOAL-025
sonrası paylaşım opsiyoneldir). Klinikle iletişime geçin.

**S: Çocuğumun hesabına ben bakabilir miyim?**
C: KVKK gereği 18 yaş altı için veli/vasi onayı gerekir.
Klinikle görüşün; ortak hesap yerine veli adına ayrı
hesap açılması önerilir.

## Güvenlik ve uyum

- **Şifreniz:** GOAL-033 ile birlikte password hash
  saklanır; şu an (GOAL-025 sonrası) session token
  httpOnly cookie olarak bağlanır. Cookie'yi başkasıyla
  paylaşmayın.
- **Cihaz güvenliği:** Ortak bilgisayarda "Beni hatırla"
  seçeneğini kullanmayın; çıkışta tarayıcıyı kapatın.
- **Veri sızıntısı:** Hesabınızdan şüpheli aktivite
  fark ederseniz (tanımadığınız hayvan, garip giriş
  zamanı) hemen klinikle iletişime geçin.
- **KVKK hakları:** Yukarıdaki "KVKK hakları" bölümüne
  bakın; tüm talepleriniz 30 gün içinde yanıtlanır
  (yasal süre).

## Destek

- **Hata durumunda:** Davet/hesap sorunları için doğrudan
  kliniğinizi arayın. `correlation_id` (örn. `req-7c9e...`)
  bilgisi varsa paylaşın.
- **Genel sorular:** `support@vetniva.com` adresine yazın.
- **API dokümanı:** [`docs/api/API_CATALOG.md`](../api/API_CATALOG.md)
- **Hata kataloğu:** [`docs/errors/ERROR_CATALOG.md`](../errors/ERROR_CATALOG.md)
- **KVKK aydınlatma metni:** [`docs/compliance/KVKK_NOTICE.md`](../compliance/KVKK_NOTICE.md)
  (varsa; aksi halde klinikten isteyin)
