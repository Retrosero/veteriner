/**
 * @file Süper admin route grubu layout'u.
 * @module @vetniva/web/app/[locale]/superadmin/layout
 * @description FAZ-10 SUPERADMIN paneli için ortak layout. Tüm
 * `/[locale]/superadmin/*` sayfalarını sarmalayıcı bir sunucu
 * bileşenidir. SUPERADMIN oturum kontrolü ve `audit:log:read`
 * yetkisi burada uygulanır; başarısız doğrulamada 403 ile döner.
 *
 * Not (GOAL-100 next-tick): Gerçek oturum/permission doğrulaması
 * Faz 1 (Tenant/Auth) altyapısı hazır olduğunda aktif olur. Bu
 * tick'te (foundation) yalnızca yapı kurulur; auth sözleşmesi
 * `requireSuperadmin()` yardımcısı ile tutulur.
 * @security Tenant filtreleri SUPERADMIN uçlarında uygulanmaz; her
 * sayfa kendi izin kontrolünden sorumludur. Bu layout yalnızca
 * "SUPERADMIN mi?" sorusuna yanıt verir, tenant IDOR kontrolünü
 * devralmaz.
 */

import { SUPPORTED_LOCALES, type Locale } from "@vetniva/contracts";
import { notFound, redirect } from "next/navigation";
import { type ReactNode } from "react";

import { getLabels } from "@/lib/labels";

type LocaleParams = {
  locale: string;
};

type SuperadminLayoutProps = {
  children: ReactNode;
  params: Promise<LocaleParams> | LocaleParams;
};

/**
 * Locale segmentini doğrular; geçersizse 404.
 * @param params
 */
async function resolveLocale(
  params: SuperadminLayoutProps["params"],
): Promise<Locale> {
  const resolved = await Promise.resolve(params);
  const candidate = resolved.locale;
  if ((SUPPORTED_LOCALES as readonly string[]).includes(candidate)) {
    return candidate as Locale;
  }
  notFound();
}

/**
 * SUPERADMIN oturum kontrolü. Faz 1 (GOAL-001+) ile birlikte gerçek
 * oturum doğrulaması burada yapılacak; foundation tick'inde
 * yapıyı kuralım diye bir sözleşme (guard) fonksiyonu olarak
 * bırakılmıştır. Şu an her SUPERADMIN rotayı erişilebilir sayar;
 * sayfa düzeyinde (controller seviyesinde) zaten `audit:log:read`
 * permission kontrolü uygulanır.
 *
 * Geliştirici notu: Gerçek oturum kontrolü geldiğinde
 * `requireSuperadmin()` çağrısı yeterlidir; bu katman değişmez.
 */
function requireSuperadmin(_locale: Locale): { name: string; role: string } | null {
  // TODO(faz-1): session/permission doğrulaması.
  // Başarısızsa `redirect(\`/\${locale}/login\`)` veya `notFound()`.
  return {
    name: "Süper Admin",
    role: "SUPERADMIN",
  };
}

/**
 *
 * @param root0
 * @param root0.children
 * @param root0.params
 */
export default async function SuperadminLayout({
  children,
  params,
}: SuperadminLayoutProps): Promise<JSX.Element> {
  const locale = await resolveLocale(params);
  const session = requireSuperadmin(locale);
  if (!session) {
    // İleride: redirect veya notFound.
    redirect(`/${locale}/login`);
  }
  const labels = getLabels(locale);

  return (
    <div
      aria-label={labels.superadmin.breadcrumb.root}
      data-permission-scope="superadmin"
    >
      {children}
    </div>
  );
}
