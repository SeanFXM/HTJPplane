/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";

import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EditIcon, PlusIcon, TrashIcon } from "@plane/propel/icons";
import type { TWorkspaceAnnouncement, TWorkspaceAnnouncementEditableFields } from "@plane/types";
import { calculateTimeAgo } from "@plane/utils";
import { useUserPermissions } from "@/hooks/store/user/user-permissions";
import { WorkspaceService } from "@/services/workspace.service";
import { AnnouncementCreateUpdateModal } from "./create-update-announcement-modal";

const workspaceService = new WorkspaceService();

const CATEGORY_STYLES: Record<TWorkspaceAnnouncement["category"], string> = {
  important: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200",
  update: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200",
  fix: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
};

type TWorkspaceAnnouncementsProps = {
  workspaceSlug: string;
};

export const WorkspaceAnnouncements = observer(function WorkspaceAnnouncements(props: TWorkspaceAnnouncementsProps) {
  const { workspaceSlug } = props;
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<TWorkspaceAnnouncement | undefined>(undefined);

  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, workspaceSlug);

  const {
    data: announcements = [],
    mutate,
    isLoading,
  } = useSWR(
    workspaceSlug ? `HOME_ANNOUNCEMENTS_${workspaceSlug}` : null,
    workspaceSlug ? () => workspaceService.fetchWorkspaceAnnouncements(workspaceSlug) : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  const categoryLabelMap = useMemo(
    () => ({
      important: t("home.announcements.category.important"),
      update: t("home.announcements.category.update"),
      fix: t("home.announcements.category.fix"),
    }),
    [t]
  );

  const handleOpenCreateModal = useCallback(() => {
    setSelectedAnnouncement(undefined);
    setIsModalOpen(true);
  }, []);

  const handleEdit = useCallback((announcement: TWorkspaceAnnouncement) => {
    setSelectedAnnouncement(announcement);
    setIsModalOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (announcementId: string) => {
      if (!window.confirm(t("home.announcements.delete_confirm"))) return;

      await workspaceService.deleteWorkspaceAnnouncement(workspaceSlug, announcementId);
      await mutate();
    },
    [mutate, t, workspaceSlug]
  );

  const handleSubmit = useCallback(
    async (data: TWorkspaceAnnouncementEditableFields, announcementId?: string) => {
      if (announcementId) await workspaceService.updateWorkspaceAnnouncement(workspaceSlug, announcementId, data);
      else await workspaceService.createWorkspaceAnnouncement(workspaceSlug, data);

      await mutate();
    },
    [mutate, workspaceSlug]
  );

  if (!isWorkspaceAdmin && !isLoading && announcements.length === 0) return null;

  return (
    <>
      <AnnouncementCreateUpdateModal
        isOpen={isModalOpen}
        announcement={selectedAnnouncement}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
      />
      <div className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-14 font-semibold text-tertiary">{t("home.announcements.title")}</div>
            <p className="mt-1 text-12 text-secondary">{t("home.announcements.subtitle")}</p>
          </div>
          {isWorkspaceAdmin && (
            <button
              onClick={handleOpenCreateModal}
              className="my-auto flex gap-1 text-13 font-medium text-accent-primary"
            >
              <PlusIcon className="my-auto size-4" />
              <span>{t("home.announcements.add")}</span>
            </button>
          )}
        </div>

        {announcements.length === 0 ? (
          <div className="rounded-xl border border-dashed border-subtle p-4 text-13 text-secondary">
            {t("home.announcements.empty")}
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((announcement) => (
              <div key={announcement.id} className="rounded-xl border border-subtle bg-surface-1 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-11 font-medium ${CATEGORY_STYLES[announcement.category]}`}
                      >
                        {categoryLabelMap[announcement.category]}
                      </span>
                      <span className="text-11 text-tertiary">{calculateTimeAgo(announcement.created_at)}</span>
                    </div>
                    <div className="text-14 font-semibold text-primary">{announcement.title}</div>
                    <p className="mt-2 text-13 leading-6 whitespace-pre-wrap text-secondary">
                      {announcement.description}
                    </p>
                  </div>
                  {isWorkspaceAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(announcement)}
                        className="hover:bg-custom-background-80 rounded p-1.5 text-tertiary transition-colors hover:text-primary"
                        aria-label={t("edit")}
                      >
                        <EditIcon className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(announcement.id)}
                        className="hover:bg-custom-background-80 rounded p-1.5 text-tertiary transition-colors hover:text-danger-primary"
                        aria-label={t("delete")}
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
});
