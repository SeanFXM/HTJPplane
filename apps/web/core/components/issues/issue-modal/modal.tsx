/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense } from "react";
import { observer } from "mobx-react";
// plane imports
import type { EIssuesStoreType, TIssue } from "@plane/types";
// components
import { LazyModalFallback } from "@/components/common/lazy-modal-fallback";

const loadCreateUpdateIssueModal = () => import("./modal-content");

export const preloadCreateUpdateIssueModal = () => {
  // Intent preloading is speculative. Let the real modal load surface any
  // network error instead of creating an unhandled rejection on hover.
  void loadCreateUpdateIssueModal().catch(() => undefined);
};

const LazyCreateUpdateIssueModal = lazy(() =>
  loadCreateUpdateIssueModal().then((module) => ({
    default: module.CreateUpdateIssueModalContent,
  }))
);

export interface IssuesModalProps {
  data?: Partial<TIssue>;
  isOpen: boolean;
  onClose: () => void;
  beforeFormSubmit?: () => Promise<void>;
  onSubmit?: (res: TIssue) => Promise<void>;
  withDraftIssueWrapper?: boolean;
  storeType?: EIssuesStoreType;
  isDraft?: boolean;
  fetchIssueDetails?: boolean;
  moveToIssue?: boolean;
  modalTitle?: string;
  primaryButtonText?: {
    default: string;
    loading: string;
  };
  isProjectSelectionDisabled?: boolean;
  templateId?: string;
  allowedProjectIds?: string[];
  showActionItemsOnUpdate?: boolean;
}

export const CreateUpdateIssueModal = observer(function CreateUpdateIssueModal(props: IssuesModalProps) {
  if (!props.isOpen) return null;

  return (
    <Suspense fallback={<LazyModalFallback label="Loading work item editor" />}>
      <LazyCreateUpdateIssueModal {...props} />
    </Suspense>
  );
});
