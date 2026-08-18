/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export function LogoSpinner() {
  return (
    <div className="flex items-center gap-3" role="status" aria-label="Loading Hotone Japan Admin">
      <span className="relative grid size-9 place-items-center rounded-md bg-accent-primary text-12 font-semibold text-on-color">
        HJ
        <span className="absolute -inset-1 animate-pulse rounded-lg border border-accent-subtle" aria-hidden="true" />
      </span>
      <span className="text-13 font-medium text-secondary">Loading internal admin…</span>
    </div>
  );
}
