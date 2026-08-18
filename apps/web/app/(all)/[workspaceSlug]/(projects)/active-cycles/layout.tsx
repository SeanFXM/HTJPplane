/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { Outlet } from "react-router";
import { guardProjectFeatureRoute } from "@/app/routes/guards/product-policy";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
// local imports
import type { Route } from "./+types/layout";
import { WorkspaceActiveCycleHeader } from "./header";

export const clientLoader = ({ params }: Route.ClientLoaderArgs) => guardProjectFeatureRoute(params, "cycles");

export default function WorkspaceActiveCycleLayout() {
  return (
    <>
      <AppHeader header={<WorkspaceActiveCycleHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
