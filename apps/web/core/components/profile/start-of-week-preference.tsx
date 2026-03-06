/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { START_OF_THE_WEEK_OPTIONS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EStartOfTheWeek } from "@plane/types";
import { CustomSelect } from "@plane/ui";
// components
import { SettingsControlItem } from "@/components/settings/control-item";
// hooks
import { useUserProfile } from "@/hooks/store/user";

const DAY_KEYS: Record<EStartOfTheWeek, string> = {
  [EStartOfTheWeek.SUNDAY]: "start_of_week.sunday",
  [EStartOfTheWeek.MONDAY]: "start_of_week.monday",
  [EStartOfTheWeek.TUESDAY]: "start_of_week.tuesday",
  [EStartOfTheWeek.WEDNESDAY]: "start_of_week.wednesday",
  [EStartOfTheWeek.THURSDAY]: "start_of_week.thursday",
  [EStartOfTheWeek.FRIDAY]: "start_of_week.friday",
  [EStartOfTheWeek.SATURDAY]: "start_of_week.saturday",
};

export const StartOfWeekPreference = observer(function StartOfWeekPreference(props: {
  option: { title: string; description: string };
}) {
  const { t } = useTranslation();
  const { data: userProfile, updateUserProfile } = useUserProfile();

  const getStartOfWeekLabel = (startOfWeek: EStartOfTheWeek) => {
    const key = DAY_KEYS[startOfWeek as EStartOfTheWeek];
    return key ? t(key) : START_OF_THE_WEEK_OPTIONS.find((opt) => opt.value === startOfWeek)?.label ?? "";
  };

  const handleStartOfWeekChange = async (val: number) => {
    try {
      await updateUserProfile({ start_of_the_week: val });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success_exclamation"),
        message: t("first_day_of_week_updated_successfully"),
      });
    } catch (_error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("update_failed"),
        message: t("please_try_again_later"),
      });
    }
  };

  return (
    <SettingsControlItem
      title={props.option.title}
      description={props.option.description}
      control={
        <CustomSelect
          value={userProfile.start_of_the_week}
          label={getStartOfWeekLabel(userProfile.start_of_the_week)}
          onChange={handleStartOfWeekChange}
          buttonClassName="border border-subtle-1"
          input
          maxHeight="lg"
          placement="bottom-end"
        >
          <>
            {START_OF_THE_WEEK_OPTIONS.map((day) => (
              <CustomSelect.Option key={day.value} value={day.value}>
                {t(DAY_KEYS[day.value as EStartOfTheWeek])}
              </CustomSelect.Option>
            ))}
          </>
        </CustomSelect>
      }
    />
  );
});
