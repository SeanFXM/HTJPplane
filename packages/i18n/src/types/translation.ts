/**
 * Copyright (c) 2023-present the project authors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export interface ITranslation {
  [key: string]: string | ITranslation;
}

export interface ITranslations {
  [locale: string]: ITranslation;
}
