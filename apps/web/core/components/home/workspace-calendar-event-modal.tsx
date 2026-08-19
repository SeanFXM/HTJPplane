/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Dialog } from "@headlessui/react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@plane/propel/button";
import type {
  TWorkspaceCalendarEvent,
  TWorkspaceCalendarEventCategory,
  TWorkspaceCalendarEventEditableFields,
} from "@plane/types";
import { Input, ModalCore, TextArea } from "@plane/ui";

export type TCalendarEventFormCopy = {
  createTitle: string;
  editTitle: string;
  title: string;
  titlePlaceholder: string;
  category: string;
  startDate: string;
  endDate: string;
  location: string;
  locationPlaceholder: string;
  description: string;
  descriptionPlaceholder: string;
  required: string;
  invalidRange: string;
  cancel: string;
  create: string;
  update: string;
  saveError: string;
  categoryLabels: Readonly<Record<TWorkspaceCalendarEventCategory, string>>;
};

type TCalendarEventFormValues = Omit<TWorkspaceCalendarEventEditableFields, "end_date"> & {
  end_date: string;
};

type TWorkspaceCalendarEventModalProps = {
  isOpen: boolean;
  event?: TWorkspaceCalendarEvent;
  defaultDate: string;
  copy: TCalendarEventFormCopy;
  onClose: () => void;
  onSubmit: (data: TWorkspaceCalendarEventEditableFields, eventId?: string) => Promise<void>;
};

const getDefaultValues = (defaultDate: string): TCalendarEventFormValues => ({
  title: "",
  description: "",
  category: "product_release",
  start_date: defaultDate,
  end_date: "",
  location: "",
});

const TITLE_ERROR_ID = "calendar-event-title-error";
const START_DATE_ERROR_ID = "calendar-event-start-error";
const END_DATE_ERROR_ID = "calendar-event-end-error";

const fieldFocusClassName =
  "focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none";

export function WorkspaceCalendarEventModal(props: TWorkspaceCalendarEventModalProps) {
  const { isOpen, event, defaultDate, copy, onClose, onSubmit } = props;
  const [submitError, setSubmitError] = useState("");
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TCalendarEventFormValues>({ defaultValues: getDefaultValues(defaultDate) });

  const startDate = watch("start_date");

  useEffect(() => {
    if (isOpen) {
      reset({
        ...getDefaultValues(defaultDate),
        ...event,
        end_date: event?.end_date ?? "",
      });
      setSubmitError("");
    }
  }, [defaultDate, event, isOpen, reset]);

  const handleFormSubmit = async (values: TCalendarEventFormValues) => {
    setSubmitError("");
    try {
      await onSubmit(
        {
          title: values.title.trim(),
          description: values.description.trim(),
          category: values.category,
          start_date: values.start_date,
          end_date: values.end_date || null,
          location: values.location.trim(),
        },
        event?.id
      );
      onClose();
    } catch {
      setSubmitError(copy.saveError);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose}>
      <form
        className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden"
        onSubmit={handleSubmit(handleFormSubmit)}
      >
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <Dialog.Title as="h3" className="text-18 font-medium text-primary">
            {event ? copy.editTitle : copy.createTitle}
          </Dialog.Title>

          <div>
            <label htmlFor="calendar-event-title" className="mb-1.5 block text-13 font-medium text-secondary">
              {copy.title} <span className="text-danger-primary">*</span>
            </label>
            <Controller
              control={control}
              name="title"
              rules={{ validate: (value) => Boolean(value.trim()) || copy.required }}
              render={({ field }) => (
                <Input
                  {...field}
                  id="calendar-event-title"
                  hasError={Boolean(errors.title)}
                  aria-describedby={errors.title ? TITLE_ERROR_ID : undefined}
                  aria-invalid={Boolean(errors.title)}
                  aria-required="true"
                  placeholder={copy.titlePlaceholder}
                  className={`w-full ${fieldFocusClassName}`}
                />
              )}
            />
            {errors.title && (
              <p id={TITLE_ERROR_ID} className="mt-1 text-11 text-danger-primary">
                {errors.title.message ?? copy.required}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="calendar-event-category" className="mb-1.5 block text-13 font-medium text-secondary">
              {copy.category}
            </label>
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <select
                  {...field}
                  id="calendar-event-category"
                  className={`h-11 w-full rounded-md border border-subtle bg-surface-1 px-3 text-14 text-primary ${fieldFocusClassName}`}
                >
                  {Object.entries(copy.categoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="calendar-event-start" className="mb-1.5 block text-13 font-medium text-secondary">
                {copy.startDate} <span className="text-danger-primary">*</span>
              </label>
              <Controller
                control={control}
                name="start_date"
                rules={{ required: copy.required }}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="calendar-event-start"
                    type="date"
                    hasError={Boolean(errors.start_date)}
                    aria-describedby={errors.start_date ? START_DATE_ERROR_ID : undefined}
                    aria-invalid={Boolean(errors.start_date)}
                    aria-required="true"
                    className={fieldFocusClassName}
                  />
                )}
              />
              {errors.start_date && (
                <p id={START_DATE_ERROR_ID} className="mt-1 text-11 text-danger-primary">
                  {errors.start_date.message ?? copy.required}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="calendar-event-end" className="mb-1.5 block text-13 font-medium text-secondary">
                {copy.endDate}
              </label>
              <Controller
                control={control}
                name="end_date"
                rules={{ validate: (value) => !value || !startDate || value >= startDate || copy.invalidRange }}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="calendar-event-end"
                    type="date"
                    min={startDate || undefined}
                    hasError={Boolean(errors.end_date)}
                    aria-describedby={errors.end_date ? END_DATE_ERROR_ID : undefined}
                    aria-invalid={Boolean(errors.end_date)}
                    className={fieldFocusClassName}
                  />
                )}
              />
              {errors.end_date && (
                <p id={END_DATE_ERROR_ID} className="mt-1 text-11 text-danger-primary">
                  {errors.end_date.message ?? copy.invalidRange}
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="calendar-event-location" className="mb-1.5 block text-13 font-medium text-secondary">
              {copy.location}
            </label>
            <Controller
              control={control}
              name="location"
              render={({ field }) => (
                <Input
                  {...field}
                  id="calendar-event-location"
                  placeholder={copy.locationPlaceholder}
                  className={`w-full ${fieldFocusClassName}`}
                />
              )}
            />
          </div>

          <div>
            <label htmlFor="calendar-event-description" className="mb-1.5 block text-13 font-medium text-secondary">
              {copy.description}
            </label>
            <Controller
              control={control}
              name="description"
              render={({ field }) => (
                <TextArea
                  {...field}
                  id="calendar-event-description"
                  placeholder={copy.descriptionPlaceholder}
                  className={`min-h-24 ${fieldFocusClassName}`}
                />
              )}
            />
          </div>

          {submitError && (
            <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-12 text-danger-primary">
              {submitError}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-subtle bg-surface-1 px-5 py-4">
          <Button variant="secondary" size="lg" type="button" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
            {event ? copy.update : copy.create}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
