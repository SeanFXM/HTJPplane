/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { EIssuesStoreType } from "@plane/types";
// components
import { ListLayoutLoader } from "@/components/ui/loader/layouts/list-layout-loader";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { AllIssueQuickActions } from "../../quick-action-dropdowns";
import { BaseListRoot } from "../base-list-root";

type Props = {
  isLoading?: boolean;
  issuesLoading: boolean;
};

export const WorkspaceListLayout = observer(function WorkspaceListLayout(props: Props) {
  const { isLoading = false, issuesLoading } = props;
  const { workspaceSlug } = useParams();
  const { allowPermissions } = useUserPermissions();
  const {
    issues: { getIssueLoader, groupedIssueIds },
  } = useIssues(EIssuesStoreType.GLOBAL);

  const canEditPropertiesBasedOnProject = useCallback(
    (projectId: string) =>
      Boolean(workspaceSlug) &&
      allowPermissions(
        [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
        EUserPermissionsLevel.PROJECT,
        workspaceSlug.toString(),
        projectId
      ),
    [allowPermissions, workspaceSlug]
  );

  if ((isLoading && issuesLoading && getIssueLoader() === "init-loader") || !groupedIssueIds) {
    return <ListLayoutLoader />;
  }

  if (!workspaceSlug) return null;

  return (
    <BaseListRoot
      QuickActions={AllIssueQuickActions}
      canEditPropertiesBasedOnProject={canEditPropertiesBasedOnProject}
      shouldFetchIssues={false}
    />
  );
});
