/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { redirectUnavailableProductArea } from "@/app/routes/guards/product-policy";
import type { Route } from "./+types/page";

export const clientLoader = ({ params }: Route.ClientLoaderArgs) =>
  redirectUnavailableProductArea(params, "billing", `/${params.workspaceSlug}/settings`);

export default function BillingSettingsPage() {
  return null;
}
