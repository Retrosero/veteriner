# Goal Mode Çalışma Akışı

## Goal boyutu

İdeal bir goal:

- tek bir iş akışını uçtan uca tamamlar,
- 1–3 gün içinde değerlendirilebilir büyüklüktedir,
- açık kabul kriterleri içerir,
- bağımsız test edilebilir,
- başka goal'ların kapsamını gizlice üstlenmez.

Yanlış:
`Klinik modülünü tamamla.`

Doğru:
`Hasta sahibi ve hayvan oluşturma akışını API, UI, yetki, audit, test ve dokümantasyonla tamamla.`

## Goal sırası

1. Context yükle
2. Mevcut durumu incele
3. Tasarım/plan yaz
4. Riskleri belirt
5. Uygula
6. Test et
7. Log/audit doğrula
8. Dokümantasyonu güncelle
9. Completion report yaz
10. Orchestrator review

## Goal durumları

- Draft
- Ready
- In Progress
- Review
- Blocked
- Completed
- Reopened

## Goal başlatma ön koşulları

- Bağımlı goal'lar tamamlanmış
- Kabul kriterleri yazılmış
- Veri modeli etkisi belirlenmiş
- Yetki matrisi belli
- Log/audit beklentisi belli
- Dokümantasyon çıktıları belli

## Goal bitirme ön koşulları

- Kod birleşmeye hazır
- Testler geçti
- Migration güvenli
- Tenant izolasyonu geçti
- Hata merkezi çalışıyor
- Dokümanlar güncel
- Pilot test senaryosu hazır
