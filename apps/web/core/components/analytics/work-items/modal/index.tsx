/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense, useEffect, useState } from "react";
import type { ICycle, IModule, IProject } from "@plane/types";
// components
import { LazyModalFallback } from "@/components/common/lazy-modal-fallback";

export type TWorkItemsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  projectDetails?: IProject | undefined;
  cycleDetails?: ICycle | undefined;
  moduleDetails?: IModule | undefined;
  isEpic?: boolean;
};

const LazyWorkItemsModal = lazy(() =>
  import("./root").then((module) => ({
    default: module.WorkItemsModalContent,
  }))
);

export function WorkItemsModal(props: TWorkItemsModalProps) {
  const [hasOpened, setHasOpened] = useState(props.isOpen);

  useEffect(() => {
    if (props.isOpen) setHasOpened(true);
  }, [props.isOpen]);

  if (!props.isOpen && !hasOpened) return null;

  return (
    <Suspense fallback={<LazyModalFallback label="Loading work item analysis" />}>
      <LazyWorkItemsModal {...props} />
    </Suspense>
  );
}
