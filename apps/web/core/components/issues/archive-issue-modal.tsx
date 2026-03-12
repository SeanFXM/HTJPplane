/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// i18n
import { useTranslation } from "@plane/i18n";
// types
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TDeDupeIssue, TIssue, TIssueHierarchyActionPayload } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";

type Props = {
  data?: TIssue | TDeDupeIssue;
  dataId?: string | null | undefined;
  handleClose: () => void;
  isOpen: boolean;
  onSubmit?: (payload?: TIssueHierarchyActionPayload) => Promise<void>;
};

export function ArchiveIssueModal(props: Props) {
  const { dataId, data, isOpen, handleClose, onSubmit } = props;
  const { t } = useTranslation();
  // states
  const [isArchiving, setIsArchiving] = useState(false);
  // store hooks
  const { getProjectById } = useProject();
  const { issueMap } = useIssues();

  if (!dataId && !data) return null;

  const issue = data ? data : issueMap[dataId!];
  const subIssueCount = issue && "sub_issues_count" in issue ? (issue.sub_issues_count ?? 0) : 0;
  const projectDetails = getProjectById(issue.project_id);

  const onClose = () => {
    setIsArchiving(false);
    handleClose();
  };

  const hasChildIssues = subIssueCount > 0;

  const handleArchiveIssue = async (payload?: TIssueHierarchyActionPayload) => {
    if (!onSubmit) return;

    setIsArchiving(true);
    await onSubmit(payload)
      .then(() => {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("issue.archive.success.label"),
          message: t("issue.archive.success.message"),
        });
        onClose();
        return;
      })
      .catch(() =>
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("common.error.label"),
          message: t("issue.archive.failed.message"),
        })
      )
      .finally(() => setIsArchiving(false));
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      <div className="px-5 py-4">
        <h3 className="text-18 font-medium 2xl:text-20">
          {t("issue.archive.label")} {projectDetails?.identifier} {issue.sequence_id}
        </h3>
        <p className="mt-3 text-13 text-secondary">
          {hasChildIssues
            ? `This parent work item has ${subIssueCount} sub-work items. Choose whether to archive them together or archive only the parent and release the sub-work items as top-level items.`
            : t("issue.archive.confirm_message")}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {hasChildIssues && (
            <Button
              variant="secondary"
              size="lg"
              onClick={() => handleArchiveIssue({ sub_issue_strategy: "release" })}
              loading={isArchiving}
            >
              Archive parent only
            </Button>
          )}
          <Button
            variant="primary"
            size="lg"
            onClick={() => handleArchiveIssue(hasChildIssues ? { sub_issue_strategy: "cascade_archive" } : undefined)}
            loading={isArchiving}
          >
            {hasChildIssues
              ? isArchiving
                ? "Archiving..."
                : "Archive parent and sub-work items"
              : isArchiving
                ? t("common.archiving")
                : t("common.archive")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
