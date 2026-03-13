/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import type { TNotification } from "@plane/types";
import { renderFormattedDate, renderFormattedTime } from "@plane/utils";

type TAnnouncementPreviewProps = {
  notification: TNotification;
};

export function AnnouncementPreview(props: TAnnouncementPreviewProps) {
  const { notification } = props;
  const { t } = useTranslation();
  const announcement = notification.data?.announcement;

  if (!announcement) return null;

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-surface-1 p-6">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-full bg-layer-2 px-2.5 py-1 text-11 font-medium text-secondary">
          {announcement.category
            ? t(`home.announcements.category.${announcement.category}`)
            : t("home.announcements.title")}
        </span>
        <span className="text-11 text-tertiary">
          {notification.created_at
            ? `${renderFormattedDate(notification.created_at)} ${renderFormattedTime(notification.created_at)}`
            : ""}
        </span>
      </div>
      <h2 className="text-20 font-semibold text-primary">{announcement.title}</h2>
      <p className="mt-4 text-14 leading-7 whitespace-pre-wrap text-secondary">{announcement.description}</p>
    </div>
  );
}
