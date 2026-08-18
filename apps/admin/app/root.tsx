/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useEffect } from "react";
import { Links, Meta, Outlet, Scripts } from "react-router";
import { Button } from "@plane/propel/button";
import type { LinksFunction } from "react-router";
import { LogoSpinner } from "@/components/common/logo-spinner";
import { INTERNAL_ADMIN_DESCRIPTION, INTERNAL_ADMIN_NAME } from "@/constants/branding";
import globalStyles from "@/styles/globals.css?url";
import { AppProviders } from "@/providers";
import { createErrorReference } from "./error-reference";
import type { Route } from "./+types/root";
// fonts
// eslint-disable-next-line import/no-unassigned-import -- font side effects
import "@fontsource-variable/inter";
import interVariableWoff2 from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
// eslint-disable-next-line import/no-unassigned-import -- font side effects
import "@fontsource/material-symbols-rounded";
// eslint-disable-next-line import/no-unassigned-import -- font side effects
import "@fontsource/ibm-plex-mono";

const INTERNAL_ADMIN_FAVICON =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2064%2064'%3E%3Crect%20width='64'%20height='64'%20rx='14'%20fill='%230f172a'/%3E%3Ctext%20x='32'%20y='40'%20text-anchor='middle'%20font-family='Arial,sans-serif'%20font-size='25'%20font-weight='700'%20fill='white'%3EHJ%3C/text%3E%3C/svg%3E";

export const links: LinksFunction = () => [
  { rel: "icon", type: "image/svg+xml", href: INTERNAL_ADMIN_FAVICON },
  { rel: "stylesheet", href: globalStyles },
  {
    rel: "preload",
    href: interVariableWoff2,
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
        <Scripts />
      </body>
    </html>
  );
}

export const meta: Route.MetaFunction = () => [
  { title: INTERNAL_ADMIN_NAME },
  { name: "description", content: INTERNAL_ADMIN_DESCRIPTION },
  { name: "robots", content: "noindex, nofollow" },
];

export default function Root() {
  return (
    <div className="min-h-screen bg-canvas">
      <Outlet />
    </div>
  );
}

export function HydrateFallback() {
  return (
    <div className="relative flex h-screen w-full items-center justify-center bg-canvas">
      <LogoSpinner />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const errorReference = createErrorReference(error, "ADMIN");

  useEffect(() => {
    console.error(`[${errorReference}]`, error);
  }, [error, errorReference]);

  return (
    <div className="grid min-h-screen place-items-center bg-canvas p-6">
      <section className="w-full max-w-lg rounded-lg border border-subtle bg-surface-1 p-6 shadow-raised-100">
        <div className="space-y-2">
          <h1 className="text-20 font-semibold text-primary">Admin page unavailable</h1>
          <p className="text-14 text-secondary">
            Try loading this page again. If it still fails, return to general settings and share the error reference
            with the internal support team.
          </p>
          <p className="font-code text-12 text-tertiary">Error reference: {errorReference}</p>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <Button variant="primary" size="lg" onClick={() => window.location.reload()}>
            Try again
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => window.location.assign(`${import.meta.env.BASE_URL}general/`)}
          >
            General settings
          </Button>
        </div>
      </section>
    </div>
  );
}
