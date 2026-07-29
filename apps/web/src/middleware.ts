/**
 * @file Next.js middleware — locale doğrulama.
 * @module @vetniva/web/middleware
 *
 * @description İstek geldiğinde pathname'in desteklenen bir locale ile
 * başlayıp başlamadığını denetler. Desteklenmeyen bir locale veya locale
 * eksikse, kullanıcıyı varsayılan locale'e yönlendirir. Statik
 * dosyalar, API route'ları ve Next.js iç rotaları matcher tarafından
 * dışlanır.
 *
 * @security Yanlış/eksik locale ile gelen istekler yönlendirilir; böylece
 * tenant bağlamı tutarsız başlamaz. Matcher, API rotalarını dışarıda
 * bırakarak API'nin kendi i18n davranışını korumasını sağlar.
 */

import { NextResponse, type NextRequest } from "next/server";

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type Locale,
} from "@vetniva/contracts";

const LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);

/**
 * Verilen pathname'in ilk segmentinin geçerli bir locale olup olmadığını
 * döner. true dönerse locale segmenti korunur; aksi halde yönlendirme
 * tetiklenir.
 */
function isLocaleSegment(segment: string): segment is Locale {
  return LOCALE_SET.has(segment);
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Middleware'in çalışmaması gereken rotalar matcher tarafından zaten
  // dışlanır; burada yeniden kontrol savunma amaçlıdır.
  if (pathname.startsWith("/_next") || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Statik dosyalar (uzantı içeren path) yönlendirilmez.
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) {
    return NextResponse.next();
  }

  const firstSegment = pathname.split("/").filter(Boolean)[0] ?? "";
  if (isLocaleSegment(firstSegment)) {
    return NextResponse.next();
  }

  // Locale yoksa veya desteklenmiyorsa, varsayılan locale'e yönlendir.
  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

/**
 * Middleware'in çalışacağı path'ler. API, Next.js iç rotaları ve statik
 * dosyalar bilinçli olarak dışlanır.
 */
export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
