/**
 * @file Sözlük erişimleri için güvenli lookup helper'ları.
 * @module @vetniva/web/lib/safe-lookup
 * @description eslint-plugin-security `detect-object-injection` kuralı
 * `obj[dynamicKey]` erişimlerini prototype pollution riski nedeniyle
 * reddeder. Bu dosya, kuralın tanıdığı `Object.prototype.hasOwnProperty.call`
 * guard desenini uygulayan küçük helper'lar sunar; böylece her callsite'te
 * uzun guard ifadesi yazmaya gerek kalmaz.
 *
 * Neden bu kural kritik: `obj[__proto__]`, `obj[constructor]`, `obj[toString]`
 * gibi anahtarlar `Object.prototype` üzerinden beklenmeyen değerler
 * döndürebilir. `Record<EnumType, string>` tipi compile-time'da anahtarı
 * sınırlandırsa bile runtime'da API'den gelen veri beklenmeyen anahtarlar
 * taşıyabilir; bu nedenle runtime guard'ı zorunludur.
 *
 * Tip güvenliği: `K extends string` jenerik parametresi sayesinde
 * `Record<K, V>` ile çağrıldığında dönüş tipi doğru daraltılır.
 */

/**
 * `Record<K, string>` sözlüğünden `key` ile güvenli okuma yapar.
 * Anahtar sözlüğe ait değilse `fallback` döner.
 *
 * Neden `Object.prototype.hasOwnProperty.call`: Bu çağrı kural tarafından
 * tanınan resmi guard desenidir. `Object.hasOwn` da eşdeğerdir ancak
 * `hasOwnProperty.call` sözdizimi kuralın AST analizinde daha güvenilir
 * şekilde eşleşir.
 * @param map
 * @param key
 * @param fallback
 */
export function safeLabelLookup<K extends string>(
  map: Readonly<Record<K, string>>,
  key: string,
  fallback: string,
): string {
  if (Object.prototype.hasOwnProperty.call(map, key)) {
    return map[key as K];
  }
  return fallback;
}

/**
 * `Record<K, string | null>` sözlüğünden `key` ile güvenli okuma. Anahtar
 * sözlüğe ait değilse veya değer `null` ise `null` döner; aksi halde
 * string değeri döndürür.
 * @param map
 * @param key
 */
export function safeLabelLookupOrNull<K extends string>(
  map: Readonly<Record<K, string | null>>,
  key: string,
): string | null {
  if (Object.prototype.hasOwnProperty.call(map, key)) {
    const v = map[key as K];
    return typeof v === "string" ? v : null;
  }
  return null;
}

/**
 * `Record<K, V>` sözlüğünde `key` için güvenli ref erişimi (örn. DOM
 * elemanları). Anahtar sözlüğe ait değilse `undefined` döner.
 * @param map
 * @param key
 */
export function safeRefLookup<K extends string, V>(
  map: Readonly<Record<K, V>>,
  key: string,
): V | undefined {
  if (Object.prototype.hasOwnProperty.call(map, key)) {
    return map[key as K];
  }
  return undefined;
}

/**
 * `Record<K, V>` sözlüğüne `key` ile güvenli yazma. Anahtar sözlüğe
 * ait değilse atama yapılmaz (sessizce yok sayılır). `set` callback'i
 * sözlüğün gerçek anahtarına eriştiği için kural tetiklenmez.
 * @param map
 * @param key
 * @param value
 */
export function safeRefAssign<K extends string, V>(
  map: Record<K, V>,
  key: string,
  value: V,
): void {
  if (Object.prototype.hasOwnProperty.call(map, key)) {
    map[key as K] = value;
  }
}
