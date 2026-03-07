/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Outlet } from "react-router";
import { Loader } from "@plane/ui";
import { AuthenticationWrapper } from "@/lib/wrappers/authentication-wrapper";
import { WorkspaceContentWrapper } from "@/plane-web/components/workspace/content-wrapper";
import { AppRailVisibilityProvider } from "@/plane-web/hooks/app-rail";
import { GlobalModals } from "@/plane-web/components/common/modal/global";
import { WorkspaceAuthWrapper } from "@/layouts/auth-layout/workspace-wrapper";
import type { Route } from "./+types/layout";

const WorkspaceShellFallback = observer(function WorkspaceShellFallback() {
  return (
    <div className="relative size-full overflow-hidden pr-2 pb-2 pl-2">
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-subtle bg-surface-1">
        <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
          <div className="h-5 w-40 animate-pulse rounded bg-layer-2" />
          <div className="h-5 w-24 animate-pulse rounded bg-layer-2" />
        </div>
        <div className="flex-1 p-4">
          <Loader className="space-y-4">
            <Loader.Item height="88px" />
            <Loader.Item height="120px" />
            <Loader.Item height="120px" />
          </Loader>
        </div>
      </div>
    </div>
  );
});

export default function WorkspaceLayout(props: Route.ComponentProps) {
  const { workspaceSlug } = props.params;

  return (
    <AppRailVisibilityProvider>
      <WorkspaceContentWrapper>
        <AuthenticationWrapper fallback={<WorkspaceShellFallback />}>
          <WorkspaceAuthWrapper loadingFallback={<WorkspaceShellFallback />}>
            <GlobalModals workspaceSlug={workspaceSlug} />
            <Outlet />
          </WorkspaceAuthWrapper>
        </AuthenticationWrapper>
      </WorkspaceContentWrapper>
    </AppRailVisibilityProvider>
  );
}
