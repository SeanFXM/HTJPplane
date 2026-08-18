/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useParams, useRouter } from "next/navigation";
import { EUserPermissionsLevel, EPageAccess } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPageNavigationTabs } from "@plane/types";
import { EUserProjectRoles } from "@plane/types";
// components
import { PageLoader } from "@/components/pages/loaders/page-loader";
import { getPageTemplatePayload } from "@/components/pages/page-template-data";
import type { TPageTemplateId } from "@/components/pages/page-template-data";
import { PageTemplatePicker } from "@/components/pages/page-template-picker";
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// plane web hooks
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";

type Props = {
  children: React.ReactNode;
  pageType: TPageNavigationTabs;
  storeType: EPageStoreType;
};

const getPageCreationError = (error: unknown): string | undefined => {
  if (!error || typeof error !== "object") return undefined;

  if ("error" in error && typeof error.error === "string") return error.error;
  if (
    "data" in error &&
    error.data &&
    typeof error.data === "object" &&
    "error" in error.data &&
    typeof error.data.error === "string"
  )
    return error.data.error;

  return undefined;
};

export const PagesListMainContent = observer(function PagesListMainContent(props: Props) {
  const { children, pageType, storeType } = props;
  // plane hooks
  const { currentLocale, t } = useTranslation();
  // store hooks
  const { currentProjectDetails } = useProject();
  const { isAnyPageAvailable, getCurrentProjectFilteredPageIdsByTab, getCurrentProjectPageIdsByTab, loader } =
    usePageStore(storeType);
  const { allowPermissions } = useUserPermissions();
  const { createPage } = usePageStore(EPageStoreType.PROJECT);
  const { toggleCreatePageModal } = useCommandPalette();
  // states
  const [creatingTemplateId, setCreatingTemplateId] = useState<TPageTemplateId>();
  // router
  const router = useRouter();
  const { workspaceSlug } = useParams();
  // derived values
  const pageIds = getCurrentProjectPageIdsByTab(pageType);
  const filteredPageIds = getCurrentProjectFilteredPageIdsByTab(pageType);
  const canPerformEmptyStateActions = allowPermissions(
    [EUserProjectRoles.ADMIN, EUserProjectRoles.MEMBER],
    EUserPermissionsLevel.PROJECT
  );
  const pageAccess = pageType === "private" ? EPageAccess.PRIVATE : EPageAccess.PUBLIC;

  const handleOpenCreatePageModal = () =>
    toggleCreatePageModal({
      isOpen: true,
      pageAccess,
    });

  const handleCreatePageFromTemplate = async (templateId: TPageTemplateId) => {
    if (!workspaceSlug || !currentProjectDetails?.id || !canPerformEmptyStateActions) return;

    setCreatingTemplateId(templateId);
    try {
      const page = await createPage({
        ...getPageTemplatePayload(currentLocale, templateId),
        access: pageAccess,
      });
      if (!page?.id) throw new Error("Page creation returned no page identifier");

      router.push(`/${workspaceSlug}/projects/${currentProjectDetails.id}/pages/${page.id}`);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: getPageCreationError(error) ?? t("pages_ui.create.failed"),
      });
    } finally {
      setCreatingTemplateId(undefined);
    }
  };

  const createPagesEmptyState = (
    <div className="vertical-scrollbar flex size-full flex-col overflow-y-auto">
      <div className="min-h-72 flex-1">
        <EmptyStateDetailed
          assetKey="page"
          title={t("project_empty_state.pages.title")}
          description={t("project_empty_state.pages.description")}
          actions={[
            {
              label: t("project_empty_state.pages.cta_primary"),
              onClick: handleOpenCreatePageModal,
              variant: "primary",
              disabled: !canPerformEmptyStateActions,
            },
          ]}
        />
      </div>
      {canPerformEmptyStateActions && (
        <PageTemplatePicker
          activeTemplateId={creatingTemplateId}
          className="mx-auto max-w-4xl px-8 pb-10"
          locale={currentLocale}
          onSelect={handleCreatePageFromTemplate}
          showBlank={false}
        />
      )}
    </div>
  );

  if (loader === "init-loader") return <PageLoader />;
  // if no pages exist in the active page type
  if (!isAnyPageAvailable || pageIds?.length === 0) {
    if (!isAnyPageAvailable) {
      return createPagesEmptyState;
    }
    if (pageType === "public" || pageType === "private") return createPagesEmptyState;
    if (pageType === "archived")
      return (
        <EmptyStateDetailed
          assetKey="page"
          title={t("project_empty_state.archive_pages.title")}
          description={t("project_empty_state.archive_pages.description")}
        />
      );
  }
  // if no pages match the filter criteria
  if (filteredPageIds?.length === 0)
    return (
      <EmptyStateDetailed
        assetKey="search"
        title={t("common_empty_state.search.title")}
        description={t("common_empty_state.search.description")}
      />
    );

  return <div className="h-full w-full overflow-hidden">{children}</div>;
});
