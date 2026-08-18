/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// store hooks
// icons
import {
  TagIcon,
  CopyPlus,
  Calendar,
  Link2Icon,
  Users2Icon,
  ArchiveIcon,
  PaperclipIcon,
  TriangleIcon,
  LayoutGridIcon,
  SignalMediumIcon,
  MessageSquareIcon,
  UsersIcon,
} from "lucide-react";
import {
  BlockedIcon,
  BlockerIcon,
  CycleIcon,
  EpicIcon,
  IntakeIcon,
  ModuleIcon,
  RelatedIcon,
  WorkItemsIcon,
} from "@plane/propel/icons";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { IIssueActivity } from "@plane/types";
import { renderFormattedDate, generateWorkItemLink, capitalizeFirstLetter } from "@plane/utils";
// helpers
import { useLabel } from "@/hooks/store/use-label";
import { usePlatformOS } from "@/hooks/use-platform-os";
// types

export function IssueLink({ activity }: { activity: IIssueActivity }) {
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  const { isMobile } = usePlatformOS();

  const workItemLink = generateWorkItemLink({
    workspaceSlug: workspaceSlug?.toString() ?? activity.workspace_detail?.slug,
    projectId: activity?.project,
    issueId: activity?.issue,
    projectIdentifier: activity?.project_detail?.identifier,
    sequenceId: activity?.issue_detail?.sequence_id,
  });

  return (
    <Tooltip
      tooltipContent={activity?.issue_detail ? activity.issue_detail.name : t("activity_messages.work_item_deleted")}
      isMobile={isMobile}
    >
      {activity?.issue_detail ? (
        <a
          aria-disabled={activity.issue === null}
          href={workItemLink}
          target={activity.issue === null ? "_self" : "_blank"}
          rel={activity.issue === null ? "" : "noopener noreferrer"}
          className="inline items-center gap-1 font-medium text-primary hover:underline"
        >
          <span className="whitespace-nowrap">{`${activity.project_detail.identifier}-${activity.issue_detail.sequence_id}`}</span>{" "}
          <span className="font-regular break-all">{activity.issue_detail?.name}</span>
        </a>
      ) : (
        <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap text-primary">
          {t("activity_messages.a_work_item")}{" "}
        </span>
      )}
    </Tooltip>
  );
}

function UserLink({ activity }: { activity: IIssueActivity }) {
  // router params
  const { workspaceSlug } = useParams();

  return (
    <a
      href={`/${workspaceSlug ?? activity.workspace_detail?.slug}/profile/${
        activity.new_identifier ?? activity.old_identifier
      }`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center font-medium text-primary hover:underline"
    >
      {activity.new_value && activity.new_value !== "" ? activity.new_value : activity.old_value}
    </a>
  );
}

const LabelPill = observer(function LabelPill({ labelId, workspaceSlug }: { labelId: string; workspaceSlug: string }) {
  // store hooks
  const { workspaceLabels, fetchWorkspaceLabels } = useLabel();

  useEffect(() => {
    if (!workspaceLabels) fetchWorkspaceLabels(workspaceSlug);
  }, [fetchWorkspaceLabels, workspaceLabels, workspaceSlug]);

  return (
    <span
      className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
      style={{
        backgroundColor: workspaceLabels?.find((l) => l.id === labelId)?.color ?? "#000000",
      }}
      aria-hidden="true"
    />
  );
});

type TTranslateFn = (key: string) => string;

const getInboxUserActivityMessage = (activity: IIssueActivity, showIssue: boolean, t: TTranslateFn) => {
  switch (activity.verb) {
    case "-1":
      return showIssue ? t("activity_messages.declined_work_item") : t("activity_messages.declined_from_intake");
    case "0":
      return showIssue ? t("activity_messages.snoozed_work_item") : t("activity_messages.snoozed_this");
    case "1":
      return showIssue ? t("activity_messages.accepted_work_item") : t("activity_messages.accepted_from_intake");
    case "2":
      return showIssue ? t("activity_messages.declined_work_item") : t("activity_messages.marked_duplicate");
    default:
      return t("activity_messages.updated_intake_status");
  }
};

const getActivityDetails = (
  t: TTranslateFn
): {
  [key: string]: {
    message: (activity: IIssueActivity, showIssue: boolean, workspaceSlug: string) => React.ReactNode;
    icon: React.ReactNode;
  };
} => ({
  assignees: {
    message: (activity, showIssue) => {
      if (activity.old_value === "")
        return (
          <>
            {t("activity_messages.added_assignee")}
            <UserLink activity={activity} />
            {showIssue && (
              <>
                {t("activity_messages.to")}
                <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            {t("activity_messages.removed_assignee")}
            <UserLink activity={activity} />
            {showIssue && (
              <>
                {t("activity_messages.from")}
                <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <Users2Icon size={12} className="text-secondary" aria-hidden="true" />,
  },
  archived_at: {
    message: (activity) => {
      if (activity.new_value === "restore")
        return (
          <>
            {t("activity_messages.restored")} <IssueLink activity={activity} />
          </>
        );
      else
        return (
          <>
            {t("activity_messages.archived")} <IssueLink activity={activity} />
          </>
        );
    },
    icon: <ArchiveIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  attachment: {
    message: (activity, showIssue) => {
      if (activity.verb === "created")
        return (
          <>
            {t("activity_messages.uploaded_attachment")}
            {showIssue && (
              <>
                {t("activity_messages.to")}
                <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            {t("activity_messages.removed_attachment")}
            {showIssue && (
              <>
                {t("activity_messages.from")}
                <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <PaperclipIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  description: {
    message: (activity, showIssue) => (
      <>
        {t("activity_messages.updated_description")}
        {showIssue && (
          <>
            {t("activity_messages.of")}
            <IssueLink activity={activity} />
          </>
        )}
      </>
    ),
    icon: <MessageSquareIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  estimate_point: {
    message: (activity, showIssue) => {
      if (!activity.new_value)
        return (
          <>
            {t("activity_messages.removed_estimate_point")}
            {showIssue && (
              <>
                {t("activity_messages.from")}
                <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            {t("activity_messages.set_estimate_point_to")} {activity.new_value}
            {showIssue && (
              <>
                {t("activity_messages.for")}
                <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <TriangleIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  issue: {
    message: (activity) => {
      if (activity.verb === "created")
        return (
          <>
            {t("activity_messages.created_issue")} <IssueLink activity={activity} />
          </>
        );
      else if (activity.verb === "converted")
        return (
          <>
            {t("activity_messages.converted_to_epic")} <IssueLink activity={activity} />{" "}
            {t("activity_messages.to_epic")}
          </>
        );
      else
        return (
          <>
            {t("activity_messages.deleted_issue")} <IssueLink activity={activity} />
          </>
        );
    },
    icon: <WorkItemsIcon width={12} height={12} className="text-secondary" aria-hidden="true" />,
  },
  epic: {
    message: (activity) => {
      if (activity.verb === "created")
        return (
          <>
            {t("activity_messages.created_issue")} <IssueLink activity={activity} />
          </>
        );
      else if (activity.verb === "converted")
        return (
          <>
            {t("activity_messages.converted_to_epic")} <IssueLink activity={activity} />{" "}
            {t("activity_messages.converted_to_work_item")}
          </>
        );
      else
        return (
          <>
            {t("activity_messages.deleted_issue")} <IssueLink activity={activity} />
          </>
        );
    },
    icon: <EpicIcon width={12} height={12} className="text-secondary" aria-hidden="true" />,
  },
  labels: {
    message: (activity, showIssue, workspaceSlug) => {
      if (activity.old_value === "")
        return (
          <span className="overflow-hidden">
            {t("activity_messages.added_label")}{" "}
            <span className="inline-flex items-center gap-2 rounded-full border border-strong px-2 py-0.5 text-11">
              <LabelPill labelId={activity.new_identifier ?? ""} workspaceSlug={workspaceSlug} />
              <span className="line-clamp-1 flex-shrink font-medium break-all text-primary">{activity.new_value}</span>
            </span>
            {showIssue && (
              <span className="">
                {t("activity_messages.to")}
                <IssueLink activity={activity} />
              </span>
            )}
          </span>
        );
      else
        return (
          <>
            {t("activity_messages.removed_label")}{" "}
            <span className="inline-flex items-center gap-2 rounded-full border border-strong px-2 py-0.5 text-11">
              <LabelPill labelId={activity.old_identifier ?? ""} workspaceSlug={workspaceSlug} />
              <span className="line-clamp-1 flex-shrink font-medium break-all text-primary">{activity.old_value}</span>
            </span>
            {showIssue && (
              <span>
                {t("activity_messages.from")}
                <IssueLink activity={activity} />
              </span>
            )}
          </>
        );
    },
    icon: <TagIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  link: {
    message: (activity, showIssue) => {
      if (activity.verb === "created")
        return (
          <>
            {t("activity_messages.added_link")}{" "}
            <a
              href={`${activity.new_value}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {t("activity_messages.link")}
            </a>
            {showIssue && (
              <>
                {t("activity_messages.to")}
                <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else if (activity.verb === "updated")
        return (
          <>
            {t("activity_messages.updated_link")}{" "}
            <a
              href={`${activity.old_value}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {t("activity_messages.link")}
            </a>
            {showIssue && (
              <>
                {t("activity_messages.from")}
                <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            {t("activity_messages.removed_link")}{" "}
            <a
              href={`${activity.old_value}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {t("activity_messages.link")}
            </a>
            {showIssue && (
              <>
                {t("activity_messages.from")}
                <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <Link2Icon size={12} className="text-secondary" aria-hidden="true" />,
  },
  cycles: {
    message: (activity, showIssue, workspaceSlug) => {
      if (activity.verb === "created")
        return (
          <>
            <span className="flex-shrink-0">
              {t("activity_messages.added_to_cycle")}{" "}
              {showIssue ? <IssueLink activity={activity} /> : t("activity_messages.this_work_item")}{" "}
              <span className="whitespace-nowrap">{t("activity_messages.to_the_cycle")}</span>{" "}
            </span>
            <a
              href={`/${workspaceSlug}/projects/${activity.project}/cycles/${activity.new_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline items-center gap-1 font-medium text-primary hover:underline"
            >
              <span className="break-all">{activity.new_value}</span>
            </a>
          </>
        );
      else if (activity.verb === "updated")
        return (
          <>
            <span className="flex-shrink-0 whitespace-nowrap">{t("activity_messages.set_cycle_to")} </span>
            <a
              href={`/${workspaceSlug}/projects/${activity.project}/cycles/${activity.new_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline items-center gap-1 font-medium text-primary hover:underline"
            >
              <span className="break-all">{activity.new_value}</span>
            </a>
          </>
        );
      else
        return (
          <>
            {t("activity_messages.removed_from_cycle")} <IssueLink activity={activity} />{" "}
            {t("activity_messages.from_the_cycle")}{" "}
            <a
              href={`/${workspaceSlug}/projects/${activity.project}/cycles/${activity.old_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline items-center gap-1 font-medium text-primary hover:underline"
            >
              <span className="break-all">{activity.old_value}</span>
            </a>
          </>
        );
    },
    icon: <CycleIcon height={12} width={12} className="text-secondary" aria-hidden="true" />,
  },
  modules: {
    message: (activity, showIssue, workspaceSlug) => {
      if (activity.verb === "created")
        return (
          <>
            {t("activity_messages.added_to_module")}{" "}
            {showIssue ? <IssueLink activity={activity} /> : t("activity_messages.this_work_item")}{" "}
            {t("activity_messages.to_the_module")}{" "}
            <a
              href={`/${workspaceSlug}/projects/${activity.project}/modules/${activity.new_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline items-center gap-1 font-medium text-primary hover:underline"
            >
              <span className="break-all">{activity.new_value}</span>
            </a>
          </>
        );
      else if (activity.verb === "updated")
        return (
          <>
            {t("activity_messages.set_module_to")}{" "}
            <a
              href={`/${workspaceSlug}/projects/${activity.project}/modules/${activity.new_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline items-center gap-1 font-medium text-primary hover:underline"
            >
              <span className="break-all">{activity.new_value}</span>
            </a>
          </>
        );
      else
        return (
          <>
            {t("activity_messages.removed_from_module")} <IssueLink activity={activity} />{" "}
            {t("activity_messages.from_the_module")}{" "}
            <a
              href={`/${workspaceSlug}/projects/${activity.project}/modules/${activity.old_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline items-center gap-1 font-medium text-primary hover:underline"
            >
              <span className="break-all">{activity.old_value}</span>
            </a>
          </>
        );
    },
    icon: <ModuleIcon className="h-3 w-3 !text-secondary" aria-hidden="true" />,
  },
  name: {
    message: (activity, showIssue) => (
      <>
        {t("activity_messages.set_title_to")} <span className="break-all">{activity.new_value}</span>
        {showIssue && (
          <>
            {t("activity_messages.of")}
            <IssueLink activity={activity} />
          </>
        )}
      </>
    ),
    icon: <MessageSquareIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  parent: {
    message: (activity, showIssue) => {
      if (!activity.new_value)
        return (
          <>
            {t("activity_messages.removed_parent")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.old_value}</span>
            {showIssue && (
              <>
                {t("activity_messages.from")}
                <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            {t("activity_messages.set_parent_to")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.new_value}</span>
            {showIssue && (
              <>
                {t("activity_messages.for")}
                <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <UsersIcon className="h-3 w-3 !text-secondary" aria-hidden="true" />,
  },
  priority: {
    message: (activity, showIssue) => (
      <>
        {t("activity_messages.set_priority_to")}{" "}
        <span className="font-medium text-primary">
          {activity.new_value ? capitalizeFirstLetter(activity.new_value) : "None"}
        </span>
        {showIssue && (
          <>
            {t("activity_messages.for")}
            <IssueLink activity={activity} />
          </>
        )}
      </>
    ),
    icon: <SignalMediumIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  relates_to: {
    message: (activity, showIssue) => {
      if (activity.old_value === "")
        return (
          <>
            {t("activity_messages.marked_relates_to")}{" "}
            {showIssue ? <IssueLink activity={activity} /> : t("activity_messages.this_work_item")}{" "}
            {t("activity_messages.relates_to")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.new_value}</span>.
          </>
        );
      else
        return (
          <>
            {t("activity_messages.removed_relation")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.old_value}</span>.
          </>
        );
    },
    icon: <RelatedIcon height="12" width="12" className="text-secondary" />,
  },
  blocking: {
    message: (activity, showIssue) => {
      if (activity.old_value === "")
        return (
          <>
            {t("activity_messages.marked_blocking")}{" "}
            {showIssue ? <IssueLink activity={activity} /> : t("activity_messages.this_work_item")}{" "}
            {t("activity_messages.is_blocking")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.new_value}</span>.
          </>
        );
      else
        return (
          <>
            {t("activity_messages.removed_blocking")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.old_value}</span>.
          </>
        );
    },
    icon: <BlockerIcon height="12" width="12" className="text-secondary" />,
  },
  blocked_by: {
    message: (activity, showIssue) => {
      if (activity.old_value === "")
        return (
          <>
            {t("activity_messages.marked_blocked_by")}{" "}
            {showIssue ? <IssueLink activity={activity} /> : t("activity_messages.this_work_item")}{" "}
            {t("activity_messages.is_blocked_by")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.new_value}</span>.
          </>
        );
      else
        return (
          <>
            {t("activity_messages.removed_blocked_by")}{" "}
            {showIssue ? <IssueLink activity={activity} /> : t("activity_messages.this_work_item")}{" "}
            {t("activity_messages.being_blocked_by")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.old_value}</span>.
          </>
        );
    },
    icon: <BlockedIcon height="12" width="12" className="text-secondary" />,
  },
  duplicate: {
    message: (activity, showIssue) => {
      if (activity.old_value === "")
        return (
          <>
            {t("activity_messages.marked_duplicate_of")}{" "}
            {showIssue ? <IssueLink activity={activity} /> : t("activity_messages.this_work_item")}{" "}
            {t("activity_messages.as_duplicate_of")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.new_value}</span>.
          </>
        );
      else
        return (
          <>
            {t("activity_messages.removed_duplicate_of")}{" "}
            {showIssue ? <IssueLink activity={activity} /> : t("activity_messages.this_work_item")}{" "}
            {t("activity_messages.as_a_duplicate_of")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.old_value}</span>.
          </>
        );
    },
    icon: <CopyPlus size={12} className="text-secondary" />,
  },
  state: {
    message: (activity, showIssue) => (
      <>
        {t("activity_messages.set_state_to")}{" "}
        <span className="font-medium break-all text-primary">{activity.new_value}</span>
        {showIssue && (
          <>
            {t("activity_messages.for")}
            <IssueLink activity={activity} />
          </>
        )}
      </>
    ),
    icon: <LayoutGridIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  start_date: {
    message: (activity, showIssue) => {
      if (!activity.new_value)
        return (
          <>
            {t("activity_messages.removed_start_date")}
            {showIssue && (
              <>
                {t("activity_messages.from")}
                <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            {t("activity_messages.set_start_date_to")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">
              {renderFormattedDate(activity.new_value)}
            </span>
            {showIssue && (
              <>
                {t("activity_messages.for")}
                <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <Calendar size={12} className="text-secondary" aria-hidden="true" />,
  },
  target_date: {
    message: (activity, showIssue) => {
      if (!activity.new_value)
        return (
          <>
            {t("activity_messages.removed_due_date")}
            {showIssue && (
              <>
                {t("activity_messages.from")}
                <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            {t("activity_messages.set_due_date_to")}{" "}
            <span className="font-medium whitespace-nowrap text-primary">
              {renderFormattedDate(activity.new_value)}
            </span>
            {showIssue && (
              <>
                <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <Calendar size={12} className="text-secondary" aria-hidden="true" />,
  },
  inbox: {
    message: (activity, showIssue) => (
      <>
        {getInboxUserActivityMessage(activity, showIssue, t)}
        {showIssue && (
          <>
            {" "}
            <IssueLink activity={activity} />
          </>
        )}
        {activity.verb === "2" && t("activity_messages.from_intake_by_duplicate")}
      </>
    ),
    icon: <IntakeIcon className="size-3 text-secondary" aria-hidden="true" />,
  },
});

export function ActivityIcon({ activity }: { activity: IIssueActivity }) {
  const { t } = useTranslation();
  const activityDetails = getActivityDetails(t);
  return <>{activityDetails[activity.field as keyof typeof activityDetails]?.icon}</>;
}

type ActivityMessageProps = {
  activity: IIssueActivity;
  showIssue?: boolean;
};

export function ActivityMessage({ activity, showIssue = false }: ActivityMessageProps) {
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  const activityField = activity.field ?? "issue";
  const activityDetails = getActivityDetails(t);

  return (
    <>
      {activityDetails[activityField as keyof typeof activityDetails]?.message(
        activity,
        showIssue,
        workspaceSlug ? workspaceSlug.toString() : (activity.workspace_detail?.slug ?? "")
      )}
    </>
  );
}
