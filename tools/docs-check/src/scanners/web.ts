import fg from "fast-glob";
import type { RouteInfo } from "../types.js";

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

async function pathExists(p: string): Promise<boolean> {
  try {
    return (await fg(["."], { cwd: p, onlyFiles: false, deep: 0 })).length > 0;
  } catch {
    return false;
  }
}
