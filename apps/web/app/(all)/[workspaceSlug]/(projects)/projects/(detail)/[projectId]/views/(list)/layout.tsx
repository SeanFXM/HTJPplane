/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet } from "react-router";
import { guardProjectFeatureRoute } from "@/app/routes/guards/product-policy";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
// local components
import type { Route } from "./+types/layout";
import { ProjectViewsHeader } from "./header";
import { ViewMobileHeader } from "./mobile-header";

export const clientLoader = ({ params }: Route.ClientLoaderArgs) => guardProjectFeatureRoute(params, "views");

export default function ProjectViewsListLayout() {
  return (
    <>
      <AppHeader header={<ProjectViewsHeader />} mobileHeader={<ViewMobileHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
