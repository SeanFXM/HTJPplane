/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense } from "react";
import { observer } from "mobx-react";
import type { IWorkItemPeekOverview } from "@plane/types";
import { EIssueServiceType, EIssuesStoreType } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";

const LazyIssuePeekOverviewContent = lazy(() =>
  import("./root").then((module) => ({
    default: module.IssuePeekOverview,
  }))
);

/**
 * Lightweight gate for the editor-heavy work item peek view. Importing the
 * public component is cheap; its implementation is fetched only after a work
 * item has actually been selected for peeking.
 */
export const IssuePeekOverview = observer(function IssuePeekOverview(props: IWorkItemPeekOverview) {
  const issueStoreType = useIssueStoreType();
  const storeType = props.storeType ?? issueStoreType;
  const { peekIssue } = useIssueDetail(
    storeType === EIssuesStoreType.EPIC ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES
  );

  if (!peekIssue) return null;

  return (
    <Suspense fallback={null}>
      <LazyIssuePeekOverviewContent {...props} />
    </Suspense>
  );
});
