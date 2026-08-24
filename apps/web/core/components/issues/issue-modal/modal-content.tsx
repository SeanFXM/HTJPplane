/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane web imports
import { IssueModalProvider } from "@/plane-web/components/issues/issue-modal/provider";
// local imports
import { CreateUpdateIssueModalBase } from "./base";
import type { IssuesModalProps } from "./modal";

/**
 * The editor-heavy portion of the work item modal. Keep this component behind
 * the lazy boundary in `modal.tsx` so closed modals do not enter route bundles.
 */
export const CreateUpdateIssueModalContent = observer(function CreateUpdateIssueModalContent(props: IssuesModalProps) {
  // router params
  const { cycleId, moduleId } = useParams();
  // derived values
  const dataForPreload = {
    ...props.data,
    cycle_id: props.data?.cycle_id ? props.data.cycle_id : cycleId ? cycleId.toString() : null,
    module_ids: props.data?.module_ids ? props.data.module_ids : moduleId ? [moduleId.toString()] : null,
  };

  return (
    <IssueModalProvider
      templateId={props.templateId}
      dataForPreload={dataForPreload}
      allowedProjectIds={props.allowedProjectIds}
    >
      <CreateUpdateIssueModalBase {...props} />
    </IssueModalProvider>
  );
});
