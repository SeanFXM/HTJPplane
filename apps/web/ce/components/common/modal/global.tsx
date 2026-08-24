/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense } from "react";
import { observer } from "mobx-react";
// components
import { LazyModalFallback } from "@/components/common/lazy-modal-fallback";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";

const ProfileSettingsModal = lazy(() =>
  import("@/components/settings/profile/modal").then((module) => ({
    default: module.ProfileSettingsModal,
  }))
);

type TGlobalModalsProps = {
  workspaceSlug: string;
};

/**
 * GlobalModals component manages all workspace-level modals across Plane applications.
 *
 * This includes:
 * - Profile settings modal
 */
export const GlobalModals = observer(function GlobalModals(_props: TGlobalModalsProps) {
  const { profileSettingsModal } = useCommandPalette();
  const shouldRenderProfileSettings = profileSettingsModal.isOpen || profileSettingsModal.activeTab !== null;

  if (!shouldRenderProfileSettings) return null;

  return (
    <Suspense fallback={<LazyModalFallback label="Loading profile settings" />}>
      <ProfileSettingsModal />
    </Suspense>
  );
});
