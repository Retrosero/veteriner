# Skill: DevOps ve Sürdürülebilir Dağıtım

## Ortamlar

- local
- test
- staging
- production

## CI kapıları

- install
- lint
- type-check
- unit test
- integration test
- build
- migration validation
- tenant isolation test
- e2e smoke
- documentation validation
- container scan

## Dağıtım

- Migration önce çalıştırılır ve geri dönüş planı bulunur.
- Zero/low downtime hedeflenir.
- Feature flag ile riskli özellikler açılır.
- Release numarası loglara eklenir.
- Hata oranı yükselirse rollback yapılabilir.
- Production secret değerleri merkezi secret manager'da tutulur.

## Yedekleme

- Otomatik PostgreSQL yedeği
- Object storage yedeği
- Düzenli restore testi
- Tenant bazlı dışa aktarma
- RPO/RTO hedefleri dokümante edilir
