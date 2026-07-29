# Skill: Observability, Audit ve Security

## Hata yönetimi

- Her hata benzersiz error code taşır.
- Exception filter hata formatını standartlaştırır.
- Frontend ve backend hataları aynı request/correlation ID ile ilişkilendirilir.
- Hatalar fingerprint ile gruplanır.
- Tenant, şube, kullanıcı, modül ve release bilgisi eklenir.
- PII otomatik maskelenir.
- Kritik hata için alarm kuralı tanımlanır.

## Audit

Audit kaydı en az:

- actor
- tenant
- branch
- action
- entity type
- entity id
- önceki/yeni değer özeti
- zaman
- request id
  içermelidir.

Tıbbi kayıt içeriği doğrudan loglanmaz; alan bazlı değişiklik özeti ve versiyon referansı tutulur.

## Superadmin hata merkezi

Filtreler:

- tenant
- şube
- modül
- severity
- status
- release
- error code
- ilk/son görülme

İş akışı:
Yeni → İnceleniyor → Çözüldü → Tekrar Açıldı

## Güvenlik

- RBAC + gerekli alanlarda ABAC
- Rate limit
- Brute-force koruması
- Session/token rotation
- Güvenli dosya yükleme
- CSRF/XSS/SQLi kontrolleri
- Security event log
- Veri dışa aktarma audit'i
