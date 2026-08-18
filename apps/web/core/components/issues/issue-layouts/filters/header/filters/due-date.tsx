/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState } from "react";
import { observer } from "mobx-react";
// constants
import { DATE_AFTER_FILTER_OPTIONS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// components
import { DateFilterModal } from "@/components/core/filters/date-filter-modal";
import { FilterHeader, FilterOption } from "@/components/issues/issue-layouts/filters";

type Props = {
  appliedFilters: string[] | null;
  handleUpdate: (val: string | string[]) => void;
  searchQuery: string;
};

export const FilterDueDate = observer(function FilterDueDate(props: Props) {
  const { appliedFilters, handleUpdate, searchQuery } = props;
  const { t } = useTranslation();

  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [isDateFilterModalOpen, setIsDateFilterModalOpen] = useState(false);

  const appliedFiltersCount = appliedFilters?.length ?? 0;

  const getDateOptionLabel = (value: string) => {
    switch (value) {
      case "1_weeks;after;fromnow":
        return t("date_filters.one_week_from_now");
      case "2_weeks;after;fromnow":
        return t("date_filters.two_weeks_from_now");
      case "1_months;after;fromnow":
        return t("date_filters.one_month_from_now");
      case "2_months;after;fromnow":
        return t("date_filters.two_months_from_now");
      default:
        return value;
    }
  };

  const filteredOptions = DATE_AFTER_FILTER_OPTIONS.filter((option) =>
    getDateOptionLabel(option.value).toLocaleLowerCase().includes(searchQuery.toLocaleLowerCase())
  );

  const isCustomDateSelected = () => {
    const isCustomFateApplied = appliedFilters?.filter((f) => f.includes("-")) || [];
    return isCustomFateApplied.length > 0 ? true : false;
  };
  const handleCustomDate = () => {
    if (isCustomDateSelected()) {
      const updateAppliedFilters = appliedFilters?.filter((f) => f.includes("-")) || [];
      handleUpdate(updateAppliedFilters);
    } else setIsDateFilterModalOpen(true);
  };

  return (
    <>
      {isDateFilterModalOpen && (
        <DateFilterModal
          handleClose={() => setIsDateFilterModalOpen(false)}
          isOpen={isDateFilterModalOpen}
          onSelect={(val) => handleUpdate(val)}
          title={t("due_date")}
        />
      )}
      <FilterHeader
        title={`${t("due_date")}${appliedFiltersCount > 0 ? ` (${appliedFiltersCount})` : ""}`}
        isPreviewEnabled={previewEnabled}
        handleIsPreviewEnabled={() => setPreviewEnabled(!previewEnabled)}
      />
      {previewEnabled && (
        <div>
          {filteredOptions.length > 0 ? (
            <>
              {filteredOptions.map((option) => (
                <FilterOption
                  key={option.value}
                  isChecked={appliedFilters?.includes(option.value) ? true : false}
                  onClick={() => handleUpdate(option.value)}
                  title={getDateOptionLabel(option.value)}
                  multiple
                />
              ))}
              <FilterOption
                isChecked={isCustomDateSelected()}
                onClick={handleCustomDate}
                title={t("common.custom")}
                multiple
              />
            </>
          ) : (
            <p className="text-11 text-placeholder italic">{t("common.search.no_matches_found")}</p>
          )}
        </div>
      )}
    </>
  );
});
