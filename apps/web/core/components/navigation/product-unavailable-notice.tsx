/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProductUnavailableArea } from "@/constants/product-policy";
import { PRODUCT_UNAVAILABLE_NOTICE_PARAM, isProductUnavailableArea } from "@/constants/product-policy";

const NOTICE_COPY: Record<TProductUnavailableArea, { title: string; message: string }> = {
  cycles: {
    title: "Cycles are not available",
    message: "Hotone uses Work items directly, so this Cycle link was redirected.",
  },
  views: {
    title: "Saved Views are not available",
    message: "Use filters and layouts on the Work items page instead.",
  },
  intake: {
    title: "Intake is not available",
    message: "Create and manage requests directly from Work items.",
  },
  modules: {
    title: "Modules are not available here",
    message: "Modules are limited to approved pilot projects.",
  },
  billing: {
    title: "Billing is not available",
    message: "Plan and billing management are not used in this internal deployment.",
  },
  estimates: {
    title: "Estimates are not available",
    message: "Hotone uses lightweight work item tracking without estimates.",
  },
  automations: {
    title: "Automations are not available",
    message: "Automations are not part of this internal workflow.",
  },
};

export function ProductUnavailableNotice() {
  const [searchParams, setSearchParams] = useSearchParams();
  const unavailableArea = searchParams.get(PRODUCT_UNAVAILABLE_NOTICE_PARAM);
  const handledAreaRef = useRef<TProductUnavailableArea | null>(null);

  useEffect(() => {
    if (!isProductUnavailableArea(unavailableArea)) {
      handledAreaRef.current = null;
      return;
    }
    if (handledAreaRef.current === unavailableArea) return;
    handledAreaRef.current = unavailableArea;

    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.delete(PRODUCT_UNAVAILABLE_NOTICE_PARAM);
    setSearchParams(nextSearchParams, { replace: true });

    setToast({
      id: `product-unavailable-${unavailableArea}`,
      type: TOAST_TYPE.INFO,
      ...NOTICE_COPY[unavailableArea],
    });
  }, [searchParams, setSearchParams, unavailableArea]);

  return null;
}
