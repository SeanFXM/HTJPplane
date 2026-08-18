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
import type { TDeDupeIssue, TIssue } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { getIssueActionErrorMessage } from "./issue-action-error";

type Props = {
  data?: TIssue | TDeDupeIssue;
  dataId?: string | null | undefined;
  handleClose: () => void;
  isOpen: boolean;
  onSubmit?: () => Promise<void>;
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
  if (!issue) return null;

  const projectDetails = getProjectById(issue.project_id);
  const hasSubWorkItems = "sub_issues_count" in issue && (issue.sub_issues_count ?? 0) > 0;

  const onClose = () => {
    setIsArchiving(false);
    handleClose();
  };

  const handleArchiveIssue = async () => {
    if (!onSubmit) return;

    setIsArchiving(true);
    try {
      await onSubmit();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("issue.archive.success.label"),
        message: t("issue.archive.success.message"),
      });
      onClose();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: getIssueActionErrorMessage(error, t("issue.archive.failed.message")),
      });
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      <div className="px-5 py-4">
        <h3 className="text-18 font-medium 2xl:text-20">
          {t("issue.archive.label")} {projectDetails?.identifier} {issue.sequence_id}
        </h3>
        <div className="mt-3 space-y-2 text-13 text-secondary">
          <p>{t("issue.archive.confirm_message")}</p>
          {hasSubWorkItems && (
            <p className="font-medium text-primary">{t("issue.archive.active_descendant_warning")}</p>
          )}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" size="lg" onClick={handleArchiveIssue} loading={isArchiving}>
            {isArchiving ? t("common.archiving") : t("common.archive")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
