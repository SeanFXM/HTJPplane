/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Hotone Japan runs this app as a compact internal operations hub. Keep the
 * underlying Plane capabilities intact, but expose only the product surface
 * that the team has chosen to support.
 */
import { EIssueLayoutTypes } from "@plane/types";

export const PRODUCT_UNAVAILABLE_NOTICE_PARAM = "htjp_unavailable";
export const PRODUCT_UNAVAILABLE_AREAS = [
  "cycles",
  "views",
  "intake",
  "modules",
  "billing",
  "estimates",
  "automations",
] as const;
export type TProductUnavailableArea = (typeof PRODUCT_UNAVAILABLE_AREAS)[number];

const productUnavailableAreas = new Set<string>(PRODUCT_UNAVAILABLE_AREAS);

const modulePilotProjectIds = new Set(
  (process.env.VITE_MODULE_PILOT_PROJECT_IDS ?? "")
    .split(",")
    .map((projectId) => projectId.trim())
    .filter(Boolean)
);

const ALWAYS_HIDDEN_PROJECT_FEATURES = new Set(["cycles", "views", "intake", "inbox", "estimates"]);
const ALWAYS_HIDDEN_PROJECT_SETTINGS = new Set([
  "features_cycles",
  "features_views",
  "features_intake",
  "estimates",
  "automations",
]);
const ALWAYS_HIDDEN_FAVORITE_ENTITY_TYPES = new Set(["cycle", "view"]);
const VISIBLE_ISSUE_LAYOUTS = new Set<EIssueLayoutTypes>([
  EIssueLayoutTypes.LIST,
  EIssueLayoutTypes.KANBAN,
  EIssueLayoutTypes.CALENDAR,
]);

export const isModulePilotProject = (projectId?: string | null): boolean =>
  Boolean(projectId && modulePilotProjectIds.has(projectId));

export const isProjectFeatureVisible = (featureKey: string, projectId?: string | null): boolean => {
  if (ALWAYS_HIDDEN_PROJECT_FEATURES.has(featureKey)) return false;
  if (featureKey === "modules") return isModulePilotProject(projectId);
  return true;
};

export const isProjectSettingsItemVisible = (settingsKey: string, projectId?: string | null): boolean => {
  if (ALWAYS_HIDDEN_PROJECT_SETTINGS.has(settingsKey)) return false;
  if (settingsKey === "features_modules") return isModulePilotProject(projectId);
  return true;
};

export const isFavoriteEntityVisible = (entityType: string, projectId?: string | null): boolean => {
  if (ALWAYS_HIDDEN_FAVORITE_ENTITY_TYPES.has(entityType)) return false;
  if (entityType === "module") return isModulePilotProject(projectId);
  return true;
};

export const getVisibleIssueLayout = (layout?: EIssueLayoutTypes): EIssueLayoutTypes =>
  layout && VISIBLE_ISSUE_LAYOUTS.has(layout) ? layout : EIssueLayoutTypes.LIST;

export const isProductUnavailableArea = (area?: string | null): area is TProductUnavailableArea =>
  Boolean(area && productUnavailableAreas.has(area));
