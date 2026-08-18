/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TChartData } from "./charts";
import type { TIssuePriorities } from "./issues";
import type { TStateGroups } from "./state";

export enum ChartXAxisProperty {
  STATES = "STATES",
  STATE_GROUPS = "STATE_GROUPS",
  LABELS = "LABELS",
  ASSIGNEES = "ASSIGNEES",
  ESTIMATE_POINTS = "ESTIMATE_POINTS",
  CYCLES = "CYCLES",
  MODULES = "MODULES",
  PRIORITY = "PRIORITY",
  START_DATE = "START_DATE",
  TARGET_DATE = "TARGET_DATE",
  CREATED_AT = "CREATED_AT",
  COMPLETED_AT = "COMPLETED_AT",
  CREATED_BY = "CREATED_BY",
  WORK_ITEM_TYPES = "WORK_ITEM_TYPES",
  PROJECTS = "PROJECTS",
  EPICS = "EPICS",
}

export enum ChartYAxisMetric {
  WORK_ITEM_COUNT = "WORK_ITEM_COUNT",
  ESTIMATE_POINT_COUNT = "ESTIMATE_POINT_COUNT",
  PENDING_WORK_ITEM_COUNT = "PENDING_WORK_ITEM_COUNT",
  COMPLETED_WORK_ITEM_COUNT = "COMPLETED_WORK_ITEM_COUNT",
  IN_PROGRESS_WORK_ITEM_COUNT = "IN_PROGRESS_WORK_ITEM_COUNT",
  WORK_ITEM_DUE_THIS_WEEK_COUNT = "WORK_ITEM_DUE_THIS_WEEK_COUNT",
  WORK_ITEM_DUE_TODAY_COUNT = "WORK_ITEM_DUE_TODAY_COUNT",
  BLOCKED_WORK_ITEM_COUNT = "BLOCKED_WORK_ITEM_COUNT",
  EPIC_WORK_ITEM_COUNT = "EPIC_WORK_ITEM_COUNT",
}

export type TAnalyticsTabsBase = "overview" | "work-items";
export type TAnalyticsGraphsBase = "projects" | "work-items" | "custom-work-items";
export interface AnalyticsTab {
  key: TAnalyticsTabsBase;
  label: string;
  content: React.FC;
  isDisabled: boolean;
}
export type TAnalyticsFilterParams = {
  project_ids?: string;
  cycle_id?: string;
  module_id?: string;
};

// service types

export interface IAnalyticsResponse {
  [key: string]: any;
}

export interface IAnalyticsResponseFields {
  count: number;
  filter_count: number;
}

// chart types

export interface IChartResponse {
  schema: Record<string, string>;
  data: TChartData<string, string>[];
}

// table types

export interface WorkItemInsightColumns {
  project_id?: string;
  project__name?: string;
  cancelled_work_items: number;
  completed_work_items: number;
  backlog_work_items: number;
  un_started_work_items: number;
  started_work_items: number;
  // in case of peek view, we will display the display_name instead of project__name
  display_name?: string;
  avatar_url?: string;
  assignee_id?: string;
}

export type AnalyticsTableDataMap = {
  "work-items": WorkItemInsightColumns;
};

export interface IAnalyticsParams {
  x_axis: ChartXAxisProperty;
  y_axis: ChartYAxisMetric;
  group_by?: ChartXAxisProperty;
}

export type TOperationalReportIssue = {
  id: string;
  name: string;
  project_id: string;
  project__identifier: string;
  project__name: string;
  sequence_id: number;
  priority: TIssuePriorities;
  state__name: string | null;
  state__group: TStateGroups | null;
  start_date: string | null;
  target_date: string | null;
  waiting_party: string | null;
  waiting_since: string | null;
  blocked_reason: string;
  next_action: string;
  updated_at: string;
};

export type TOperationalReportCategory =
  | "overdue"
  | "due_soon"
  | "unassigned"
  | "missing_due_date"
  | "blocked"
  | "waiting"
  | "awaiting_review"
  | "stale";

export type TOperationalReportResponse = {
  generated_at: string;
  counts: Record<TOperationalReportCategory | "active" | "urgent_overdue", number>;
  issues: Record<TOperationalReportCategory, TOperationalReportIssue[]>;
  in_progress_by_owner: {
    assignees__id: string;
    assignees__display_name: string;
    assignees__first_name: string;
    assignees__last_name: string;
    count: number;
  }[];
};
