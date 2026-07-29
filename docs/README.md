# VetNiva — Doküman Haritası

Bu dizin, VetNiva'nın tüm dokümantasyon kaynaklarını içerir.

```
docs/
├── ai/                  # AI bilgi havuzu iskeleti
├── api/                 # API endpoint dokümanları (Markdown)
├── errors/              # Hata kodu kataloğu
├── fields/              # Alan sözlüğü
├── pages/               # Sayfa bilgi kayıtları (YAML, PAGE_KNOWLEDGE_TEMPLATE)
├── permissions/         # Yetki matrisi
├── user-education/      # Türkçe kullanıcı eğitimi
└── workflows/           # İş akışları (Markdown)
```

## Sayfa kataloğu (`docs/pages/`)

Her Next.js sayfası (route) için bir YAML dosyası bulunmalıdır. Şablon:
`templates/PAGE_KNOWLEDGE_TEMPLATE.yaml`. CI kapısı: `pnpm docs:check`.

## API dokümanları (`docs/api/`)

Her NestJS controller endpoint'i için bir Markdown dosyası bulunmalıdır.
OpenAPI JSON'ı `apps/api/openapi.json` (build çıktısı) üzerinden
otomatik üretilir.

## Hata kataloğu (`docs/errors/ERROR_CATALOG.md`)

Tüm API/UI hata kodlarının tek doğruluk kaynağı. Yeni hata kodu ekleme
kuralı: katalog içinde tanımlı.

## Yetki matrisi (`docs/permissions/PERMISSION_MATRIX.md`)

Tüm permission string'lerinin rollere göre dağılımı.

## Alan sözlüğü (`docs/fields/FIELD_GLOSSARY.md`)

Tüm veritabanı alanlarının anlamı, tipi, kısıtları.

## İş akışları (`docs/workflows/`)

Anahtar kullanıcı akışlarının Markdown açıklaması.

## Kullanıcı eğitimi (`docs/user-education/`)

Türkçe kullanım kılavuzları; her rol için ayrı dosya.

## AI bilgi havuzu (`docs/ai/`)

RAG chunk üretimi için metadata ve arama anahtarları.
