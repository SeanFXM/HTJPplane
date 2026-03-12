/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueMap } from "@plane/types";

export type TIssueHierarchyProjection = {
  rootIssueIds: string[];
  childrenByParentId: Record<string, string[]>;
  depthByIssueId: Record<string, number>;
};

const MAX_PARENT_CHAIN_DEPTH = 20;

const shouldSkipIssue = (issueId: string, issueMap: TIssueMap) => !issueId || !issueMap[issueId];

const createsCycle = (
  issueId: string,
  parentId: string,
  issueMap: TIssueMap,
  availableIssueIds: Set<string>
): boolean => {
  let currentParentId: string | null | undefined = parentId;
  let depth = 0;

  while (currentParentId && depth < MAX_PARENT_CHAIN_DEPTH) {
    if (currentParentId === issueId) return true;
    if (!availableIssueIds.has(currentParentId)) return false;

    currentParentId = issueMap[currentParentId]?.parent_id;
    depth++;
  }

  return depth >= MAX_PARENT_CHAIN_DEPTH;
};

export const buildIssueHierarchy = (issueIds: string[], issueMap: TIssueMap): TIssueHierarchyProjection => {
  const availableIssueIds = new Set(issueIds.filter((issueId) => !shouldSkipIssue(issueId, issueMap)));
  const childrenByParentId: Record<string, string[]> = {};
  const depthByIssueId: Record<string, number> = {};
  const nestedIssueIds = new Set<string>();

  issueIds.forEach((issueId) => {
    const issue = issueMap[issueId];
    if (!issue?.parent_id || issue.parent_id === issueId || !availableIssueIds.has(issue.parent_id)) return;
    if (createsCycle(issueId, issue.parent_id, issueMap, availableIssueIds)) return;

    if (!childrenByParentId[issue.parent_id]) childrenByParentId[issue.parent_id] = [];
    childrenByParentId[issue.parent_id].push(issueId);
    nestedIssueIds.add(issueId);
  });

  const rootIssueIds = issueIds.filter((issueId) => availableIssueIds.has(issueId) && !nestedIssueIds.has(issueId));

  const applyDepth = (currentIssueIds: string[], depth: number) => {
    currentIssueIds.forEach((issueId) => {
      depthByIssueId[issueId] = depth;
      const childIssueIds = childrenByParentId[issueId] ?? [];
      if (childIssueIds.length > 0) applyDepth(childIssueIds, depth + 1);
    });
  };

  applyDepth(rootIssueIds, 0);

  return {
    rootIssueIds,
    childrenByParentId,
    depthByIssueId,
  };
};

export const mergeHierarchyChildren = (projectedChildIds: string[] = [], fetchedChildIds: string[] = []): string[] =>
  Array.from(new Set([...projectedChildIds, ...fetchedChildIds]));

export const flattenVisibleHierarchy = (
  rootIssueIds: string[],
  childrenByParentId: Record<string, string[]>,
  expandedIssueIds: Set<string>
): string[] => {
  const visibleIssueIds: string[] = [];

  const traverse = (issueIds: string[]) => {
    issueIds.forEach((issueId) => {
      visibleIssueIds.push(issueId);
      if (expandedIssueIds.has(issueId)) traverse(childrenByParentId[issueId] ?? []);
    });
  };

  traverse(rootIssueIds);
  return visibleIssueIds;
};
