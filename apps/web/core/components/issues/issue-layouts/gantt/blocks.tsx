/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { ChevronRightIcon } from "@plane/propel/icons";
import { Popover } from "@plane/propel/popover";
import { Tooltip } from "@plane/propel/tooltip";
import type { IIssueDisplayProperties } from "@plane/types";
import { ControlLink } from "@plane/ui";
import { cn, findTotalDaysInRange, generateWorkItemLink } from "@plane/utils";
// components
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { SIDEBAR_WIDTH } from "@/components/gantt-chart/constants";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useLabel } from "@/hooks/store/use-label";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web imports
import { IssueIdentifier } from "@/plane-web/components/issues/issue-details/issue-identifier";
import { IssueStats } from "@/plane-web/components/issues/issue-layouts/issue-stats";
// local imports
import { WorkItemPreviewCard } from "../../preview-card";
import { getBlockViewDetails } from "../utils";
import type { GanttStoreType } from "./base-gantt-root";

const BLOCK_WIDTH_SHOW_ASSIGNEE = 80;
const BLOCK_WIDTH_SHOW_LABELS = 120;

type Props = {
  issueId: string;
  isEpic?: boolean;
  blockWidth?: number;
  displayProperties?: IIssueDisplayProperties | null;
  nestingLevel?: number;
  hasChildren?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: (issueId: string) => void;
};

export const IssueGanttBlock = observer(function IssueGanttBlock(props: Props) {
  const { issueId, isEpic, blockWidth = 0, displayProperties } = props;
  // router
  const { workspaceSlug: routerWorkspaceSlug } = useParams();
  const workspaceSlug = routerWorkspaceSlug?.toString();
  // store hooks
  const { getProjectStates } = useProjectState();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { labelMap } = useLabel();
  // hooks
  const { isMobile } = usePlatformOS();
  const { handleRedirection } = useIssuePeekOverviewRedirection(isEpic);

  // derived values
  const issueDetails = getIssueById(issueId);
  const stateDetails =
    issueDetails && getProjectStates(issueDetails?.project_id)?.find((state) => state?.id == issueDetails?.state_id);

  const { blockStyle } = getBlockViewDetails(issueDetails, stateDetails?.color ?? "");

  const handleIssuePeekOverview = () => handleRedirection(workspaceSlug, issueDetails, isMobile);

  const duration = findTotalDaysInRange(issueDetails?.start_date, issueDetails?.target_date) || 0;

  // Width-based display: >= 120px show assignee + labels, >= 80px show assignee only, < 80px show name only
  const showAssignee = blockWidth >= BLOCK_WIDTH_SHOW_ASSIGNEE && (displayProperties?.assignee ?? true);
  const showLabels = blockWidth >= BLOCK_WIDTH_SHOW_LABELS && (displayProperties?.labels ?? true);

  const assigneeIds = issueDetails?.assignee_ids ?? [];
  const assigneesToShow = showAssignee ? assigneeIds.slice(0, 2) : [];

  const labelIds = issueDetails?.label_ids ?? [];
  const labelsToShow = showLabels ? labelIds.slice(0, 2) : [];

  return (
    <Popover delay={100} openOnHover>
      <Popover.Button
        className="w-full"
        render={
          <button
            type="button"
            id={`issue-${issueId}`}
            className="space-between relative flex h-full w-full cursor-pointer items-center gap-2 rounded-sm text-left"
            style={blockStyle}
            onClick={handleIssuePeekOverview}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleIssuePeekOverview();
              }
            }}
          >
            <div className="absolute top-0 left-0 h-full w-full bg-surface-1/50" />
            <div
              className="sticky flex min-w-0 flex-1 items-center gap-2 overflow-hidden px-2.5 py-1"
              style={{ left: `${SIDEBAR_WIDTH}px` }}
            >
              <span className="truncate text-13 text-primary">{issueDetails?.name}</span>
              {assigneesToShow.length > 0 && (
                <div className="flex flex-shrink-0 items-center">
                  <ButtonAvatars userIds={assigneesToShow} showTooltip size={16} />
                </div>
              )}
              {labelsToShow.length > 0 && (
                <div className="flex flex-shrink-0 items-center gap-1">
                  {labelsToShow.map((labelId) => {
                    const label = labelMap?.[labelId];
                    if (!label) return null;
                    return (
                      <span
                        key={labelId}
                        className="flex max-w-[80px] min-w-[4.5rem] flex-shrink-0 items-center gap-1 truncate rounded-sm px-1.5 py-0.5 text-11 text-secondary"
                        style={{
                          backgroundColor: `${label.color ?? "#666"}20`,
                          borderColor: label.color ?? "#666",
                          borderWidth: "0.5px",
                          borderStyle: "solid",
                        }}
                        title={label.name}
                      >
                        <span
                          className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: label.color ?? "#666" }}
                          aria-hidden
                        />
                        <span className="truncate">{label.name}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            {isEpic && (
              <IssueStats
                issueId={issueId}
                className="sticky mx-2 w-auto flex-shrink-0 justify-end truncate overflow-hidden font-medium text-primary"
                showProgressText={duration >= 2}
              />
            )}
          </button>
        }
      />
      <Popover.Panel side="bottom" align="start">
        <>
          {issueDetails && issueDetails?.project_id && (
            <WorkItemPreviewCard
              projectId={issueDetails.project_id}
              stateDetails={{
                id: issueDetails.state_id ?? undefined,
              }}
              workItem={issueDetails}
            />
          )}
        </>
      </Popover.Panel>
    </Popover>
  );
});

// rendering issues on gantt sidebar
export const IssueGanttSidebarBlock = observer(function IssueGanttSidebarBlock(props: Props) {
  const { issueId, isEpic = false, nestingLevel = 0, hasChildren = false, isExpanded = false, onToggleExpand } = props;
  // router
  const { workspaceSlug: routerWorkspaceSlug } = useParams();
  const workspaceSlug = routerWorkspaceSlug?.toString();
  // store hooks
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { isMobile } = usePlatformOS();
  const storeType = useIssueStoreType() as GanttStoreType;
  const { issuesFilter } = useIssues(storeType);
  const { getProjectIdentifierById } = useProject();

  // handlers
  const { handleRedirection } = useIssuePeekOverviewRedirection(isEpic);

  // derived values
  const issueDetails = getIssueById(issueId);
  const projectIdentifier = getProjectIdentifierById(issueDetails?.project_id);

  const handleIssuePeekOverview = (e: any) => {
    e.stopPropagation(true);
    e.preventDefault();
    handleRedirection(workspaceSlug, issueDetails, isMobile);
  };

  const workItemLink = generateWorkItemLink({
    workspaceSlug,
    projectId: issueDetails?.project_id,
    issueId,
    projectIdentifier,
    sequenceId: issueDetails?.sequence_id,
    isEpic,
  });

  return (
    <ControlLink
      id={`issue-${issueId}`}
      href={workItemLink}
      onClick={handleIssuePeekOverview}
      className="line-clamp-1 w-full cursor-pointer text-13 text-primary"
      disabled={!!issueDetails?.tempId}
    >
      <div className="relative flex h-full w-full cursor-pointer items-center gap-2">
        {hasChildren && (
          <button
            type="button"
            className="grid size-4 place-items-center rounded-xs text-placeholder hover:text-tertiary"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleExpand?.(issueId);
            }}
          >
            <ChevronRightIcon
              className={cn("size-4 transition-transform", {
                "rotate-90": isExpanded,
              })}
              strokeWidth={2.5}
            />
          </button>
        )}
        {issueDetails?.project_id && (
          <IssueIdentifier
            issueId={issueDetails.id}
            projectId={issueDetails.project_id}
            size="xs"
            variant="tertiary"
            displayProperties={issuesFilter?.issueFilters?.displayProperties}
          />
        )}
        <Tooltip tooltipContent={issueDetails?.name} isMobile={isMobile}>
          <span
            className="flex-grow truncate text-13 font-medium"
            style={nestingLevel > 0 ? { marginLeft: `${nestingLevel * 12}px` } : {}}
          >
            {issueDetails?.name}
          </span>
        </Tooltip>
      </div>
    </ControlLink>
  );
});
