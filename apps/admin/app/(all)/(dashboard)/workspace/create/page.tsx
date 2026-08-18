/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { getButtonStyling } from "@plane/propel/button";
import { Loader } from "@plane/ui";
// components
import { PageWrapper } from "@/components/common/page-wrapper";
import { getInternalAdminPageTitle } from "@/constants/branding";
import { useInstance } from "@/hooks/store";
// types
import type { Route } from "./+types/page";
// local
import { WorkspaceCreateForm } from "./form";

const WorkspaceCreatePage = observer(function WorkspaceCreatePage(_props: Route.ComponentProps) {
  const { config, isLoading } = useInstance();

  if (isLoading || !config) {
    return (
      <PageWrapper
        header={{
          title: "Workspace policy",
          description: "Checking the Hotone Japan workspace policy before loading this page.",
        }}
      >
        <Loader>
          <Loader.Item height="40px" width="50%" />
        </Loader>
      </PageWrapper>
    );
  }

  if (config.is_workspace_creation_disabled) {
    return (
      <PageWrapper
        header={{
          title: "Workspace creation is disabled",
          description: "Hotone Japan uses one internal workspace. Invite teammates to the existing workspace instead.",
        }}
      >
        <Link href="/workspace" className={getButtonStyling("secondary", "lg")}>
          Back to workspace management
        </Link>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      header={{
        title: "Create a new workspace on this instance.",
        description: "You will need to invite users from Workspace Settings after you create this workspace.",
      }}
    >
      <WorkspaceCreateForm />
    </PageWrapper>
  );
});

export const meta: Route.MetaFunction = () => [{ title: getInternalAdminPageTitle("Create workspace") }];

export default WorkspaceCreatePage;
