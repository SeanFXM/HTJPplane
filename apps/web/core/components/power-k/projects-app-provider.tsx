/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { usePowerK } from "@/hooks/store/use-power-k";
import { useUser } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
// plane web imports
// local imports
import { useProjectsAppPowerKCommands } from "./config/commands";
import type { TPowerKCommandConfig, TPowerKContext } from "./core/types";
import { GlobalShortcutsProvider } from "./global-shortcuts";
import type { TPowerKCommandsListProps } from "./ui/modal/commands-list";

const WorkspaceLevelModals = lazy(async () =>
  import("@/plane-web/components/command-palette/modals/workspace-level").then((module) => ({
    default: module.WorkspaceLevelModals,
  }))
);
const ProjectLevelModals = lazy(async () =>
  import("@/plane-web/components/command-palette/modals/project-level").then((module) => ({
    default: module.ProjectLevelModals,
  }))
);
const WorkItemLevelModals = lazy(async () =>
  import("@/plane-web/components/command-palette/modals/work-item-level").then((module) => ({
    default: module.WorkItemLevelModals,
  }))
);
const LazyProjectsAppPowerKModal = lazy(async () => {
  const [{ ProjectsAppPowerKModalWrapper }, { ProjectsAppPowerKCommandsList }] = await Promise.all([
    import("./ui/modal/wrapper"),
    import("./ui/modal/commands-list"),
  ]);

  const DeferredProjectsAppPowerKModal = (props: { context: TPowerKContext; isOpen: boolean; onClose: () => void }) => (
    <ProjectsAppPowerKModalWrapper
      commandsListComponent={ProjectsAppPowerKCommandsList as React.FC<TPowerKCommandsListProps>}
      context={props.context}
      isOpen={props.isOpen}
      onClose={props.onClose}
    />
  );

  return { default: DeferredProjectsAppPowerKModal };
});

/**
 * Projects App PowerK provider
 */
export const ProjectsAppPowerKProvider = observer(function ProjectsAppPowerKProvider() {
  // router
  const router = useAppRouter();
  const params = useParams();
  const { workspaceSlug, projectId: routerProjectId, workItem: workItemIdentifier } = params;
  // states
  const [activeCommand, setActiveCommand] = useState<TPowerKCommandConfig | null>(null);
  const [shouldShowContextBasedActions, setShouldShowContextBasedActions] = useState(true);
  // store hooks
  const { activeContext, isPowerKModalOpen, togglePowerKModal, setActivePage } = usePowerK();
  const { data: currentUser } = useUser();
  // derived values
  const {
    issue: { getIssueById, getIssueIdByIdentifier },
  } = useIssueDetail();
  // derived values
  const workItemId = workItemIdentifier ? getIssueIdByIdentifier(workItemIdentifier.toString()) : undefined;
  const workItemDetails = workItemId ? getIssueById(workItemId) : undefined;
  const projectId: string | string[] | undefined | null = routerProjectId ?? workItemDetails?.project_id;
  const commands = useProjectsAppPowerKCommands();
  const shouldRenderPowerKOverlays = isPowerKModalOpen || activeCommand !== null;
  // Build command context from props and store
  const context: TPowerKContext = useMemo(
    () => ({
      currentUserId: currentUser?.id,
      activeCommand,
      activeContext,
      shouldShowContextBasedActions,
      setShouldShowContextBasedActions,
      params: {
        ...params,
        projectId,
      },
      router,
      closePalette: () => togglePowerKModal(false),
      setActiveCommand,
      setActivePage,
    }),
    [
      currentUser?.id,
      activeCommand,
      activeContext,
      shouldShowContextBasedActions,
      params,
      projectId,
      router,
      togglePowerKModal,
      setActivePage,
    ]
  );

  return (
    <>
      <GlobalShortcutsProvider context={context} commands={commands} />
      {shouldRenderPowerKOverlays && (
        <Suspense fallback={null}>
          {workspaceSlug && <WorkspaceLevelModals workspaceSlug={workspaceSlug.toString()} />}
          {workspaceSlug && projectId && (
            <ProjectLevelModals workspaceSlug={workspaceSlug.toString()} projectId={projectId.toString()} />
          )}
          <WorkItemLevelModals workItemIdentifier={workItemIdentifier?.toString()} />
          <LazyProjectsAppPowerKModal
            context={context}
            isOpen={isPowerKModalOpen}
            onClose={() => togglePowerKModal(false)}
          />
        </Suspense>
      )}
    </>
  );
});
