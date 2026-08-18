/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

type TErrorRecord = Record<string, unknown>;

const ERROR_MESSAGE_KEYS = ["error", "message", "detail", "error_message"] as const;
const MACHINE_ERROR_CODE = /^[A-Z][A-Z0-9_]+$/;

const isErrorRecord = (value: unknown): value is TErrorRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getReadableMessage = (value: unknown, visited = new Set<unknown>()): string | undefined => {
  if (typeof value === "string") {
    const message = value.trim();
    return message && !MACHINE_ERROR_CODE.test(message) ? message : undefined;
  }

  if (value === null || value === undefined || visited.has(value)) return undefined;
  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = getReadableMessage(item, visited);
      if (message) return message;
    }
    return undefined;
  }

  if (!isErrorRecord(value)) return undefined;

  for (const key of ERROR_MESSAGE_KEYS) {
    const message = getReadableMessage(value[key], visited);
    if (message) return message;
  }

  for (const nestedValue of Object.values(value)) {
    const message = getReadableMessage(nestedValue, visited);
    if (message) return message;
  }

  return undefined;
};

/**
 * Services usually throw the API response body directly, while a few callers
 * still pass through an Axios-style error. Prefer a concrete API message and
 * fall back to translated UI copy when the payload only contains an error code.
 */
export const getIssueActionErrorMessage = (error: unknown, fallback: string): string => {
  if (isErrorRecord(error) && isErrorRecord(error.response) && "data" in error.response) {
    return getReadableMessage(error.response.data) ?? getReadableMessage(error) ?? fallback;
  }

  return getReadableMessage(error) ?? fallback;
};
