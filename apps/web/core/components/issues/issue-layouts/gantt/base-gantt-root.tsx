/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { ALL_ISSUES, EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { EIssuesStoreType, IBlockUpdateData, TIssue } from "@plane/types";
import { EIssueLayoutTypes, GANTT_TIMELINE_TYPE } from "@plane/types";
import { renderFormattedPayloadDate } from "@plane/utils";
// components
import { AlertModalCore } from "@plane/ui";
import { TimeLineTypeContext } from "@/components/gantt-chart/contexts";
import { GanttChartRoot } from "@/components/gantt-chart/root";
import { IssueGanttSidebar } from "@/components/gantt-chart/sidebar/issues/sidebar";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useUserPermissions } from "@/hooks/store/user";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { useIssuesActions } from "@/hooks/use-issues-actions";
import { useTimeLineChart } from "@/hooks/use-timeline-chart";
// plane web hooks
import { useBulkOperationStatus } from "@/plane-web/hooks/use-bulk-operation-status";

import { IssueLayoutHOC } from "../issue-layout-HOC";
import { GanttQuickAddIssueButton, QuickAddIssueRoot } from "../quick-add";
import { IssueGanttBlock } from "./blocks";
import { buildIssueHierarchy, flattenVisibleHierarchy } from "../hierarchy";

interface IBaseGanttRoot {
  viewId?: string | undefined;
  isCompletedCycle?: boolean;
  isEpic?: boolean;
}

export type GanttStoreType =
  | EIssuesStoreType.PROJECT
  | EIssuesStoreType.MODULE
  | EIssuesStoreType.CYCLE
  | EIssuesStoreType.PROJECT_VIEW
  | EIssuesStoreType.EPIC;

export const BaseGanttRoot = observer(function BaseGanttRoot(props: IBaseGanttRoot) {
  const { viewId, isCompletedCycle = false, isEpic = false } = props;
  const { t } = useTranslation();
  // router
  const { workspaceSlug, projectId } = useParams();

  const storeType = useIssueStoreType() as GanttStoreType;
  const { issueMap, issues, issuesFilter } = useIssues(storeType);
  const { fetchIssues, fetchNextIssues, updateIssue, quickAddIssue } = useIssuesActions(storeType);
  const timelineStore = useTimeLineChart(GANTT_TIMELINE_TYPE.ISSUE);
  const { initGantt, getBlockById } = timelineStore;
  const [dateChangeConfirmState, setDateChangeConfirmState] = useState<{
    resolve: (confirmed: boolean) => void;
  } | null>(null);
  // store hooks
  const { allowPermissions } = useUserPermissions();

  const appliedDisplayFilters = issuesFilter.issueFilters?.displayFilters;
  // plane web hooks
  const isBulkOperationsEnabled = useBulkOperationStatus();
  // derived values
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 1);

  useEffect(() => {
    fetchIssues("init-loader", { canGroup: false, perPageCount: 100 }, viewId);
  }, [fetchIssues, storeType, viewId]);

  useEffect(() => {
    initGantt();
  }, [initGantt]);

  const [expandedIssueIds, setExpandedIssueIds] = useState<Set<string>>(new Set());
  const issuesIds = useMemo(() => (issues.groupedIssueIds?.[ALL_ISSUES] as string[]) ?? [], [issues.groupedIssueIds]);
  const hierarchy = useMemo(() => buildIssueHierarchy(issuesIds, issueMap), [issuesIds, issueMap]);
  const visibleIssueIds = useMemo(
    () => flattenVisibleHierarchy(hierarchy.rootIssueIds, hierarchy.childrenByParentId, expandedIssueIds),
    [expandedIssueIds, hierarchy]
  );
  const nextPageResults = issues.getPaginationData(undefined, undefined)?.nextPageResults;

  const handleToggleIssueExpand = useCallback((issueId: string) => {
    setExpandedIssueIds((previousState) => {
      const nextState = new Set(previousState);
      if (nextState.has(issueId)) nextState.delete(issueId);
      else nextState.add(issueId);
      return nextState;
    });
  }, []);

  const { enableIssueCreation } = issues?.viewFlags || {};

  const loadMoreIssues = useCallback(() => {
    fetchNextIssues();
  }, [fetchNextIssues]);

  const updateIssueBlockStructure = async (issue: TIssue, data: IBlockUpdateData) => {
    if (!workspaceSlug) return;

    const payload: any = { ...data };
    if (data.sort_order) payload.sort_order = data.sort_order.newSortOrder;

    if (updateIssue) await updateIssue(issue.project_id, issue.id, payload);
  };

  const isAllowed = allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.PROJECT);
  const updateBlockDates = useCallback(
    async (
      updates: {
        id: string;
        start_date?: string;
        target_date?: string;
      }[]
    ) => {
      const update = updates[0];
      if (!update || !workspaceSlug || !projectId) return;

      const block = getBlockById(update.id);
      if (!block) return;

      const startChanged =
        update.start_date !== undefined && (update.start_date ?? null) !== (block.start_date ?? null);
      const targetChanged =
        update.target_date !== undefined && (update.target_date ?? null) !== (block.target_date ?? null);
      const hasDateChange = startChanged || targetChanged;

      if (!hasDateChange) {
        await issues.updateIssueDates(workspaceSlug.toString(), updates, projectId.toString()).catch(() => {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("toast.error"),
            message: "Error while updating work item dates, Please try again Later",
          });
        });
        return;
      }

      const confirmed = await new Promise<boolean>((resolve) => {
        setDateChangeConfirmState({ resolve });
      });
      setDateChangeConfirmState(null);

      if (!confirmed) {
        throw { cancelled: true };
      }

      await issues.updateIssueDates(workspaceSlug.toString(), updates, projectId.toString()).catch(() => {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("toast.error"),
          message: "Error while updating work item dates, Please try again Later",
        });
      });
    },
    [issues, getBlockById, projectId, workspaceSlug, t]
  );

  const quickAdd =
    enableIssueCreation && isAllowed && !isCompletedCycle ? (
      <QuickAddIssueRoot
        layout={EIssueLayoutTypes.GANTT}
        QuickAddButton={GanttQuickAddIssueButton}
        containerClassName="sticky bottom-0 z-[1]"
        prePopulatedData={{
          start_date: renderFormattedPayloadDate(new Date()),
          target_date: renderFormattedPayloadDate(targetDate),
        }}
        quickAddCallback={quickAddIssue}
        isEpic={isEpic}
      />
    ) : undefined;

  const handleDateChangeConfirm = useCallback(() => {
    dateChangeConfirmState?.resolve(true);
  }, [dateChangeConfirmState]);

  const handleDateChangeCancel = useCallback(() => {
    dateChangeConfirmState?.resolve(false);
  }, [dateChangeConfirmState]);

  return (
    <IssueLayoutHOC layout={EIssueLayoutTypes.GANTT}>
      <TimeLineTypeContext.Provider value={GANTT_TIMELINE_TYPE.ISSUE}>
        <AlertModalCore
          isOpen={!!dateChangeConfirmState}
          handleClose={handleDateChangeCancel}
          handleSubmit={handleDateChangeConfirm}
          title={t("issue.layouts.gantt_date_change_confirm.title")}
          content={t("issue.layouts.gantt_date_change_confirm.message")}
          primaryButtonText={{
            default: t("issue.layouts.gantt_date_change_confirm.confirm"),
            loading: t("issue.layouts.gantt_date_change_confirm.confirm"),
          }}
          secondaryButtonText={t("issue.layouts.gantt_date_change_confirm.cancel")}
          isSubmitting={false}
          variant="primary"
        />
        <div className="h-full w-full">
          <GanttChartRoot
            border={false}
            title={isEpic ? t("epic.label", { count: 2 }) : t("issue.label", { count: 2 })}
            loaderTitle={isEpic ? t("epic.label", { count: 2 }) : t("issue.label", { count: 2 })}
            blockIds={visibleIssueIds}
            blockUpdateHandler={updateIssueBlockStructure}
            blockToRender={(data: TIssue & { meta?: { position?: { width?: number } } }) => (
              <IssueGanttBlock
                issueId={data.id}
                isEpic={isEpic}
                blockWidth={data.meta?.position?.width}
                displayProperties={issuesFilter?.issueFilters?.displayProperties}
              />
            )}
            sidebarToRender={(sidebarProps) => (
              <IssueGanttSidebar
                {...sidebarProps}
                showAllBlocks
                isEpic={isEpic}
                depthByIssueId={hierarchy.depthByIssueId}
                childrenByParentId={hierarchy.childrenByParentId}
                expandedIssueIds={expandedIssueIds}
                onToggleIssueExpand={handleToggleIssueExpand}
              />
            )}
            enableBlockLeftResize={isAllowed}
            enableBlockRightResize={isAllowed}
            enableBlockMove={isAllowed}
            enableReorder={appliedDisplayFilters?.order_by === "sort_order" && isAllowed}
            enableAddBlock={isAllowed}
            enableSelection={isBulkOperationsEnabled && isAllowed}
            quickAdd={quickAdd}
            loadMoreBlocks={loadMoreIssues}
            canLoadMoreBlocks={nextPageResults}
            updateBlockDates={updateBlockDates}
            showAllBlocks
            enableDependency
            isEpic={isEpic}
          />
        </div>
      </TimeLineTypeContext.Provider>
    </IssueLayoutHOC>
  );
});
