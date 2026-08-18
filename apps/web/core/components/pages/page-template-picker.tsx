/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useId } from "react";
import type { TLanguage } from "@plane/i18n";
import { cn } from "@plane/utils";
import { getPageTemplateCopy, getPageTemplates } from "./page-template-data";
import type { TPageTemplateId } from "./page-template-data";

type Props = {
  activeTemplateId?: TPageTemplateId;
  className?: string;
  disabled?: boolean;
  locale: TLanguage;
  onSelect: (templateId: TPageTemplateId) => void;
  selectedTemplateId?: TPageTemplateId;
  showBlank?: boolean;
};

export function PageTemplatePicker(props: Props) {
  const {
    activeTemplateId,
    className,
    disabled = false,
    locale,
    onSelect,
    selectedTemplateId,
    showBlank = true,
  } = props;
  const headingId = useId();
  const copy = getPageTemplateCopy(locale);
  const templates = getPageTemplates(locale).filter(({ id }) => showBlank || id !== "blank");

  return (
    <section className={cn("w-full", className)} aria-labelledby={headingId}>
      <div className="mb-3">
        <h4 id={headingId} className="text-13 font-semibold text-primary">
          {copy.heading}
        </h4>
        <p className="mt-1 text-11 text-secondary">{copy.description}</p>
      </div>
      <div className={cn("grid gap-2", showBlank ? "grid-cols-4" : "grid-cols-3")}>
        {templates.map((template) => {
          const isSelected = selectedTemplateId === template.id;
          const isCreating = activeTemplateId === template.id;

          return (
            <button
              key={template.id}
              type="button"
              aria-pressed={isSelected}
              className={cn(
                "focus-visible:outline-accent-primary min-h-24 rounded-lg border border-subtle bg-surface-1 p-3 text-left transition-colors hover:border-accent-strong hover:bg-layer-1 focus-visible:outline-2 focus-visible:outline-offset-2",
                isSelected && "border-accent-strong bg-accent-primary/5",
                (disabled || Boolean(activeTemplateId)) && "cursor-not-allowed opacity-60"
              )}
              disabled={disabled || Boolean(activeTemplateId)}
              onClick={() => onSelect(template.id)}
            >
              <span className="block text-18" aria-hidden="true">
                {template.emoji}
              </span>
              <span className="mt-2 block text-12 font-semibold text-primary">
                {isCreating ? copy.creating : template.name}
              </span>
              <span className="mt-1 line-clamp-2 block text-11 leading-4 text-secondary">{template.summary}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
