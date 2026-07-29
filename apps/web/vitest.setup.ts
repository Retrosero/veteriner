/**
 * @file apps/web vitest global setup.
 * @module @vetniva/web/vitest.setup
 *
 * @description Test ortamında Next.js App Router API'leri (usePathname,
 * useRouter, Link) mock'lanır. Bu sayede `Sidebar`/`TopBar`/
 * `LocaleSwitcher` gibi client component'ler App Router context'i
 * olmadan da render edilebilir.
 *
 * Not: Server tarafı component test'leri (`HealthPage` gibi) mock'lu
 * `apiClient` üzerinden çalışır; bu dosya yalnızca React/Next.js
 * runtime API'lerini stub'lar.
 */

import "@testing-library/jest-dom/vitest";

import { vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tr-TR",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => {
    const React = require("react") as typeof import("react");
    return React.createElement("a", { href, ...rest }, children);
  },
}));

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    ...rest
  }: {
    src: string;
    alt: string;
    [key: string]: unknown;
  }) => {
    const React = require("react") as typeof import("react");
    return React.createElement("img", { src, alt, ...rest });
  },
}));
