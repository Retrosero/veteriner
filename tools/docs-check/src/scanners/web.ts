/**
 * @file Next.js App Router sayfa tarayıcısı.
 * @module @vetniva/docs-check/scanners/web
 * @description `app/[locale]/page.tsx` dosyalarını bularak
 * Next.js App Router sayfalarını çıkarır. `[locale]` dinamik
 * segmentini `:locale` placeholder'ına dönüştürür ve
 * `docs/pages/web.<route>.yaml` anahtarını üretir. Bu statik
 * analizdir; route group'lar (parantezli klasörler) ve paralel
 * route'lar bu sürümde desteklenmez.
 */

import fg from "fast-glob";

import type { RouteInfo } from "../types.js";

/**
 * Next.js App Router sayfalarından web route envanterini çıkarır.
 * @param appsWebRoot
 */
export async function scanWebRoutes(appsWebRoot: string): Promise<RouteInfo[]> {
  const exists = await pathExists(appsWebRoot);
  if (!exists) return [];

  const files = await fg(["app/**/page.tsx", "app/**/page.ts"], {
    cwd: appsWebRoot,
    absolute: false,
    onlyFiles: true,
  });

  return files.map((rel): RouteInfo => {
    const route =
      "/" + rel.replace(/\/page\.tsx?$/, "").replace(/\[locale\]/g, ":locale");
    const docKey =
      "pages/web." +
      rel
        .replace(/\/page\.tsx?$/, "")
        .replace(/\//g, ".")
        .replace(/\[locale\]/g, "locale");
    return { path: route, docKey };
  });
}

/**
 * Bir web uygulama dizininin tarama için erişilebilir olduğunu doğrular.
 * @param p
 */
async function pathExists(p: string): Promise<boolean> {
  try {
    return (await fg(["."], { cwd: p, onlyFiles: false, deep: 0 })).length > 0;
  } catch {
    return false;
  }
}
