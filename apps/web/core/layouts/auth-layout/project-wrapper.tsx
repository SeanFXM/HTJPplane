/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { usePathname } from "next/navigation";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { GANTT_TIMELINE_TYPE } from "@plane/types";
// components
import { ProjectAccessRestriction } from "@/components/auth-screens/project/project-access-restriction";
import {
  PROJECT_DETAILS,
  PROJECT_ME_INFORMATION,
  PROJECT_LABELS,
  PROJECT_MEMBERS,
  PROJECT_MEMBER_PREFERENCES,
  PROJECT_STATES,
  PROJECT_ESTIMATES,
  PROJECT_ALL_CYCLES,
  PROJECT_MODULES,
  PROJECT_VIEWS,
  PROJECT_INTAKE_STATE,
} from "@/constants/fetch-keys";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useCycle } from "@/hooks/store/use-cycle";
import { useLabel } from "@/hooks/store/use-label";
import { useMember } from "@/hooks/store/use-member";
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useProjectView } from "@/hooks/store/use-project-view";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useTimeLineChart } from "@/hooks/use-timeline-chart";

interface IProjectAuthWrapper {
  workspaceSlug: string;
  projectId: string;
  children: ReactNode;
  isLoading?: boolean;
}

const DEFERRED_PROJECT_PREFETCH_DELAY = 150;

export const ProjectAuthWrapper = observer(function ProjectAuthWrapper(props: IProjectAuthWrapper) {
  const { workspaceSlug, projectId, children, isLoading: isParentLoading = false } = props;
  // states
  const [isJoiningProject, setIsJoiningProject] = useState(false);
  const [shouldLoadDeferredProjectData, setShouldLoadDeferredProjectData] = useState(false);
  const pathname = usePathname();
  // store hooks
  const { fetchUserProjectInfo, allowPermissions, getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();
  const { fetchProjectDetails } = useProject();
  const { joinProject } = useUserPermissions();
  const { fetchAllCycles } = useCycle();
  const { fetchModulesSlim, fetchModules } = useModule();
  const { initGantt } = useTimeLineChart(GANTT_TIMELINE_TYPE.MODULE);
  const { fetchViews } = useProjectView();
  const {
    project: { fetchProjectMembers, fetchProjectUserProperties },
  } = useMember();
  const { fetchProjectStates, fetchProjectIntakeState } = useProjectState();
  const { data: currentUserData } = useUser();
  const { fetchProjectLabels } = useLabel();
  const { getProjectEstimates } = useProjectEstimates();
  // derived values
  const hasPermissionToCurrentProject = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );
  const currentProjectRole = getProjectRoleByWorkspaceSlugAndProjectId(workspaceSlug, projectId);
  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, workspaceSlug);
  // Initialize module timeline chart
  useEffect(() => {
    initGantt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!workspaceSlug || !projectId) {
      setShouldLoadDeferredProjectData(false);
      return;
    }

    const deferredLoad = () => setShouldLoadDeferredProjectData(true);

    if (typeof window === "undefined") return;

    if ("requestIdleCallback" in window) {
      const idleCallbackId = window.requestIdleCallback(deferredLoad, {
        timeout: DEFERRED_PROJECT_PREFETCH_DELAY,
      });

      return () => window.cancelIdleCallback(idleCallbackId);
    }

    const timeoutId = globalThis.setTimeout(deferredLoad, DEFERRED_PROJECT_PREFETCH_DELAY);
    return () => globalThis.clearTimeout(timeoutId);
  }, [workspaceSlug, projectId]);

  // fetching project details
  const { isLoading: isProjectDetailsLoading, error: projectDetailsError } = useSWR(
    PROJECT_DETAILS(workspaceSlug, projectId),
    () => fetchProjectDetails(workspaceSlug, projectId)
  );
  // fetching user project member information
  useSWR(PROJECT_ME_INFORMATION(workspaceSlug, projectId), () => fetchUserProjectInfo(workspaceSlug, projectId));
  // fetching project member preferences
  useSWR(
    currentUserData?.id && shouldLoadDeferredProjectData
      ? PROJECT_MEMBER_PREFERENCES(projectId, currentProjectRole)
      : null,
    currentUserData?.id && shouldLoadDeferredProjectData
      ? () => fetchProjectUserProperties(workspaceSlug, projectId)
      : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );
  // fetching project labels
  useSWR(
    shouldLoadDeferredProjectData ? PROJECT_LABELS(projectId, currentProjectRole) : null,
    shouldLoadDeferredProjectData ? () => fetchProjectLabels(workspaceSlug, projectId) : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
    }
  );
  // fetching project members
  useSWR(
    shouldLoadDeferredProjectData ? PROJECT_MEMBERS(projectId, currentProjectRole) : null,
    shouldLoadDeferredProjectData ? () => fetchProjectMembers(workspaceSlug, projectId) : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
    }
  );
  // fetching project states
  useSWR(
    shouldLoadDeferredProjectData ? PROJECT_STATES(projectId, currentProjectRole) : null,
    shouldLoadDeferredProjectData ? () => fetchProjectStates(workspaceSlug, projectId) : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
    }
  );
  // fetching project intake state
  useSWR(
    shouldLoadDeferredProjectData ? PROJECT_INTAKE_STATE(projectId, currentProjectRole) : null,
    shouldLoadDeferredProjectData ? () => fetchProjectIntakeState(workspaceSlug, projectId) : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
    }
  );
  // fetching project estimates
  useSWR(
    shouldLoadDeferredProjectData ? PROJECT_ESTIMATES(projectId, currentProjectRole) : null,
    shouldLoadDeferredProjectData ? () => getProjectEstimates(workspaceSlug, projectId) : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
    }
  );
  // fetching project cycles
  useSWR(
    shouldLoadDeferredProjectData ? PROJECT_ALL_CYCLES(projectId, currentProjectRole) : null,
    shouldLoadDeferredProjectData ? () => fetchAllCycles(workspaceSlug, projectId) : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
    }
  );
  // fetching project modules
  useSWR(
    shouldLoadDeferredProjectData ? PROJECT_MODULES(projectId, currentProjectRole) : null,
    async () => {
      await fetchModulesSlim(workspaceSlug, projectId);

      if (pathname?.includes("/modules")) {
        await fetchModules(workspaceSlug, projectId);
      }
    },
    shouldLoadDeferredProjectData ? { revalidateIfStale: false, revalidateOnFocus: false } : undefined
  );
  // fetching project views
  useSWR(
    shouldLoadDeferredProjectData ? PROJECT_VIEWS(projectId, currentProjectRole) : null,
    shouldLoadDeferredProjectData ? () => fetchViews(workspaceSlug, projectId) : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
    }
  );

  // handle join project
  const handleJoinProject = () => {
    setIsJoiningProject(true);
    joinProject(workspaceSlug, projectId).finally(() => setIsJoiningProject(false));
  };

  const isProjectLoading = (isParentLoading || isProjectDetailsLoading) && !projectDetailsError;

  if (isProjectLoading) return null;

  if (!isProjectLoading && hasPermissionToCurrentProject === false) {
    return (
      <ProjectAccessRestriction
        errorStatusCode={projectDetailsError?.status}
        isWorkspaceAdmin={isWorkspaceAdmin}
        handleJoinProject={handleJoinProject}
        isJoinButtonDisabled={isJoiningProject}
      />
    );
  }

  return <>{children}</>;
});
