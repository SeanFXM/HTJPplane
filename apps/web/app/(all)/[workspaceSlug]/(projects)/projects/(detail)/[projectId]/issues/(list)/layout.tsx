/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense, useEffect, useState } from "react";
// components
import { Outlet } from "react-router";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { ProjectIssuesHeader } from "./header";

const ProjectIssuesMobileHeader = lazy(() =>
  import("./mobile-header").then((module) => ({
    default: module.ProjectIssuesMobileHeader,
  }))
);

const MOBILE_HEADER_MEDIA_QUERY = "(max-width: 767px)";

export default function ProjectIssuesLayout() {
  const [shouldRenderMobileHeader, setShouldRenderMobileHeader] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_HEADER_MEDIA_QUERY);
    const loadMobileHeaderWhenNeeded = () => {
      if (mediaQuery.matches) setShouldRenderMobileHeader(true);
    };

    loadMobileHeaderWhenNeeded();
    mediaQuery.addEventListener("change", loadMobileHeaderWhenNeeded);

    return () => mediaQuery.removeEventListener("change", loadMobileHeaderWhenNeeded);
  }, []);

  const mobileHeader = shouldRenderMobileHeader ? (
    <Suspense fallback={null}>
      <ProjectIssuesMobileHeader />
    </Suspense>
  ) : undefined;

  return (
    <>
      <AppHeader header={<ProjectIssuesHeader />} mobileHeader={mobileHeader} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
