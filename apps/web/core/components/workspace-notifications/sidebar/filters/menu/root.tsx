/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { ListFilter } from "lucide-react";
// plane imports
import type { ENotificationFilterType } from "@plane/constants";
import { FILTER_TYPE_OPTIONS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { getIconButtonStyling } from "@plane/propel/icon-button";
import { Tooltip } from "@plane/propel/tooltip";
import { PopoverMenu } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";
// local imports
import { NotificationFilterOptionItem } from "./menu-option-item";

export const NotificationFilter = observer(function NotificationFilter() {
  // hooks
  const { isMobile } = usePlatformOS();
  const { t } = useTranslation();

  const translatedFilterTypeOptions = FILTER_TYPE_OPTIONS.map((filter) => ({
    label: t(filter.i18n_label),
    value: filter.value,
  }));

  return (
    <PopoverMenu
      data={translatedFilterTypeOptions}
      buttonClassName={cn(getIconButtonStyling("ghost", "base"), "size-11 md:size-6")}
      button={
        <Tooltip tooltipContent={t("notification.options.filters")} isMobile={isMobile} position="bottom">
          <span className="flex size-full items-center justify-center">
            <ListFilter className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("notification.options.filters")}</span>
          </span>
        </Tooltip>
      }
      keyExtractor={(item: { label: string; value: ENotificationFilterType }) => item.value}
      render={(item) => <NotificationFilterOptionItem {...item} />}
    />
  );
});
