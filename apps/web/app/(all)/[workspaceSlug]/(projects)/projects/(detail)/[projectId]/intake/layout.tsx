/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet } from "react-router";
// components
import { guardProjectFeatureRoute } from "@/app/routes/guards/product-policy";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { ProjectInboxHeader } from "@/plane-web/components/projects/settings/intake/header";
import type { Route } from "./+types/layout";

export const clientLoader = ({ params }: Route.ClientLoaderArgs) => guardProjectFeatureRoute(params, "intake");

export default function ProjectInboxIssuesLayout() {
  return (
    <>
      <AppHeader header={<ProjectInboxHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
