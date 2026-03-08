/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// types
import type { TIssue } from "@plane/types";
// helpers
import { Row } from "@plane/ui";
import { cn } from "@plane/utils";
import { useTranslation } from "@plane/i18n";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
import { IssueStats } from "@/plane-web/components/issues/issue-layouts/issue-stats";

type Props = {
  issue: TIssue;
};

export const SpreadsheetSubIssueColumn = observer(function SpreadsheetSubIssueColumn(props: Props) {
  const { t } = useTranslation();
  const { issue } = props;
  // router
  const router = useAppRouter();
  // hooks
  const { workspaceSlug } = useParams();
  // derived values
  const isEpic = issue?.is_epic;
  const subIssueCount = issue?.sub_issues_count ?? 0;

  const redirectToIssueDetail = () => {
    router.push(
      `/${workspaceSlug?.toString()}/projects/${issue.project_id}/${issue.archived_at ? "archives/" : ""}${isEpic ? "epics" : "issues"}/${issue.id}#sub-issues`
    );
  };

  const label = t("common.sub_work_items_count", { count: subIssueCount });

  return (
    <Row
      onClick={subIssueCount ? redirectToIssueDetail : () => {}}
      className={cn(
        "flex h-11 w-full items-center border-b-[0.5px] border-subtle py-1 text-11 group-[.selected-issue-row]:bg-accent-primary/5 hover:bg-surface-2 group-[.selected-issue-row]:hover:bg-accent-primary",
        {
          "cursor-pointer": subIssueCount,
        }
      )}
    >
      {isEpic ? <IssueStats issueId={issue.id} /> : label}
    </Row>
  );
});
