/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { usePathname } from "next/navigation";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// components
import { ProjectAccessRestriction } from "@/components/auth-screens/project/project-access-restriction";
import { isProjectFeatureVisible } from "@/constants/product-policy";
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
// local imports
import { useIdlePrefetchQueue } from "./prefetch-queue";

interface IProjectAuthWrapper {
  workspaceSlug: string;
  projectId: string;
  children: ReactNode;
  isLoading?: boolean;
}

type TProjectPrefetchResource =
  | "member-preferences"
  | "labels"
  | "members"
  | "states"
  | "intake-state"
  | "estimates"
  | "cycles"
  | "modules-slim"
  | "modules-full"
  | "views";

type TProjectPrefetchPlan = {
  queue: TProjectPrefetchResource[];
  eagerQueue: TProjectPrefetchResource[];
};

const WORK_ITEM_EAGER_PREFETCHES = [
  "states",
  "members",
  "labels",
] as const satisfies readonly TProjectPrefetchResource[];

const isPathAtOrBelow = (pathname: string, route: string) => pathname === route || pathname.startsWith(`${route}/`);

const getProjectPrefetchPlan = (pathname: string, workspaceSlug: string, projectId: string): TProjectPrefetchPlan => {
  const normalizedPathname = pathname.replace(/\/+$/, "");
  const workspaceRoot = `/${workspaceSlug}`;
  const projectRoot = `${workspaceRoot}/projects/${projectId}`;
  const projectSettingsRoot = `${workspaceRoot}/settings/projects/${projectId}`;
  const cyclesRoute = `${projectRoot}/cycles`;
  const modulesRoute = `${projectRoot}/modules`;
  const viewsRoute = `${projectRoot}/views`;
  const intakeRoute = `${projectRoot}/intake`;
  const isCyclesRoute = isPathAtOrBelow(normalizedPathname, cyclesRoute);
  const isModulesRoute = isPathAtOrBelow(normalizedPathname, modulesRoute);
  const isViewsRoute = isPathAtOrBelow(normalizedPathname, viewsRoute);
  const isIntakeRoute = isPathAtOrBelow(normalizedPathname, intakeRoute);
  const isCycleDetailsRoute = normalizedPathname.startsWith(`${cyclesRoute}/`);
  const isModuleDetailsRoute = normalizedPathname.startsWith(`${modulesRoute}/`);
  const isViewDetailsRoute = normalizedPathname.startsWith(`${viewsRoute}/`);
  const isIssueRoute =
    isPathAtOrBelow(normalizedPathname, `${projectRoot}/issues`) ||
    isPathAtOrBelow(normalizedPathname, `${projectRoot}/archives/issues`) ||
    normalizedPathname.startsWith(`${workspaceRoot}/browse/`);
  const isWorkItemSurface =
    isIssueRoute || isCycleDetailsRoute || isModuleDetailsRoute || isViewDetailsRoute || isIntakeRoute;
  const queue = new Set<TProjectPrefetchResource>();
  const eagerQueue = new Set<TProjectPrefetchResource>();
  const cyclesEnabled = isProjectFeatureVisible("cycles", projectId);
  const modulesEnabled = isProjectFeatureVisible("modules", projectId);
  const viewsEnabled = isProjectFeatureVisible("views", projectId);
  const intakeEnabled = isProjectFeatureVisible("intake", projectId);
  const estimatesEnabled = isProjectFeatureVisible("estimates", projectId);

  // Entity data is the first dependency for its own route.
  if (isCyclesRoute && cyclesEnabled) queue.add("cycles");
  if (isModulesRoute && modulesEnabled) queue.add("modules-full");
  if (isViewsRoute && viewsEnabled) queue.add("views");
  if (isIntakeRoute && intakeEnabled) queue.add("intake-state");

  // Work item screens render these properties directly. Optional product
  // features only join the queue when they are actually exposed.
  if (isWorkItemSurface) {
    queue.add("member-preferences");
    WORK_ITEM_EAGER_PREFETCHES.forEach((resource) => {
      queue.add(resource);
      eagerQueue.add(resource);
    });
    if (estimatesEnabled) queue.add("estimates");
    if (cyclesEnabled) queue.add("cycles");
    if (modulesEnabled && !isModulesRoute) queue.add("modules-slim");
  }

  // View list filters use project membership even before a view is opened.
  if (isViewsRoute && viewsEnabled) queue.add("members");

  // These settings screens consume their stores directly and do not issue
  // their own first-load request.
  if (isPathAtOrBelow(normalizedPathname, `${projectSettingsRoot}/members`)) queue.add("members");
  if (isPathAtOrBelow(normalizedPathname, `${projectSettingsRoot}/labels`)) queue.add("labels");

  return {
    queue: Array.from(queue),
    eagerQueue: Array.from(eagerQueue),
  };
};

export const ProjectAuthWrapper = observer(function ProjectAuthWrapper(props: IProjectAuthWrapper) {
  const { workspaceSlug, projectId, children, isLoading: isParentLoading = false } = props;
  // states
  const [isJoiningProject, setIsJoiningProject] = useState(false);
  const pathname = usePathname();
  // store hooks
  const { fetchUserProjectInfo, allowPermissions, getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();
  const { fetchProjectDetails } = useProject();
  const { joinProject } = useUserPermissions();
  const { fetchAllCycles } = useCycle();
  const { fetchModulesSlim, fetchModules } = useModule();
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
  const projectPrefetchPlan = useMemo(
    () => getProjectPrefetchPlan(pathname, workspaceSlug, projectId),
    [pathname, projectId, workspaceSlug]
  );
  const readyProjectPrefetches = useIdlePrefetchQueue(
    projectPrefetchPlan.queue,
    currentProjectRole !== undefined ? `${workspaceSlug}:${projectId}` : "",
    projectPrefetchPlan.eagerQueue
  );

  // fetching project details
  const { isLoading: isProjectDetailsLoading, error: projectDetailsError } = useSWR(
    PROJECT_DETAILS(workspaceSlug, projectId),
    () => fetchProjectDetails(workspaceSlug, projectId)
  );
  // fetching user project member information
  useSWR(PROJECT_ME_INFORMATION(workspaceSlug, projectId), () => fetchUserProjectInfo(workspaceSlug, projectId));
  // fetching project member preferences
  useSWR(
    currentUserData?.id && readyProjectPrefetches.has("member-preferences")
      ? PROJECT_MEMBER_PREFERENCES(projectId, currentProjectRole)
      : null,
    currentUserData?.id && readyProjectPrefetches.has("member-preferences")
      ? () => fetchProjectUserProperties(workspaceSlug, projectId)
      : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );
  // fetching project labels
  useSWR(
    readyProjectPrefetches.has("labels") ? PROJECT_LABELS(projectId, currentProjectRole) : null,
    readyProjectPrefetches.has("labels") ? () => fetchProjectLabels(workspaceSlug, projectId) : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
    }
  );
  // fetching project members
  useSWR(
    readyProjectPrefetches.has("members") ? PROJECT_MEMBERS(projectId, currentProjectRole) : null,
    readyProjectPrefetches.has("members") ? () => fetchProjectMembers(workspaceSlug, projectId) : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
    }
  );
  // fetching project states
  useSWR(
    readyProjectPrefetches.has("states") ? PROJECT_STATES(projectId, currentProjectRole) : null,
    readyProjectPrefetches.has("states") ? () => fetchProjectStates(workspaceSlug, projectId) : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
    }
  );
  // fetching project intake state
  useSWR(
    readyProjectPrefetches.has("intake-state") ? PROJECT_INTAKE_STATE(projectId, currentProjectRole) : null,
    readyProjectPrefetches.has("intake-state") ? () => fetchProjectIntakeState(workspaceSlug, projectId) : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
    }
  );
  // fetching project estimates
  useSWR(
    readyProjectPrefetches.has("estimates") ? PROJECT_ESTIMATES(projectId, currentProjectRole) : null,
    readyProjectPrefetches.has("estimates") ? () => getProjectEstimates(workspaceSlug, projectId) : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
    }
  );
  // fetching project cycles
  useSWR(
    readyProjectPrefetches.has("cycles") ? PROJECT_ALL_CYCLES(projectId, currentProjectRole) : null,
    readyProjectPrefetches.has("cycles") ? () => fetchAllCycles(workspaceSlug, projectId) : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
    }
  );
  // Full module data is only needed by module screens. Work item property
  // controls use the lighter workspace-level module response.
  const modulesPrefetchType = readyProjectPrefetches.has("modules-full")
    ? "full"
    : readyProjectPrefetches.has("modules-slim")
      ? "slim"
      : undefined;
  useSWR(
    modulesPrefetchType ? `${PROJECT_MODULES(projectId, currentProjectRole)}_${modulesPrefetchType}` : null,
    modulesPrefetchType
      ? () =>
          modulesPrefetchType === "full"
            ? fetchModules(workspaceSlug, projectId)
            : fetchModulesSlim(workspaceSlug, projectId)
      : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );
  // fetching project views
  useSWR(
    readyProjectPrefetches.has("views") ? PROJECT_VIEWS(projectId, currentProjectRole) : null,
    readyProjectPrefetches.has("views") ? () => fetchViews(workspaceSlug, projectId) : null,
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
