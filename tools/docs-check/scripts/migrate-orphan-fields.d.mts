/**
 * @file TypeScript declaration for migrate-orphan-fields.mjs.
 * @module tools/docs-check/scripts/migrate-orphan-fields.d
 * @description GOAL-128 — `.mjs` script'in TypeScript tüketicileri
 *   (test dosyaları) için tip beyanı. Runtime davranışı yok.
 *
 *   Not: Bu declaration `.mjs` ESM modülünü tsc'ye tanıtır.
 *   Sıkı tip kontrolü test tarafında spread/object literal
 *   uyumsuzluğu yaratır; bu nedenle dönüş tipleri gevşek
 *   bırakılmıştır. Runtime doğrulama test'lerin kendisinde
 *   (assert.deepEqual ile) yapılır.
 */

export function parseOrphanList(stdout: string): unknown[];
export function classifyOrphans(orphans: unknown[], mapping: unknown): unknown;
export function renderMarkdown(params: unknown): string;
