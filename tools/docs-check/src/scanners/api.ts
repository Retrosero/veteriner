/**
 * @file NestJS controller tarayıcısı.
 * @module @vetniva/docs-check/scanners/api
 * @description `@Controller(...)` ve HTTP method dekoratörlerini
 * (`@Get`, `@Post`, ...) regex ile bularak API route'larını çıkarır.
 * Bu, statik analiz temelli bir çıkarımdır; dinamik prefix'ler
 * desteklenmez.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";

import type { RouteInfo } from "../types.js";

const HTTP_DECORATORS = ["Get", "Post", "Put", "Patch", "Delete"] as const;
type HttpMethod = (typeof HTTP_DECORATORS)[number];

const CONTROLLER_RE = /@Controller\(\s*['"`]([^'"`]*)['"`]\s*\)/;

// String concatenation ile uretilir; TypeScript 5.9 template literal icinde
// backtick escape'i bazi dosyalarda yanlis parse edebiliyor. Bu nedenle
// regex pattern string olarak uretilip `new RegExp(...)` ile derlenir.
const METHOD_PATTERN =
  "@(" +
  HTTP_DECORATORS.join("|") +
  ")\\(\\s*" +
  "['\"`]" +
  "([^" +
  "'\"" +
  "`]*)" +
  "['\"`]" +
  "\\s*\\)";
// eslint-disable-next-line security/detect-non-literal-regexp -- Pattern yalnızca sabit HTTP_DECORATORS listesinden derlenir.
const METHOD_RE = new RegExp(METHOD_PATTERN, "g");

/**
 * API controller kaynaklarından HTTP route envanterini çıkarır.
 * @param appsApiRoot
 */
export async function scanApiRoutes(appsApiRoot: string): Promise<RouteInfo[]> {
  const exists = await pathExists(appsApiRoot);
  if (!exists) return [];

  const files = await fg(["src/modules/**/*.controller.ts"], {
    cwd: appsApiRoot,
    absolute: false,
    onlyFiles: true,
  });

  const routes: RouteInfo[] = [];
  for (const rel of files) {
    const abs = path.join(appsApiRoot, rel);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Yol repo kökü ve glob sonucu ile sınırlıdır.
    const source = await readFile(abs, "utf8");
    const controllerMatch = source.match(CONTROLLER_RE);
    const controllerPrefix = controllerMatch?.[1] ?? "";

    for (const match of source.matchAll(METHOD_RE)) {
      const method = match[1] as HttpMethod;
      const subPath = match[2] ?? "";
      const fullPath = joinPaths(controllerPrefix, subPath);
      const docKey = `api.${method.toLowerCase()}.${fullPath.replace(/\//g, "_").replace(/:/g, "_") || "root"}`;
      routes.push({
        path: `${method} ${fullPath}`,
        method: method as RouteInfo["method"],
        docKey,
      });
    }
  }
  return routes;
}

/**
 * Controller ve method yol parçalarını tek normalize route olarak birleştirir.
 * @param a
 * @param b
 */
function joinPaths(a: string, b: string): string {
  const left = a.replace(/^\/|\/$/g, "");
  const right = b.replace(/^\/|\/$/g, "");
  if (!left) return "/" + right;
  if (!right) return "/" + left;
  return `/${left}/${right}`;
}

/**
 * Bir dizinin tarama için erişilebilir olup olmadığını doğrular.
 * @param p
 */
async function pathExists(p: string): Promise<boolean> {
  try {
    return (await fg(["."], { cwd: p, onlyFiles: false, deep: 0 })).length > 0;
  } catch {
    return false;
  }
}
