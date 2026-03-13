/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";

import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TWorkspaceAnnouncement, TWorkspaceAnnouncementEditableFields } from "@plane/types";
import { Input, ModalCore, TextArea } from "@plane/ui";

export type TAnnouncementCreateUpdateModalProps = {
  isOpen: boolean;
  announcement?: TWorkspaceAnnouncement;
  onClose: () => void;
  onSubmit: (data: TWorkspaceAnnouncementEditableFields, announcementId?: string) => Promise<void>;
};

type TAnnouncementFormValues = TWorkspaceAnnouncementEditableFields & {
  id?: string;
};

const defaultValues: TAnnouncementFormValues = {
  title: "",
  description: "",
  category: "important",
};

export function AnnouncementCreateUpdateModal(props: TAnnouncementCreateUpdateModalProps) {
  const { isOpen, announcement, onClose, onSubmit } = props;
  const { t } = useTranslation();
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TAnnouncementFormValues>({ defaultValues });

  useEffect(() => {
    if (isOpen) reset({ ...defaultValues, ...announcement });
    return () => reset(defaultValues);
  }, [announcement, isOpen, reset]);

  const handleFormSubmit = async (data: TAnnouncementFormValues) => {
    await onSubmit(
      {
        title: data.title.trim(),
        description: data.description.trim(),
        category: data.category,
      },
      data.id
    );
    onClose();
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose}>
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <div className="space-y-5 p-5">
          <h3 className="text-18 font-medium text-secondary">
            {announcement?.id ? t("update") : t("add")} {t("home.announcements.title")}
          </h3>
          <div className="space-y-3">
            <div>
              <label htmlFor="announcement-title" className="mb-2 text-14 font-medium text-secondary">
                {t("home.announcements.form.title")}
                <span className="block text-10">{t("required")}</span>
              </label>
              <Controller
                control={control}
                name="title"
                rules={{
                  required: t("home.announcements.form.title_required"),
                }}
                render={({ field: { value, onChange, ref } }) => (
                  <Input
                    id="announcement-title"
                    type="text"
                    value={value}
                    onChange={onChange}
                    ref={ref}
                    hasError={Boolean(errors.title)}
                    placeholder={t("home.announcements.form.title_placeholder")}
                    className="w-full"
                  />
                )}
              />
              {errors.title && (
                <span className="text-11 text-danger-primary">{t("home.announcements.form.title_required")}</span>
              )}
            </div>
            <div>
              <label htmlFor="announcement-category" className="mb-2 text-14 font-medium text-secondary">
                {t("home.announcements.form.category")}
                <span className="block text-10">{t("required")}</span>
              </label>
              <Controller
                control={control}
                name="category"
                render={({ field: { value, onChange, ref } }) => (
                  <select
                    id="announcement-category"
                    value={value}
                    onChange={onChange}
                    ref={ref}
                    className="h-11 w-full rounded-md border border-subtle bg-surface-1 px-3 py-2 text-14 text-primary outline-none"
                  >
                    <option value="important">{t("home.announcements.category.important")}</option>
                    <option value="update">{t("home.announcements.category.update")}</option>
                    <option value="fix">{t("home.announcements.category.fix")}</option>
                  </select>
                )}
              />
            </div>
            <div>
              <label htmlFor="announcement-description" className="mb-2 text-14 font-medium text-secondary">
                {t("home.announcements.form.description")}
                <span className="block text-10">{t("required")}</span>
              </label>
              <Controller
                control={control}
                name="description"
                rules={{
                  required: t("home.announcements.form.description_required"),
                }}
                render={({ field: { value, onChange, ref } }) => (
                  <TextArea
                    id="announcement-description"
                    value={value}
                    onChange={onChange}
                    ref={ref}
                    hasError={Boolean(errors.description)}
                    placeholder={t("home.announcements.form.description_placeholder")}
                    className="min-h-[120px]"
                  />
                )}
              />
              {errors.description && (
                <span className="text-11 text-danger-primary">{t("home.announcements.form.description_required")}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
          <Button variant="secondary" size="lg" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
            {announcement?.id ? (isSubmitting ? t("updating") : t("update")) : isSubmitting ? t("adding") : t("add")}{" "}
            {t("home.announcements.title")}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
