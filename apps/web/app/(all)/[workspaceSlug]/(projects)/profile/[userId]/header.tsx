/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams, useRouter } from "next/navigation";
import { PanelRight } from "lucide-react";
import { PROFILE_VIEWER_TAB, PROFILE_ADMINS_TAB, EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { YourWorkIcon, ChevronDownIcon } from "@plane/propel/icons";
import type { IUserProfileProjectSegregation } from "@plane/types";
import { Breadcrumbs, Header, CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { ProfileIssuesFilter } from "@/components/profile/profile-issues-filter";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useUser, useUserPermissions } from "@/hooks/store/user";

type TUserProfileHeader = {
  userProjectsData: IUserProfileProjectSegregation | undefined;
  type?: string | undefined;
  showProfileIssuesFilter?: boolean;
};

export const UserProfileHeader = observer(function UserProfileHeader(props: TUserProfileHeader) {
  const { userProjectsData, type = undefined, showProfileIssuesFilter } = props;
  // router
  const { workspaceSlug, userId } = useParams();
  const router = useRouter();
  // store hooks
  const { toggleProfileSidebar, profileSidebarCollapsed } = useAppTheme();
  const { data: currentUser } = useUser();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { t } = useTranslation();
  // derived values
  const isAuthorized = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );

  if (!workspaceUserInfo) return null;

  const tabsList = isAuthorized ? [...PROFILE_VIEWER_TAB, ...PROFILE_ADMINS_TAB] : PROFILE_VIEWER_TAB;

  const userName = `${userProjectsData?.user_data?.first_name} ${userProjectsData?.user_data?.last_name}`;

  const isCurrentUser = currentUser?.id === userId;

  const breadcrumbLabel = isCurrentUser ? t("profile.page_label") : `${userName} ${t("profile.work")}`;
  const currentTabLabel = type ? t(type) : t("profile.page_label");

  return (
    <Header>
      <Header.LeftItem className="min-w-0">
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label={breadcrumbLabel}
                disableTooltip
                icon={<YourWorkIcon className="h-4 w-4 text-tertiary" />}
              />
            }
          />
        </Breadcrumbs>
      </Header.LeftItem>
      <Header.RightItem className="w-[148px] shrink-0 md:w-auto">
        <div className="hidden md:flex md:items-center">{showProfileIssuesFilter && <ProfileIssuesFilter />}</div>
        <div className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
          <CustomMenu
            maxHeight={"md"}
            className="flex h-11 w-24 shrink-0 justify-center text-13 text-secondary"
            placement="bottom-start"
            ariaLabel={currentTabLabel}
            customButton={
              <div className="flex size-full min-w-0 items-center gap-2 rounded-md border border-subtle px-2">
                <span className="min-w-0 flex-1 truncate text-center text-13 text-secondary">{currentTabLabel}</span>
                <ChevronDownIcon className="size-4 shrink-0 text-placeholder" />
              </div>
            }
            customButtonClassName="flex h-11 min-w-11 w-full items-center justify-center text-13 text-secondary"
            closeOnSelect
          >
            {tabsList.map((tab) => (
              <CustomMenu.MenuItem
                className="flex min-h-11 items-center gap-2 py-2"
                key={tab.route}
                onClick={() => router.push(`/${workspaceSlug}/profile/${userId}/${tab.route}`)}
              >
                <span className="w-full text-tertiary">{t(tab.i18n_label)}</span>
              </CustomMenu.MenuItem>
            ))}
          </CustomMenu>
          <div className="shrink-0 md:hidden">
            <Button
              variant="ghost"
              size="lg"
              className="size-11 p-0"
              aria-label={t(
                profileSidebarCollapsed
                  ? "aria_labels.projects_sidebar.expand_sidebar"
                  : "aria_labels.projects_sidebar.collapse_sidebar"
              )}
              aria-expanded={!profileSidebarCollapsed}
              onClick={() => {
                toggleProfileSidebar();
              }}
            >
              <PanelRight
                className={cn("size-4", !profileSidebarCollapsed ? "text-accent-primary" : "text-secondary")}
              />
            </Button>
          </div>
        </div>
      </Header.RightItem>
    </Header>
  );
});
