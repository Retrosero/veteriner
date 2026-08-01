/**
 * @file Dosya modülü DI tokenları.
 * @module apps/api/modules/file/file.tokens
 *
 * @description Storage ve tarama adapter sözleşmeleri çalışma zamanında
 * TypeScript interface'i olarak bulunmadığından NestJS provider tokenları
 * ile çözülür. Tokenlar modülden ayrıdır; service-module import döngüsü
 * oluşmasını engeller.
 *
 * @security Adapter seçimi yalnızca sunucu yapılandırmasından gelir.
 */

export const STORAGE_ADAPTER = Symbol("STORAGE_ADAPTER");
export const SCAN_ADAPTER = Symbol("SCAN_ADAPTER");
