/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Controller, useForm } from "react-hook-form";
import { Info } from "lucide-react";
import {
  EUserPermissions,
  EUserPermissionsLevel,
  EXPORTERS_LIST,
  ISSUE_DISPLAY_FILTERS_BY_PAGE,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { IIssueFilters, TWorkItemFilterExpression } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { CustomSearchSelect, CustomSelect } from "@plane/ui";
import { WorkspaceLevelWorkItemFiltersHOC } from "@/components/work-item-filters/filters-hoc/workspace-level";
import { WorkItemFiltersRow } from "@/components/work-item-filters/filters-row";
import { useProject } from "@/hooks/store/use-project";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { ProjectExportService } from "@/services/project/project-export.service";
// local imports
import { SettingsBoxedControlItem } from "../settings/boxed-control-item";

type Props = {
  workspaceSlug: string;
  mutateServices: () => void;
};
type FormData = {
  provider: (typeof EXPORTERS_LIST)[0];
  project: string[];
  multiple: boolean;
  filters: TWorkItemFilterExpression;
};

const initialWorkItemFilters: IIssueFilters = {
  richFilters: {},
  displayFilters: undefined,
  displayProperties: undefined,
  kanbanFilters: undefined,
};

const projectExportService = new ProjectExportService();

function getExportErrorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;

  const errorData = error as Record<string, unknown>;
  if (typeof errorData.error === "string") return errorData.error;
  if (typeof errorData.message === "string") return errorData.message;

  return undefined;
}

export const ExportForm = observer(function ExportForm(props: Props) {
  // props
  const { workspaceSlug, mutateServices } = props;
  // states
  const [exportLoading, setExportLoading] = useState(false);

  // store hooks
  const { allowPermissions } = useUserPermissions();
  const { data: user } = useUser();
  const { workspaceProjectIds, getProjectById } = useProject();
  const { t } = useTranslation();
  // form
  const { handleSubmit, control } = useForm<FormData>({
    defaultValues: {
      provider: EXPORTERS_LIST[0],
      project: [],
      multiple: false,
      filters: {},
    },
  });

  // derived values
  const hasProjects = workspaceProjectIds && workspaceProjectIds.length > 0;
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const options = workspaceProjectIds?.flatMap((projectId) => {
    const projectDetails = getProjectById(projectId);
    if (!projectDetails) return [];

    return [
      {
        value: projectDetails.id,
        query: `${projectDetails.name} ${projectDetails.identifier}`,
        content: (
          <div className="flex items-center gap-2">
            <span className="flex-shrink-0 text-10 text-secondary">{projectDetails.identifier}</span>
            <span className="truncate">{projectDetails.name}</span>
          </div>
        ),
      },
    ];
  });

  // handlers
  async function ExportCSVToMail(formData: FormData) {
    setExportLoading(true);
    if (workspaceSlug && user) {
      const payload = {
        provider: formData.provider.provider,
        project: formData.project,
        multiple: formData.project.length > 1,
        rich_filters: formData.filters,
      };
      try {
        await projectExportService.csvExport(workspaceSlug, payload);
        mutateServices();
        setExportLoading(false);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("workspace_settings.settings.exports.modal.toasts.success.title"),
          message: t("workspace_settings.settings.exports.modal.toasts.success.message", {
            entity:
              formData.provider.provider === "csv"
                ? "CSV"
                : formData.provider.provider === "xlsx"
                  ? "Excel"
                  : formData.provider.provider === "json"
                    ? "JSON"
                    : "",
          }),
        });
      } catch (error) {
        setExportLoading(false);
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: getExportErrorMessage(error) ?? t("workspace_settings.settings.exports.modal.toasts.error.message"),
        });
      }
    } else {
      setExportLoading(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(ExportCSVToMail)(e);
      }}
      className="flex flex-col gap-5"
    >
      <div className="rounded-lg border border-subtle bg-layer-2">
        {/* Project Selector */}
        <SettingsBoxedControlItem
          className="rounded-none border-0 border-b"
          title={t("workspace_settings.settings.exports.exporting_projects")}
          control={
            <Controller
              control={control}
              name="project"
              disabled={!isAdmin || !hasProjects}
              render={({ field: { value, onChange } }) => (
                <CustomSearchSelect
                  value={value ?? []}
                  onChange={(val: string[]) => onChange(val)}
                  options={options}
                  input
                  label={
                    value && value.length > 0
                      ? value
                          .map((projectId) => {
                            const projectDetails = getProjectById(projectId);

                            return projectDetails?.identifier;
                          })
                          .join(", ")
                      : t("workspace_analytics.all_projects")
                  }
                  optionsClassName="max-w-48 sm:max-w-[532px]"
                  placement="bottom-end"
                  multiple
                />
              )}
            />
          }
        />
        {/* Format Selector */}
        <SettingsBoxedControlItem
          className="rounded-none border-0 border-b"
          title={t("workspace_settings.settings.exports.format")}
          control={
            <Controller
              control={control}
              name="provider"
              disabled={!isAdmin || !hasProjects}
              render={({ field: { value, onChange } }) => (
                <CustomSelect
                  value={value}
                  onChange={onChange}
                  label={t(value.i18n_title)}
                  optionsClassName="max-w-48 sm:max-w-[532px]"
                  placement="bottom-end"
                  buttonClassName="py-2 text-13"
                >
                  {EXPORTERS_LIST.map((service) => (
                    <CustomSelect.Option key={service.provider} className="flex items-center gap-2" value={service}>
                      <span className="truncate">{t(service.i18n_title)}</span>
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              )}
            />
          }
        />
        <div className="px-4 py-3">
          <Button variant="primary" size="lg" type="submit" loading={exportLoading} disabled={!isAdmin || !hasProjects}>
            {exportLoading ? `${t("workspace_settings.settings.exports.exporting")}...` : t("export")}
          </Button>
        </div>
      </div>
      {/* Rich Filters */}
      <div className="w-full">
        <div className="mb-2 flex items-center gap-2">
          <div className="text-13 leading-tight font-medium text-secondary">{t("common.filters")}</div>
          <Tooltip
            tooltipContent={
              <div className="flex max-w-[238px] gap-2">
                <div className="flex aspect-square h-5 items-center justify-center rounded-sm bg-layer-1 p-1">
                  <Info className="h-3 w-3" />
                </div>
                {t("workspace_settings.settings.exports.filters_info")}
              </div>
            }
            position="top"
          >
            <button type="button" className="flex items-center justify-center">
              <Info className="h-3 w-3 text-tertiary" />
            </button>
          </Tooltip>
        </div>
        <Controller
          control={control}
          name="filters"
          render={({ field: { onChange } }) => (
            <WorkspaceLevelWorkItemFiltersHOC
              entityId={workspaceSlug}
              entityType={EIssuesStoreType.GLOBAL}
              filtersToShowByLayout={ISSUE_DISPLAY_FILTERS_BY_PAGE.my_issues.filters}
              initialWorkItemFilters={initialWorkItemFilters}
              isTemporary
              updateFilters={(updatedFilters) => onChange(updatedFilters)}
              showOnMount
              workspaceSlug={workspaceSlug}
            >
              {({ filter: workspaceExportWorkItemsFilter }) =>
                workspaceExportWorkItemsFilter && (
                  <WorkItemFiltersRow filter={workspaceExportWorkItemsFilter} variant="modal" />
                )
              }
            </WorkspaceLevelWorkItemFiltersHOC>
          )}
        />
      </div>
    </form>
  );
});
