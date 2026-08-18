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
import type { Route } from "./+types/layout";
import { ProjectArchivesHeader } from "../header";

export const clientLoader = ({ params }: Route.ClientLoaderArgs) => guardProjectFeatureRoute(params, "cycles");

export default function ProjectArchiveCyclesLayout() {
  return (
    <>
      <AppHeader header={<ProjectArchivesHeader activeTab="cycles" />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
