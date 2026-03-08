/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { AlertCircle } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// ui
import { Button } from "@plane/propel/button";
import { TransferIcon } from "@plane/propel/icons";

type Props = {
  handleClick: () => void;
  canTransferIssues?: boolean;
  disabled?: boolean;
};

export function TransferIssues(props: Props) {
  const { handleClick, canTransferIssues = false, disabled = false } = props;
  const { t } = useTranslation();
  return (
    <div className="-mt-2 mb-4 flex items-center justify-between px-4 pt-6">
      <div className="flex items-center gap-2 text-13 text-secondary">
        <AlertCircle className="h-3.5 w-3.5 text-secondary" />
        <span>{t("project_cycles.completed_cycles_not_editable")}</span>
      </div>

      {canTransferIssues && (
        <div>
          <Button variant="primary" size="lg" prependIcon={<TransferIcon />} onClick={handleClick} disabled={disabled}>
            {t("project_cycles.transfer_work_items_button")}
          </Button>
        </div>
      )}
    </div>
  );
}
