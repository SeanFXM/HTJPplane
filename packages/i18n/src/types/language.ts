/**
 * Copyright (c) 2023-present the project authors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TLanguage =
  | "en"
  | "fr"
  | "es"
  | "ja"
  | "zh-CN"
  | "ru"
  | "it"
  | "cs"
  | "sk"
  | "de"
  | "ua"
  | "pl"
  | "ko"
  | "pt-BR"
  | "id"
  | "ro"
  | "vi-VN"
  | "tr-TR";

export interface ILanguageOption {
  label: string;
  value: TLanguage;
}
