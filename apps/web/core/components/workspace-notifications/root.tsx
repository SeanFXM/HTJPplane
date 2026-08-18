/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { ENotificationLoader, ENotificationQueryParamType, ENotificationTab } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import { cn } from "@plane/utils";
// components
import { LogoSpinner } from "@/components/common/logo-spinner";
import { AnnouncementPreview } from "@/components/workspace-notifications/announcement-preview";
// hooks
import { useNotification } from "@/hooks/store/notifications/use-notification";
import { useWorkspaceNotifications } from "@/hooks/store/notifications";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspaceIssueProperties } from "@/hooks/use-workspace-issue-properties";
// plane web imports
import { useNotificationPreview } from "@/plane-web/hooks/use-notification-preview";
// local imports
import { InboxContentRoot } from "../inbox/content";

type NotificationsRootProps = {
  workspaceSlug?: string;
};

export const NotificationsRoot = observer(function NotificationsRoot({ workspaceSlug }: NotificationsRootProps) {
  // hooks
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const {
    currentSelectedNotificationId,
    currentNotificationTab,
    loader,
    setCurrentSelectedNotificationId,
    notificationLiteByNotificationId,
    notificationIdsByWorkspaceId,
    getNotifications,
  } = useWorkspaceNotifications();
  const { fetchUserProjectInfo } = useUserPermissions();
  const { isWorkItem, PeekOverviewComponent, setPeekWorkItem } = useNotificationPreview();
  const selectedNotification = useNotification(currentSelectedNotificationId);
  // derived values
  const notificationIds = currentWorkspace ? notificationIdsByWorkspaceId(currentWorkspace.id) : undefined;
  const hasNotifications = Boolean(notificationIds?.length);
  const { workspace_slug, project_id, issue_id, is_inbox_issue } =
    notificationLiteByNotificationId(currentSelectedNotificationId);

  // fetching workspace work item properties
  useWorkspaceIssueProperties(workspaceSlug);

  // fetch workspace notifications
  const notificationMutation =
    currentWorkspace && notificationIdsByWorkspaceId(currentWorkspace.id)
      ? ENotificationLoader.MUTATION_LOADER
      : ENotificationLoader.INIT_LOADER;
  const notificationLoader =
    currentWorkspace && notificationIdsByWorkspaceId(currentWorkspace.id)
      ? ENotificationQueryParamType.CURRENT
      : ENotificationQueryParamType.INIT;
  useSWR(
    currentWorkspace?.slug ? `WORKSPACE_NOTIFICATION_${currentWorkspace?.slug}` : null,
    currentWorkspace?.slug
      ? () => getNotifications(currentWorkspace?.slug, notificationMutation, notificationLoader)
      : null
  );

  // fetching user project member info
  const { isLoading: projectMemberInfoLoader } = useSWR(
    workspace_slug && project_id && is_inbox_issue
      ? `PROJECT_MEMBER_PERMISSION_INFO_${workspace_slug}_${project_id}`
      : null,
    workspace_slug && project_id && is_inbox_issue ? () => fetchUserProjectInfo(workspace_slug, project_id) : null
  );

  const embedRemoveCurrentNotification = useCallback(
    () => setCurrentSelectedNotificationId(undefined),
    [setCurrentSelectedNotificationId]
  );

  // A selected notification belongs to one workspace and one tab. Clear both
  // preview states before rendering a different scope and again on unmount.
  useEffect(() => {
    setCurrentSelectedNotificationId(undefined);
    setPeekWorkItem(undefined);

    return () => {
      setCurrentSelectedNotificationId(undefined);
      setPeekWorkItem(undefined);
    };
  }, [currentNotificationTab, setCurrentSelectedNotificationId, setPeekWorkItem, workspaceSlug]);

  return (
    <div className={cn("h-full w-full overflow-hidden", isWorkItem && "overflow-y-auto")}>
      {!currentSelectedNotificationId ? (
        <div className="flex size-full items-center justify-center">
          {loader === ENotificationLoader.INIT_LOADER ? (
            <LogoSpinner />
          ) : (
            <EmptyStateCompact
              assetKey="inbox"
              assetClassName="size-24"
              className="max-w-80"
              title={
                hasNotifications
                  ? t("notification.empty_state.detail.title")
                  : currentNotificationTab === ENotificationTab.MENTIONS
                    ? t("notification.empty_state.mentions.title")
                    : t("notification.empty_state.all.title")
              }
              description={
                hasNotifications
                  ? undefined
                  : currentNotificationTab === ENotificationTab.MENTIONS
                    ? t("notification.empty_state.mentions.description")
                    : t("notification.empty_state.all.description")
              }
            />
          )}
        </div>
      ) : (
        <>
          {selectedNotification?.entity_name === "workspace_announcement" ? (
            <AnnouncementPreview notification={selectedNotification.asJson} />
          ) : is_inbox_issue === true && workspace_slug && project_id && issue_id ? (
            <>
              {projectMemberInfoLoader ? (
                <div className="flex h-full w-full items-center justify-center">
                  <LogoSpinner />
                </div>
              ) : (
                <InboxContentRoot
                  setIsMobileSidebar={() => {}}
                  isMobileSidebar={false}
                  workspaceSlug={workspace_slug}
                  projectId={project_id}
                  inboxIssueId={issue_id}
                  isNotificationEmbed
                  embedRemoveCurrentNotification={embedRemoveCurrentNotification}
                />
              )}
            </>
          ) : (
            <PeekOverviewComponent embedIssue embedRemoveCurrentNotification={embedRemoveCurrentNotification} />
          )}
        </>
      )}
    </div>
  );
});
