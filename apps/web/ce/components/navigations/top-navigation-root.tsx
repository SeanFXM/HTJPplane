/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
import { cn } from "@plane/utils";
import { TopNavPowerK } from "@/components/navigation";
import { UserMenuRoot } from "@/components/workspace/sidebar/user-menu-root";
import { WorkspaceMenuRoot } from "@/components/workspace/sidebar/workspace-menu-root";
import { useAppRailPreferences } from "@/hooks/use-navigation-preferences";
import { Tooltip } from "@plane/propel/tooltip";
import { AppSidebarItem } from "@/components/sidebar/sidebar-item";
import { InboxIcon } from "@plane/propel/icons";
import useSWR from "swr";
import { useWorkspaceNotifications } from "@/hooks/store/notifications";

export const TopNavigationRoot = observer(function TopNavigationRoot() {
  // router
  const { workspaceSlug } = useParams();
  const pathname = usePathname();

  // store hooks
  const { unreadNotificationsCount, getUnreadNotificationsCount } = useWorkspaceNotifications();
  const { preferences } = useAppRailPreferences();

  const showLabel = preferences.displayMode === "icon_with_label";

  // Fetch notification count
  useSWR(
    workspaceSlug ? "WORKSPACE_UNREAD_NOTIFICATION_COUNT" : null,
    workspaceSlug ? () => getUnreadNotificationsCount(workspaceSlug.toString()) : null
  );

  // Calculate notification count
  const isMentionsEnabled = unreadNotificationsCount.mention_unread_notifications_count > 0;
  const totalNotifications = isMentionsEnabled
    ? unreadNotificationsCount.mention_unread_notifications_count
    : unreadNotificationsCount.total_unread_notifications_count;

  return (
    <div
      className={cn(
        "z-[27] flex min-h-11 w-full items-center gap-1 bg-canvas px-2 transition-all duration-300 md:min-h-10 md:px-3.5",
        {
          "md:px-2": !showLabel,
        }
      )}
    >
      {/* Workspace Menu */}
      <div className="min-w-0 flex-1 md:shrink-0">
        <WorkspaceMenuRoot variant="top-navigation" />
      </div>
      {/* Power K Search */}
      <div className="shrink-0">
        <TopNavPowerK />
      </div>
      {/* Additional Actions */}
      <div className="flex shrink-0 items-center justify-end gap-1 md:flex-1">
        <div className="max-md:[&_a]:size-11 max-md:[&_a]:items-center max-md:[&_a]:justify-center">
          <Tooltip tooltipContent="Inbox" position="bottom">
            <AppSidebarItem
              variant="link"
              item={{
                href: `/${workspaceSlug?.toString()}/notifications/`,
                icon: (
                  <div className="relative">
                    <InboxIcon
                      className="size-5"
                      role="img"
                      aria-label={totalNotifications > 0 ? `Inbox, ${totalNotifications} unread` : "Inbox"}
                    />
                    {totalNotifications > 0 && (
                      <span className="absolute top-0 right-0 size-2 rounded-full bg-danger-primary" />
                    )}
                  </div>
                ),
                isActive: pathname?.includes("/notifications/"),
              }}
            />
          </Tooltip>
        </div>
        <div className="flex size-11 items-center justify-center rounded-md hover:bg-layer-1-hover md:size-8 max-md:[&>div>button]:size-11 max-md:[&>div>button>button]:size-11">
          <UserMenuRoot />
        </div>
      </div>
    </div>
  );
});
