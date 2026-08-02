# Merkezi Hata Olayları

`error_events`, backend ve istemci hatalarının PII maskelenmiş merkezi
aggregate deposudur. Her kayıt request ID, tenant/şube/kullanıcı bağlamı,
modül, route, sürüm, severity, hata kodu, fingerprint ve güvenli context
bilgisini içerir.

## Kalıcılık ve gruplama

- Aynı tenant içindeki aynı fingerprint tek aggregate satırında tutulur.
- Tekrarlar `occurrence_count` ile sayılır; `first_seen_at` ilk, `last_seen_at`
  son görülme zamanıdır.
- Tenant'sız sistem olayları ayrı fingerprint alanında tutulur.
- Hata mesajı, context ve stack teknik tanı için saklanır; context uygulama
  katmanında PII maskelenmeden veritabanına yazılamaz.

## Tenant güvenliği

- Uygulama tenant olayı yazarken aynı transaction içinde `app.tenant_id`
  değerini kurar.
- RLS, tenant bağlamı olmayan runtime rolünün tenant olayını okumasını veya
  yazmasını engeller.
- Tenant'sız sistem olayı yalnız `app.system_write=true` bağlamıyla yazılabilir.
- SUPERADMIN hata merkezi kayıtları okuyabilir; normal tenant kullanıcıları
  superadmin hata merkezi endpoint'lerine erişemez.

## Operasyonel davranış

Exception filter hata yanıtını geciktirmez. Kalıcı hata kaydı best-effort
çalışır; veritabanı yazımı başarısız olursa asıl HTTP hata yanıtı korunur ve
sorun sistem loguna düşer.
