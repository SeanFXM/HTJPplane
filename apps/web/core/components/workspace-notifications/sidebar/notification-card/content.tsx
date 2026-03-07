/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TNotification } from "@plane/types";
import {
  convertMinutesToHoursMinutesString,
  renderFormattedDate,
  sanitizeCommentForNotification,
  stripAndTruncateHTML,
} from "@plane/utils";
// components
import { LiteTextEditor } from "@/components/editor/lite-text";
import {
  ADDITIONAL_NOTIFICATION_CONTENT_MAP,
  renderAdditionalAction,
  renderAdditionalValue,
  shouldShowConnector,
} from "@/plane-web/components/workspace-notifications/notification-card/content";

// Types
export type TNotificationFieldData = {
  field: string | undefined;
  newValue: string | undefined;
  oldValue: string | undefined;
  verb: string | undefined;
};

export type TNotificationContentDetails = {
  action?: ReactNode;
  value?: ReactNode;
  suffix?: ReactNode;
  showConnector?: boolean;
};

export type TNotificationContentHandler = (data: TNotificationFieldData) => TNotificationContentDetails | null;

export type TNotificationContentMap = {
  [key: string]: TNotificationContentHandler;
};

const normalizeNotificationValue = (value: string | undefined | null) => (value ?? "").trim();

const isEmptyNotificationValue = (value: string | undefined | null) => normalizeNotificationValue(value) === "";

const translateSystemNotificationValue = (
  t: (key: string, params?: Record<string, unknown>) => string,
  field: string | undefined,
  value: string | undefined
) => {
  const normalizedValue = normalizeNotificationValue(value);
  if (!normalizedValue) return value;

  const lowerValue = normalizedValue.toLowerCase();

  if (field === "state") {
    const stateMap: Record<string, string> = {
      backlog: t("notification.content.system_values.state.backlog"),
      todo: t("notification.content.system_values.state.todo"),
      "in progress": t("notification.content.system_values.state.in_progress"),
      done: t("notification.content.system_values.state.done"),
      cancelled: t("notification.content.system_values.state.cancelled"),
      canceled: t("notification.content.system_values.state.cancelled"),
    };

    return stateMap[lowerValue] ?? value;
  }

  if (field === "priority") {
    const priorityMap: Record<string, string> = {
      urgent: t("notification.content.system_values.priority.urgent"),
      high: t("notification.content.system_values.priority.high"),
      medium: t("notification.content.system_values.priority.medium"),
      low: t("notification.content.system_values.priority.low"),
      none: t("notification.content.system_values.priority.none"),
    };

    return priorityMap[lowerValue] ?? value;
  }

  if (field === "intake") {
    const intakeMap: Record<string, string> = {
      pending: t("notification.content.system_values.intake.pending"),
      rejected: t("notification.content.system_values.intake.rejected"),
      snoozed: t("notification.content.system_values.intake.snoozed"),
      accepted: t("notification.content.system_values.intake.accepted"),
      duplicate: t("notification.content.system_values.intake.duplicate"),
    };

    return intakeMap[lowerValue] ?? value;
  }

  return value;
};

const getTranslatedNotificationValue = (
  t: (key: string, params?: Record<string, unknown>) => string,
  field: string | undefined,
  value: string | undefined
): string | undefined => {
  if (!field) return value;

  if (field === "start_date" || field === "target_date") {
    return renderFormattedDate(value) ?? value;
  }

  if (field === "description") {
    return stripAndTruncateHTML(value || "", 55);
  }

  if (field.startsWith("estimate_")) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? convertMinutesToHoursMinutesString(numericValue) : value;
  }

  return translateSystemNotificationValue(t, field, value);
};

const getBaseNotificationContentDetails = (
  t: (key: string, params?: Record<string, unknown>) => string,
  fieldData: TNotificationFieldData,
  isMentionedNotification: boolean,
  renderCommentBox?: boolean
): TNotificationContentDetails | null => {
  const { field, newValue, oldValue, verb } = fieldData;

  if (isMentionedNotification) {
    return {
      action: t("notification.content.actions.mentioned_you"),
      suffix: null,
    };
  }

  if (!field) return null;

  const nextValue = !isEmptyNotificationValue(newValue) ? newValue : oldValue;
  switch (field) {
    case "duplicate":
      return {
        action:
          verb === "created"
            ? t("notification.content.actions.marked_duplicate")
            : t("notification.content.actions.unmarked_duplicate"),
        suffix: null,
      };
    case "assignees":
      return {
        action: t(
          !isEmptyNotificationValue(newValue)
            ? "notification.content.actions.added_assignee"
            : "notification.content.actions.removed_assignee",
          {
            value: getTranslatedNotificationValue(t, field, nextValue) ?? "",
          }
        ),
        value: null,
        suffix: null,
      };
    case "start_date":
      return {
        action: t(
          !isEmptyNotificationValue(newValue)
            ? "notification.content.actions.set_start_date"
            : "notification.content.actions.removed_start_date",
          {
            value: getTranslatedNotificationValue(t, field, newValue) ?? "",
          }
        ),
        value: null,
        suffix: null,
      };
    case "target_date":
      return {
        action: t(
          !isEmptyNotificationValue(newValue)
            ? "notification.content.actions.set_due_date"
            : "notification.content.actions.removed_due_date",
          {
            value: getTranslatedNotificationValue(t, field, newValue) ?? "",
          }
        ),
        value: null,
        suffix: null,
      };
    case "labels":
      return {
        action: t(
          !isEmptyNotificationValue(newValue)
            ? "notification.content.actions.added_label"
            : "notification.content.actions.removed_label",
          {
            value: getTranslatedNotificationValue(t, field, nextValue) ?? "",
          }
        ),
        value: null,
        suffix: null,
      };
    case "parent":
      return {
        action: t(
          !isEmptyNotificationValue(newValue)
            ? "notification.content.actions.set_parent"
            : "notification.content.actions.removed_parent",
          {
            value: getTranslatedNotificationValue(t, field, nextValue) ?? "",
          }
        ),
        value: null,
        suffix: null,
      };
    case "relates_to":
      return {
        action: t(
          verb === "deleted"
            ? "notification.content.actions.removed_related_work_item"
            : "notification.content.actions.updated_related_work_item",
          {
            value: getTranslatedNotificationValue(t, field, nextValue) ?? "",
          }
        ),
        value: null,
        suffix: null,
      };
    case "blocked_by":
      return {
        action: t(
          verb === "deleted"
            ? "notification.content.actions.removed_blocked_by_work_item"
            : "notification.content.actions.updated_blocked_by_work_item",
          {
            value: getTranslatedNotificationValue(t, field, nextValue) ?? "",
          }
        ),
        value: null,
        suffix: null,
      };
    case "blocking":
      return {
        action: t(
          verb === "deleted"
            ? "notification.content.actions.removed_blocking_work_item"
            : "notification.content.actions.updated_blocking_work_item",
          {
            value: getTranslatedNotificationValue(t, field, nextValue) ?? "",
          }
        ),
        value: null,
        suffix: null,
      };
    case "comment":
      return {
        action: renderCommentBox
          ? t("notification.content.actions.commented")
          : t("notification.content.actions.commented_with_preview", {
              value: sanitizeCommentForNotification(newValue),
            }),
        value: null,
        suffix: null,
      };
    case "archived_at":
      return {
        action:
          newValue === "restore"
            ? t("notification.content.actions.restored_work_item")
            : t("notification.content.actions.archived_work_item"),
        suffix: null,
      };
    case "None":
      return {
        action: t("notification.content.actions.created_and_assigned_to_you"),
        suffix: null,
      };
    case "attachment":
      return {
        action:
          verb === "deleted"
            ? t("notification.content.actions.removed_attachment")
            : t("notification.content.actions.uploaded_attachment"),
        suffix: null,
      };
    case "description":
      return {
        action: t("notification.content.actions.updated_description", {
          value: getTranslatedNotificationValue(t, field, newValue) ?? "",
        }),
        value: null,
        suffix: null,
      };
    case "state":
      return {
        action: t("notification.content.actions.set_state", {
          value: getTranslatedNotificationValue(t, field, nextValue) ?? "",
        }),
        value: null,
        suffix: null,
      };
    case "priority":
      return {
        action: t("notification.content.actions.set_priority", {
          value: getTranslatedNotificationValue(t, field, nextValue) ?? "",
        }),
        value: null,
        suffix: null,
      };
    case "name":
      return {
        action: t("notification.content.actions.updated_title", {
          value: getTranslatedNotificationValue(t, field, nextValue) ?? "",
        }),
        value: null,
        suffix: null,
      };
    case "cycles":
      return {
        action: t(
          verb === "deleted"
            ? "notification.content.actions.removed_cycle"
            : verb === "created"
              ? "notification.content.actions.added_cycle"
              : "notification.content.actions.updated_cycle",
          {
            value: getTranslatedNotificationValue(t, field, nextValue) ?? "",
          }
        ),
        value: null,
        suffix: null,
      };
    case "modules":
      return {
        action: t(
          verb === "deleted"
            ? "notification.content.actions.removed_module"
            : verb === "created"
              ? "notification.content.actions.added_module"
              : "notification.content.actions.updated_module",
          {
            value: getTranslatedNotificationValue(t, field, nextValue) ?? "",
          }
        ),
        value: null,
        suffix: null,
      };
    case "link":
      return {
        action: t(
          verb === "deleted"
            ? "notification.content.actions.removed_link"
            : verb === "created"
              ? "notification.content.actions.added_link"
              : "notification.content.actions.updated_link",
          {
            value: getTranslatedNotificationValue(t, field, nextValue) ?? "",
          }
        ),
        value: null,
        suffix: null,
      };
    case "reaction":
      return {
        action: t(
          verb === "deleted"
            ? "notification.content.actions.removed_reaction"
            : "notification.content.actions.added_reaction",
          {
            value: getTranslatedNotificationValue(t, field, nextValue) ?? "",
          }
        ),
        value: null,
        suffix: null,
      };
    case "vote":
      return {
        action:
          verb === "deleted" ? t("notification.content.actions.removed_vote") : t("notification.content.actions.voted"),
        suffix: null,
      };
    case "intake":
      return {
        action: t("notification.content.actions.updated_intake_status", {
          value: getTranslatedNotificationValue(t, field, nextValue) ?? "",
        }),
        value: null,
        suffix: null,
      };
    case "draft":
      return {
        action: t(
          verb === "deleted"
            ? "notification.content.actions.deleted_draft"
            : verb === "created"
              ? "notification.content.actions.created_draft"
              : "notification.content.actions.updated_draft"
        ),
        suffix: null,
      };
    case "issue":
      return {
        action: t("notification.content.actions.deleted_work_item"),
        suffix: null,
      };
    default:
      if (field.startsWith("estimate_")) {
        return {
          action: t("notification.content.actions.updated_estimate", {
            value: getTranslatedNotificationValue(t, field, nextValue) ?? "",
          }),
          value: null,
          suffix: null,
        };
      }

      // Check additional map from plane-web (EE extensions)
      const additionalHandler = ADDITIONAL_NOTIFICATION_CONTENT_MAP[field];
      if (additionalHandler) {
        return additionalHandler(fieldData);
      }

      return null;
  }
};

export function NotificationContent({
  notification,
  workspaceId,
  workspaceSlug,
  projectId,
  renderCommentBox = false,
}: {
  notification: TNotification;
  workspaceId: string;
  workspaceSlug: string;
  projectId: string;
  renderCommentBox?: boolean;
}) {
  const { t } = useTranslation();
  const { data, triggered_by_details: triggeredBy } = notification;
  const notificationField = data?.issue_activity.field;
  const newValue = data?.issue_activity.new_value;
  const oldValue = data?.issue_activity.old_value;
  const verb = data?.issue_activity.verb;

  const fieldData: TNotificationFieldData = {
    field: notificationField,
    newValue,
    oldValue,
    verb,
  };

  const renderTriggerName = () => (
    <span className="font-medium text-primary">
      {triggeredBy?.is_bot ? triggeredBy.first_name : triggeredBy?.display_name}{" "}
    </span>
  );

  // Get content details from map
  const contentDetails = getBaseNotificationContentDetails(
    t,
    fieldData,
    !!notification.is_mentioned_notification,
    renderCommentBox
  );

  // Render action - use map value if defined, otherwise fall through to default handler
  // Note: undefined = fall through to default, null = explicitly no action text
  const renderAction = (): ReactNode => {
    // Check if action is explicitly defined in map (including null)
    if (contentDetails && "action" in contentDetails) return contentDetails.action;
    if (!notificationField) return "";
    // Fallback to default action handler for fields not in map or without action defined
    return renderAdditionalAction(notificationField, verb);
  };

  // Render value - use map value if defined, otherwise fall through to default handler
  const renderValue = (): ReactNode => {
    // Check if value is explicitly defined in map
    if (contentDetails && "value" in contentDetails) return contentDetails.value;
    // Fallback to default value handler for fields not in map or without value defined
    return renderAdditionalValue(notificationField, newValue, oldValue);
  };
  const renderedValue = renderValue();
  const shouldRenderValue = renderedValue !== undefined && renderedValue !== null && renderedValue !== "";
  const showConnector =
    contentDetails?.showConnector !== undefined ? contentDetails.showConnector : shouldShowConnector(notificationField);

  return (
    <>
      {renderTriggerName()}
      <span className="text-tertiary">{renderAction()}</span>
      {showConnector && shouldRenderValue && (
        <span className="text-tertiary">{t("notification.content.connectors.to")} </span>
      )}
      {shouldRenderValue && <span className="font-medium text-primary">{renderedValue}</span>}
      {notificationField === "comment" && renderCommentBox && (
        <div className="origin-left scale-75">
          <LiteTextEditor
            editable={false}
            id=""
            initialValue={newValue ?? ""}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            displayConfig={{
              fontSize: "small-font",
            }}
          />
        </div>
      )}
      {contentDetails?.suffix === null ? null : <span className="text-tertiary">{contentDetails?.suffix ?? "."}</span>}
    </>
  );
}
