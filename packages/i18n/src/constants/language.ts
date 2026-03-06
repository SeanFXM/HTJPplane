/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLanguage, ILanguageOption } from "../types";

export const FALLBACK_LANGUAGE: TLanguage = "en";

/** 新用户默认语言（无保存偏好时使用） */
export const DEFAULT_LANGUAGE: TLanguage = "ja";

export const SUPPORTED_LANGUAGES: ILanguageOption[] = [
  { label: "日本語", value: "ja" },
  { label: "简体中文", value: "zh-CN" },
  { label: "English", value: "en" },
];

/**
 * Enum for translation file names
 * These are the JSON files that contain translations each category
 */
export enum ETranslationFiles {
  TRANSLATIONS = "translations",
  ACCESSIBILITY = "accessibility",
  EDITOR = "editor",
  EMPTY_STATE = "empty-state",
}

export const LANGUAGE_STORAGE_KEY = "userLanguage";
