# GET /api/v1/health/ready

Readiness kontrolü. Veritabanı bağlantısını test eder; `down` dönerse
yük dengeleyici trafiği keser.

- **Modül:** health
- **Yetki:** Public
- **Response 200/503:** `ReadinessResponse` şemasına uygun
