/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** Creates a stable support reference without exposing the original error details. */
export function createErrorReference(error: unknown, prefix: string): string {
  let fingerprint = "unknown-error";

  if (error instanceof Error) {
    fingerprint = `${error.name}:${error.message}:${error.stack ?? ""}`;
  } else if (typeof error === "object" && error !== null) {
    try {
      fingerprint = JSON.stringify(error);
    } catch {
      fingerprint = Object.prototype.toString.call(error);
    }
  } else if (error !== undefined) {
    fingerprint = String(error);
  }

  let hash = 0x811c9dc5;
  for (let index = 0; index < fingerprint.length; index += 1) {
    hash ^= fingerprint.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `${prefix}-${(hash >>> 0).toString(36).toUpperCase().padStart(7, "0")}`;
}
