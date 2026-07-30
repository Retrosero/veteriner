# GET /api/v1/health

Liveness kontrolü. Sürecin ayakta olduğunu doğrular; herhangi bir
bağımlılığı test etmez.

- **Modül:** health
- **Yetki:** Public (kimlik doğrulama gerektirmez)
- **Response 200:** `{ status: "ok", timestamp: "ISO 8601" }`
