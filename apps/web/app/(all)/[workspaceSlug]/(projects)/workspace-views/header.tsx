/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { DEFAULT_GLOBAL_VIEWS_LIST, EIssueFilterType, ISSUE_DISPLAY_FILTERS_BY_PAGE } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { ViewsIcon } from "@plane/propel/icons";
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";
import { EIssuesStoreType, EIssueLayoutTypes } from "@plane/types";
import { Breadcrumbs, Header, BreadcrumbNavigationSearchDropdown } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { SwitcherLabel } from "@/components/common/switcher-label";
import { DisplayFiltersSelection, FiltersDropdown } from "@/components/issues/issue-layouts/filters";
import { WorkItemFiltersToggle } from "@/components/work-item-filters/filters-toggle";
import { DefaultWorkspaceViewQuickActions } from "@/components/workspace/views/default-view-quick-action";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useAppRouter } from "@/hooks/use-app-router";

export const GlobalIssuesHeader = observer(function GlobalIssuesHeader() {
  // router
  const router = useAppRouter();
  const { workspaceSlug, globalViewId: routerGlobalViewId } = useParams();
  const globalViewId = routerGlobalViewId ? routerGlobalViewId.toString() : undefined;
  // store hooks
  const {
    issuesFilter: { filters, updateFilters },
  } = useIssues(EIssuesStoreType.GLOBAL);
  const { t } = useTranslation();

  const issueFilters = globalViewId ? filters[globalViewId.toString()] : undefined;

  const activeLayout = issueFilters?.displayFilters?.layout ?? EIssueLayoutTypes.LIST;

  const handleDisplayFilters = useCallback(
    (updatedDisplayFilter: Partial<IIssueDisplayFilterOptions>) => {
      if (!workspaceSlug || !globalViewId) return;
      updateFilters(
        workspaceSlug.toString(),
        undefined,
        EIssueFilterType.DISPLAY_FILTERS,
        updatedDisplayFilter,
        globalViewId
      );
    },
    [workspaceSlug, updateFilters, globalViewId]
  );

  const handleDisplayProperties = useCallback(
    (property: Partial<IIssueDisplayProperties>) => {
      if (!workspaceSlug || !globalViewId) return;
      updateFilters(workspaceSlug.toString(), undefined, EIssueFilterType.DISPLAY_PROPERTIES, property, globalViewId);
    },
    [workspaceSlug, updateFilters, globalViewId]
  );

  const defaultViewDetails = DEFAULT_GLOBAL_VIEWS_LIST.find((view) => view.key === globalViewId);

  const defaultOptions = DEFAULT_GLOBAL_VIEWS_LIST.map((view) => ({
    value: view.key,
    query: view.key,
    content: <SwitcherLabel name={t(view.i18n_label)} LabelIcon={ViewsIcon} />,
  }));

  const currentLayoutFilters = useMemo(() => {
    return ISSUE_DISPLAY_FILTERS_BY_PAGE.my_issues.layoutOptions[activeLayout];
  }, [activeLayout]);

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={<BreadcrumbLink label={t("issues")} icon={<ViewsIcon className="h-4 w-4 text-tertiary" />} />}
          />
          <Breadcrumbs.Item
            component={
              <BreadcrumbNavigationSearchDropdown
                selectedItem={globalViewId?.toString() || ""}
                navigationItems={defaultOptions}
                onChange={(value: string) => {
                  router.push(`/${workspaceSlug}/workspace-views/${value}`);
                }}
                title={t(defaultViewDetails?.i18n_label ?? "")}
                icon={
                  <Breadcrumbs.Icon>
                    <ViewsIcon className="size-4 flex-shrink-0 text-tertiary" />
                  </Breadcrumbs.Icon>
                }
                isLast
              />
            }
            isLast
          />
        </Breadcrumbs>
      </Header.LeftItem>

      <Header.RightItem className="items-center">
        {globalViewId && <WorkItemFiltersToggle entityType={EIssuesStoreType.GLOBAL} entityId={globalViewId} />}
        <FiltersDropdown title={t("common.display")} placement="bottom-end">
          <DisplayFiltersSelection
            layoutDisplayFiltersOptions={currentLayoutFilters}
            displayFilters={issueFilters?.displayFilters ?? {}}
            handleDisplayFiltersUpdate={handleDisplayFilters}
            displayProperties={issueFilters?.displayProperties ?? {}}
            handleDisplayPropertiesUpdate={handleDisplayProperties}
          />
        </FiltersDropdown>
        <div className="hidden md:block">
          {defaultViewDetails && (
            <DefaultWorkspaceViewQuickActions workspaceSlug={workspaceSlug?.toString()} view={defaultViewDetails} />
          )}
        </div>
      </Header.RightItem>
    </Header>
  );
});
