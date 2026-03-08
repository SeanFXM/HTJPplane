/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// hooks
import { useTranslation } from "@plane/i18n";
import { ModuleIcon } from "@plane/propel/icons";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// components
import { IssueActivityBlockComponent } from "./";
// icons

type TIssueModuleActivity = { activityId: string; ends: "top" | "bottom" | undefined };

export const IssueModuleActivity = observer(function IssueModuleActivity(props: TIssueModuleActivity) {
  const { activityId, ends } = props;
  const { t } = useTranslation();
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);

  if (!activity) return <></>;
  return (
    <IssueActivityBlockComponent
      icon={<ModuleIcon className="h-4 w-4 flex-shrink-0 text-secondary" />}
      activityId={activityId}
      ends={ends}
    >
      <>
        {activity.verb === "created" ? (
          <>
            <span>
              {t("activity_messages.added_to_module")} {t("activity_messages.this_work_item")}{" "}
              {t("activity_messages.to_the_module")}{" "}
            </span>
            <a
              href={`/${activity.workspace_detail?.slug}/projects/${activity.project}/modules/${activity.new_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 truncate font-medium text-primary hover:underline"
            >
              <span className="truncate">{activity.new_value}</span>
            </a>
          </>
        ) : activity.verb === "updated" ? (
          <>
            <span>{t("activity_messages.set_module_to")} </span>
            <a
              href={`/${activity.workspace_detail?.slug}/projects/${activity.project}/modules/${activity.new_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 truncate font-medium text-primary hover:underline"
            >
              <span className="truncate"> {activity.new_value}</span>
            </a>
          </>
        ) : (
          <>
            <span>
              {t("activity_messages.removed_from_module")} {t("activity_messages.this_work_item")}{" "}
              {t("activity_messages.from_the_module")}{" "}
            </span>
            <a
              href={`/${activity.workspace_detail?.slug}/projects/${activity.project}/modules/${activity.old_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 truncate font-medium text-primary hover:underline"
            >
              <span className="truncate"> {activity.old_value}</span>
            </a>
          </>
        )}
      </>
    </IssueActivityBlockComponent>
  );
});
