# Skill: Senior Backend — NestJS

## Standartlar

- Feature-based modül yapısı kullan.
- Controller yalnızca request/response katmanıdır.
- Use-case/application servisleri iş akışını yönetir.
- Domain servisleri saf iş kurallarını taşır.
- Repository interface kullan; Prisma erişimini infrastructure katmanında tut.
- DTO validation için class-validator veya eşdeğer bir standart kullan.
- Domain hatalarını sabit error code ile üret.
- Transaction sınırlarını açıkça tanımla.
- Idempotency gerektiren endpointlerde idempotency key kullan.
- Queue job'ları tekrar çalışmaya dayanıklı tasarla.
- Outbox pattern ile kritik event kaybını önle.
- Tenant context olmadan repository çalıştırma.
- API response içinde gereksiz kişisel veri döndürme.

## Zorunlu testler

- Service unit test
- Repository integration test
- API authorization test
- Tenant isolation test
- Duplicate request/idempotency test
- Transaction rollback test
