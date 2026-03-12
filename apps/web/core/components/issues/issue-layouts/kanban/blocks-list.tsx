/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MutableRefObject } from "react";
import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type { TIssue, IIssueDisplayProperties, IIssueMap } from "@plane/types";
// local imports
import { buildIssueHierarchy } from "../hierarchy";
import type { TRenderQuickActions } from "../list/list-view-types";
import { KanbanIssueBlock } from "./block";

interface IssueBlocksListProps {
  sub_group_id: string;
  groupId: string;
  issuesMap: IIssueMap;
  issueIds: string[];
  displayProperties: IIssueDisplayProperties | undefined;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  quickActions: TRenderQuickActions;
  canEditProperties: (projectId: string | undefined) => boolean;
  canDropOverIssue: boolean;
  canDragIssuesInCurrentGrouping: boolean;
  scrollableContainerRef?: MutableRefObject<HTMLDivElement | null>;
  isEpic?: boolean;
}

export const KanbanIssueBlocksList = observer(function KanbanIssueBlocksList(props: IssueBlocksListProps) {
  const {
    sub_group_id,
    groupId,
    issuesMap,
    issueIds,
    displayProperties,
    canDropOverIssue,
    canDragIssuesInCurrentGrouping,
    updateIssue,
    quickActions,
    canEditProperties,
    scrollableContainerRef,
    isEpic = false,
  } = props;

  const hierarchy = buildIssueHierarchy(issueIds ?? [], issuesMap);

  return (
    <>
      {hierarchy.rootIssueIds.length > 0
        ? hierarchy.rootIssueIds.map((issueId, index) => (
            <KanbanHierarchyIssueBlock
              key={`${issueId}__root`}
              issueId={issueId}
              groupId={groupId}
              subGroupId={sub_group_id}
              issuesMap={issuesMap}
              displayProperties={displayProperties}
              updateIssue={updateIssue}
              quickActions={quickActions}
              canEditProperties={canEditProperties}
              canDropOverIssue={canDropOverIssue}
              canDragIssuesInCurrentGrouping={canDragIssuesInCurrentGrouping}
              scrollableContainerRef={scrollableContainerRef}
              isEpic={isEpic}
              shouldRenderByDefault={index <= 10}
              childrenByParentId={hierarchy.childrenByParentId}
              nestingLevel={0}
            />
          ))
        : null}
    </>
  );
});

type THierarchyIssueBlockProps = Omit<IssueBlocksListProps, "issueIds" | "sub_group_id"> & {
  issueId: string;
  subGroupId: string;
  shouldRenderByDefault?: boolean;
  childrenByParentId: Record<string, string[]>;
  nestingLevel: number;
};

const KanbanHierarchyIssueBlock = observer(function KanbanHierarchyIssueBlock(props: THierarchyIssueBlockProps) {
  const {
    issueId,
    groupId,
    subGroupId,
    issuesMap,
    displayProperties,
    updateIssue,
    quickActions,
    canEditProperties,
    canDropOverIssue,
    canDragIssuesInCurrentGrouping,
    scrollableContainerRef,
    isEpic = false,
    shouldRenderByDefault,
    childrenByParentId,
    nestingLevel,
  } = props;
  const [isExpanded, setIsExpanded] = useState(false);
  const childIssueIds = childrenByParentId[issueId] ?? [];

  let draggableId = issueId;
  if (groupId) draggableId = `${draggableId}__${groupId}`;
  if (subGroupId) draggableId = `${draggableId}__${subGroupId}`;

  return (
    <div className={nestingLevel > 0 ? "ml-4" : ""}>
      <KanbanIssueBlock
        issueId={issueId}
        groupId={groupId}
        subGroupId={subGroupId}
        shouldRenderByDefault={shouldRenderByDefault}
        issuesMap={issuesMap}
        displayProperties={displayProperties}
        updateIssue={updateIssue}
        quickActions={quickActions}
        draggableId={draggableId}
        canDropOverIssue={canDropOverIssue}
        canDragIssuesInCurrentGrouping={canDragIssuesInCurrentGrouping}
        canEditProperties={canEditProperties}
        scrollableContainerRef={scrollableContainerRef}
        isEpic={isEpic}
        hasChildren={childIssueIds.length > 0}
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded((state) => !state)}
        nestingLevel={nestingLevel}
      />
      {isExpanded &&
        childIssueIds.map((childIssueId) => (
          <KanbanHierarchyIssueBlock
            key={`${childIssueId}__child`}
            issueId={childIssueId}
            groupId={groupId}
            subGroupId={subGroupId}
            issuesMap={issuesMap}
            displayProperties={displayProperties}
            updateIssue={updateIssue}
            quickActions={quickActions}
            canEditProperties={canEditProperties}
            canDropOverIssue={canDropOverIssue}
            canDragIssuesInCurrentGrouping={canDragIssuesInCurrentGrouping}
            scrollableContainerRef={scrollableContainerRef}
            isEpic={isEpic}
            shouldRenderByDefault={isExpanded}
            childrenByParentId={childrenByParentId}
            nestingLevel={nestingLevel + 1}
          />
        ))}
    </div>
  );
});
