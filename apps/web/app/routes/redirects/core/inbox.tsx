/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { guardProjectFeatureRoute } from "@/app/routes/guards/product-policy";
import type { Route } from "./+types/inbox";

export const clientLoader = ({ params }: Route.ClientLoaderArgs) => guardProjectFeatureRoute(params, "intake");

export default function Inbox() {
  return null;
}
