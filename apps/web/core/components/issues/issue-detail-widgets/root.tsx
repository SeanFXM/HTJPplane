/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense, useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type { TIssueServiceType, TWorkItemWidgets } from "@plane/types";
// components
import { LazyModalFallback } from "@/components/common/lazy-modal-fallback";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import { IssueDetailWidgetActionButtons } from "./action-buttons";
import { IssueDetailWidgetCollapsibles } from "./issue-detail-widget-collapsibles";

const LazyIssueDetailWidgetModals = lazy(() =>
  import("./issue-detail-widget-modals").then((module) => ({
    default: module.IssueDetailWidgetModals,
  }))
);

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
  renderWidgetModals?: boolean;
  issueServiceType: TIssueServiceType;
  hideWidgets?: TWorkItemWidgets[];
};

export const IssueDetailWidgets = observer(function IssueDetailWidgets(props: Props) {
  const {
    workspaceSlug,
    projectId,
    issueId,
    disabled,
    renderWidgetModals = true,
    issueServiceType,
    hideWidgets,
  } = props;
  const { isAnyModalOpen } = useIssueDetail(issueServiceType);
  const [hasRenderedModals, setHasRenderedModals] = useState(isAnyModalOpen);

  useEffect(() => {
    if (isAnyModalOpen) setHasRenderedModals(true);
  }, [isAnyModalOpen]);

  const shouldRenderModals = renderWidgetModals && (isAnyModalOpen || hasRenderedModals);

  return (
    <>
      <div className="flex flex-col space-y-4">
        <IssueDetailWidgetActionButtons
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
          disabled={disabled}
          issueServiceType={issueServiceType}
          hideWidgets={hideWidgets}
        />
        <IssueDetailWidgetCollapsibles
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueId={issueId}
          disabled={disabled}
          issueServiceType={issueServiceType}
          hideWidgets={hideWidgets}
        />
      </div>
      {shouldRenderModals && (
        <Suspense fallback={<LazyModalFallback label="Loading work item actions" />}>
          <LazyIssueDetailWidgetModals
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            issueId={issueId}
            issueServiceType={issueServiceType}
            hideWidgets={hideWidgets}
          />
        </Suspense>
      )}
    </>
  );
});
