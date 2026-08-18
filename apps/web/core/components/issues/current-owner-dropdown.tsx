/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentProps } from "react";
import { useTranslation } from "@plane/i18n";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";

export const CURRENT_OWNER_COPY = {
  en: "Current owner",
  ja: "現在の担当者",
  "zh-CN": "当前负责人",
} as const;

type Props = Omit<ComponentProps<typeof MemberDropdown>, "multiple" | "onChange" | "placeholder" | "value"> & {
  onChange: (value: string[]) => void;
  placeholder?: string;
  value?: string[] | null;
};

/**
 * Work items use a single current owner while retaining the array payload used
 * by Plane's APIs and stores. This wrapper keeps that invariant consistent in
 * every primary work-item editor.
 */
export function CurrentOwnerDropdown({ onChange, placeholder, value, ...props }: Props) {
  const { currentLocale } = useTranslation();
  const currentOwnerLabel =
    CURRENT_OWNER_COPY[currentLocale as keyof typeof CURRENT_OWNER_COPY] ?? CURRENT_OWNER_COPY.en;

  return (
    <MemberDropdown
      {...props}
      multiple={false}
      value={value?.[0] ?? null}
      onChange={(ownerId) => onChange(ownerId ? [ownerId] : [])}
      placeholder={placeholder ?? currentOwnerLabel}
      showUnassignedOption
      showUserDetails
    />
  );
}
