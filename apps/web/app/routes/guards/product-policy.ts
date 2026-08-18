/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { redirect } from "react-router";
import type { TProductUnavailableArea } from "@/constants/product-policy";
import { PRODUCT_UNAVAILABLE_NOTICE_PARAM, isProjectFeatureVisible } from "@/constants/product-policy";

type TProductRouteParams = {
  workspaceSlug?: string;
  projectId?: string;
};

const getSupportedDestination = ({ workspaceSlug, projectId }: TProductRouteParams): string => {
  if (workspaceSlug && projectId) return `/${workspaceSlug}/projects/${projectId}/issues`;
  if (workspaceSlug) return `/${workspaceSlug}/projects`;
  return "/";
};

const throwProductUnavailableRedirect = (
  params: TProductRouteParams,
  unavailableArea: TProductUnavailableArea,
  destination = getSupportedDestination(params)
): never => {
  const searchParams = new URLSearchParams({ [PRODUCT_UNAVAILABLE_NOTICE_PARAM]: unavailableArea });
  throw redirect(`${destination}?${searchParams.toString()}`);
};

export const guardProjectFeatureRoute = (
  params: TProductRouteParams,
  feature: "cycles" | "views" | "intake" | "modules"
): null => {
  if (isProjectFeatureVisible(feature, params.projectId)) return null;
  return throwProductUnavailableRedirect(params, feature);
};

export const redirectUnavailableProductArea = (
  params: TProductRouteParams,
  unavailableArea: TProductUnavailableArea,
  destination?: string
): never => throwProductUnavailableRedirect(params, unavailableArea, destination);
