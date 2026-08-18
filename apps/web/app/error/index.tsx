/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// layouts
import { DevErrorComponent } from "./dev";
import { createErrorReference } from "./error-reference";
import { ProdErrorComponent } from "./prod";

const reloadPage = () => window.location.reload();

export function CustomErrorComponent({ error }: { error: unknown }) {
  // router
  const router = useAppRouter();

  const handleGoHome = () => router.push("/");
  const errorReference = createErrorReference(error, "WEB");

  useEffect(() => {
    console.error(`[${errorReference}]`, error);
  }, [error, errorReference]);

  if (import.meta.env.DEV) {
    return <DevErrorComponent error={error} onGoHome={handleGoHome} onReload={reloadPage} />;
  }

  return <ProdErrorComponent errorReference={errorReference} onGoHome={handleGoHome} onReload={reloadPage} />;
}
