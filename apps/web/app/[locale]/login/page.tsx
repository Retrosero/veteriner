/**
 * @file Giris (login) sayfasi.
 * @module @vetniva/web/app/[locale]/login/page
 *
 * @description Klinik personeli ve hasta sahibi portal kullanicilari
 * icin kimlik dogrulama ekrani. Tenant secimi URL'den veya formdan
 * yapilir. GOAL-001 ile birlikte gercek auth backend'i devreye girer;
 * GOAL-000 kapsaminda form UI iskeleti sunulur.
 *
 * Erişilebilirlik:
 * - Form alanlari `<label htmlFor>` ile eslenir
 * - Hata mesajlari `aria-describedby` ile baglanir
 * - Submit sirasinda klavye odagi korunur
 * - Tab sirasi: email → password → forgot → submit → portal
 *
 * @security PII (e-posta) maskelenmeden iletilir; HTTPS zorunlu.
 * Tenant secimi URL subdomain'ine tasinirsa cookie yok sayilabilir.
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import { Button, cn } from "@vetniva/ui";

import { getLabels, type Locale } from "@/lib/labels";

const ICON = {
  email: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  ),
  password: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  eye: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  eyeOff: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6.5 0 10 6 10 6a16 16 0 0 1-2.7 3.4M6.6 6.6A16 16 0 0 0 2 12s3.5 6 10 6c1.5 0 2.8-.3 4-.8M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  ),
  paw: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="14" r="6" />
      <circle cx="6" cy="8" r="2.5" />
      <circle cx="18" cy="8" r="2.5" />
      <circle cx="9" cy="4" r="2" />
      <circle cx="15" cy="4" r="2" />
    </svg>
  ),
} as const;

type LoginFormState = {
  email: string;
  password: string;
  showPassword: boolean;
  submitting: boolean;
  error: string | null;
};

export default function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }> | { locale: string };
}): JSX.Element {
  const router = useRouter();
  const { locale: rawLocale } =
    params instanceof Promise ? { locale: "tr-TR" } : params;
  const locale = (rawLocale === "en-GB" ? "en-GB" : "tr-TR") as Locale;
  const labels = getLabels(locale);
  const formId = useId();

  const [state, setState] = useState<LoginFormState>({
    email: "",
    password: "",
    showPassword: false,
    submitting: false,
    error: null,
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (state.submitting) return;
    if (!state.email || !state.password) {
      setState((s) => ({ ...s, error: labels.login.error.required }));
      return;
    }
    setState((s) => ({ ...s, submitting: true, error: null }));
    // GOAL-001: gerçek auth backend'i entegre edilecek.
    // Simülasyon: 600ms sonra dashboard'a yönlendir.
    setTimeout(() => {
      router.push(`/${locale}/dashboard`);
    }, 600);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-clinic-50/40 via-white to-white">
      {/* Arka plan paw deseni */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, currentColor 1.5px, transparent 2px), radial-gradient(circle at 80% 60%, currentColor 1.5px, transparent 2px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-12 sm:px-6">
        <Link
          href={`/${locale}`}
          className="mb-8 flex items-center gap-2"
          aria-label={labels.brand.name}
        >
          <span
            aria-hidden="true"
            className="grid h-10 w-10 place-items-center rounded-xl bg-clinic-700 text-white"
          >
            <span className="h-6 w-6">{ICON.paw}</span>
          </span>
          <span className="text-lg font-semibold text-clinic-800">
            {labels.brand.name}
          </span>
        </Link>

        <div className="w-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <header className="mb-6 text-center">
            <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">
              {labels.login.title}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {labels.login.subtitle}
            </p>
          </header>

          <form
            id={formId}
            onSubmit={handleSubmit}
            noValidate
            className="space-y-4"
            aria-describedby={state.error ? `${formId}-error` : undefined}
          >
            {/* Email */}
            <div>
              <label
                htmlFor={`${formId}-email`}
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                {labels.login.emailLabel}
              </label>
              <div className="relative">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 grid w-10 place-items-center text-gray-400"
                >
                  <span className="h-4 w-4">{ICON.email}</span>
                </span>
                <input
                  id={`${formId}-email`}
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  required
                  value={state.email}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      email: e.target.value,
                      error: null,
                    }))
                  }
                  placeholder={labels.login.emailPlaceholder}
                  aria-invalid={state.error ? "true" : undefined}
                  className="h-10 w-full rounded-md border border-gray-300 bg-white pl-10 pr-3 text-sm placeholder:text-gray-400 focus:border-clinic-500 focus:outline-none focus:ring-1 focus:ring-clinic-500 aria-[invalid=true]:border-danger-500 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-danger-500"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label
                  htmlFor={`${formId}-password`}
                  className="block text-sm font-medium text-gray-700"
                >
                  {labels.login.passwordLabel}
                </label>
                <Link
                  href={`/${locale}/forgot`}
                  className="text-xs font-medium text-clinic-700 hover:text-clinic-800 hover:underline"
                >
                  {labels.login.forgotPassword}
                </Link>
              </div>
              <div className="relative">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 grid w-10 place-items-center text-gray-400"
                >
                  <span className="h-4 w-4">{ICON.password}</span>
                </span>
                <input
                  id={`${formId}-password`}
                  type={state.showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={state.password}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      password: e.target.value,
                      error: null,
                    }))
                  }
                  placeholder={labels.login.passwordPlaceholder}
                  aria-invalid={state.error ? "true" : undefined}
                  className="h-10 w-full rounded-md border border-gray-300 bg-white pl-10 pr-10 text-sm placeholder:text-gray-400 focus:border-clinic-500 focus:outline-none focus:ring-1 focus:ring-clinic-500 aria-[invalid=true]:border-danger-500 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-danger-500"
                />
                <button
                  type="button"
                  onClick={() =>
                    setState((s) => ({ ...s, showPassword: !s.showPassword }))
                  }
                  aria-label={
                    state.showPassword
                      ? labels.login.passwordLabel + " gizle"
                      : labels.login.passwordLabel + " göster"
                  }
                  className="absolute inset-y-0 right-0 grid w-10 place-items-center text-gray-400 hover:text-gray-600"
                >
                  <span className="h-4 w-4">
                    {state.showPassword ? ICON.eyeOff : ICON.eye}
                  </span>
                </button>
              </div>
            </div>

            {/* Hata mesajı */}
            {state.error ? (
              <p
                id={`${formId}-error`}
                role="alert"
                className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
              >
                {state.error}
              </p>
            ) : null}

            {/* Submit */}
            <Button
              type="submit"
              size="lg"
              fullWidth
              disabled={state.submitting}
            >
              {state.submitting
                ? labels.login.submitPending
                : labels.login.submit}
            </Button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-gray-400">
            <span aria-hidden="true" className="h-px flex-1 bg-gray-200" />
            <span>{labels.login.or}</span>
            <span aria-hidden="true" className="h-px flex-1 bg-gray-200" />
          </div>

          <Link href={`/${locale}/portal-login`}>
            <Button type="button" variant="secondary" size="lg" fullWidth>
              {labels.login.portalEntry}
            </Button>
          </Link>
          <p className="mt-2 text-center text-xs text-gray-500">
            {labels.login.portalHelp}
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          {labels.login.footer}
        </p>
      </div>
    </div>
  );
}
