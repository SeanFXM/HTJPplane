/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssuePriorities } from "@plane/types";

const PRIORITY_KEY_TO_I18N: Record<string, string> = {
  urgent: "issue.priority.urgent",
  high: "issue.priority.high",
  medium: "issue.priority.medium",
  low: "issue.priority.low",
  none: "common.none",
};

/**
 * Returns localized display name for priority (Urgent, High, Medium, Low, None).
 */
export function getPriorityDisplayName(
  priorityKey: TIssuePriorities | string | undefined | null,
  t: (key: string) => string
): string {
  if (!priorityKey) return t("common.none");
  const i18nKey = PRIORITY_KEY_TO_I18N[priorityKey];
  return i18nKey != null ? t(i18nKey) : priorityKey;
}
