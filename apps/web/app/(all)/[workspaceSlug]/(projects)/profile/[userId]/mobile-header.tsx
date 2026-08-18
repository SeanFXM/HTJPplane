/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane constants
import { EIssueFilterType, ISSUE_DISPLAY_FILTERS_BY_PAGE } from "@plane/constants";
// plane i18n
import { useTranslation } from "@plane/i18n";
// icons
import { ChevronDownIcon } from "@plane/propel/icons";
// types
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";
import { EIssueLayoutTypes, EIssuesStoreType } from "@plane/types";
// components
import {
  DisplayFiltersSelection,
  FiltersDropdown,
  MobileLayoutSelection,
} from "@/components/issues/issue-layouts/filters";
// hooks
import { useIssues } from "@/hooks/store/use-issues";

const PROFILE_ISSUE_LAYOUTS = [EIssueLayoutTypes.LIST, EIssueLayoutTypes.KANBAN];

export const ProfileIssuesMobileHeader = observer(function ProfileIssuesMobileHeader() {
  // plane i18n
  const { t } = useTranslation();
  // router
  const { workspaceSlug, userId } = useParams();
  // store hook
  const {
    issuesFilter: { issueFilters, updateFilters },
  } = useIssues(EIssuesStoreType.PROFILE);
  // derived values
  const activeLayout = issueFilters?.displayFilters?.layout;

  const handleLayoutChange = useCallback(
    (layout: EIssueLayoutTypes) => {
      if (!workspaceSlug || !userId) return;
      updateFilters(
        workspaceSlug.toString(),
        undefined,
        EIssueFilterType.DISPLAY_FILTERS,
        { layout },
        userId.toString()
      );
    },
    [workspaceSlug, updateFilters, userId]
  );

  const handleDisplayFilters = useCallback(
    (updatedDisplayFilter: Partial<IIssueDisplayFilterOptions>) => {
      if (!workspaceSlug || !userId) return;
      updateFilters(
        workspaceSlug.toString(),
        undefined,
        EIssueFilterType.DISPLAY_FILTERS,
        updatedDisplayFilter,
        userId.toString()
      );
    },
    [workspaceSlug, updateFilters, userId]
  );

  const handleDisplayProperties = useCallback(
    (property: Partial<IIssueDisplayProperties>) => {
      if (!workspaceSlug || !userId) return;
      updateFilters(
        workspaceSlug.toString(),
        undefined,
        EIssueFilterType.DISPLAY_PROPERTIES,
        property,
        userId.toString()
      );
    },
    [workspaceSlug, updateFilters, userId]
  );

  return (
    <div className="z-[13] flex h-11 w-full min-w-0 border-b border-subtle bg-surface-1 md:hidden">
      <MobileLayoutSelection
        layouts={PROFILE_ISSUE_LAYOUTS}
        onChange={handleLayoutChange}
        activeLayout={activeLayout}
        isMobile
      />
      <div className="flex h-11 min-w-0 flex-1 items-stretch justify-center border-l border-subtle text-13 text-secondary [&>div]:h-full [&>div]:w-full [&>div]:min-w-0 [&>div>button]:h-full [&>div>button]:w-full [&>div>button]:min-w-0">
        <FiltersDropdown
          title={t("common.display")}
          placement="bottom-end"
          menuButton={
            <span
              aria-label={t("common.display")}
              className="flex size-full min-w-0 items-center justify-center text-13 text-secondary"
            >
              <span className="truncate">{t("common.display")}</span>
              <ChevronDownIcon className="ml-2 size-4 shrink-0 text-secondary" strokeWidth={2} />
            </span>
          }
        >
          <DisplayFiltersSelection
            layoutDisplayFiltersOptions={
              activeLayout ? ISSUE_DISPLAY_FILTERS_BY_PAGE.profile_issues.layoutOptions[activeLayout] : undefined
            }
            displayFilters={issueFilters?.displayFilters ?? {}}
            handleDisplayFiltersUpdate={handleDisplayFilters}
            displayProperties={issueFilters?.displayProperties ?? {}}
            handleDisplayPropertiesUpdate={handleDisplayProperties}
          />
        </FiltersDropdown>
      </div>
    </div>
  );
});
