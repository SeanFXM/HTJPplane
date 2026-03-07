/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IState, IStateLite } from "@plane/types";

const DEFAULT_STATE_NAME_TO_I18N: Record<string, string> = {
  Backlog: "workspace_projects.state.backlog",
  Todo: "workspace_projects.state.unstarted",
  "In Progress": "workspace_projects.state.started",
  Done: "workspace_projects.state.completed",
  Cancelled: "workspace_projects.state.cancelled",
  Canceled: "workspace_projects.state.cancelled",
};

/**
 * Returns localized display name for default states (Backlog, Todo, etc.),
 * or the original name for custom states.
 */
export function getStateDisplayName(
  state: Pick<IState | IStateLite, "name"> | undefined | null,
  t: (key: string) => string
): string {
  if (!state) return "";
  const i18nKey = DEFAULT_STATE_NAME_TO_I18N[state.name];
  return i18nKey != null ? t(i18nKey) : state.name;
}
