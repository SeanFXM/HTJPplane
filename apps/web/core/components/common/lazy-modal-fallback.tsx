/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { LogoSpinner } from "./logo-spinner";

type Props = {
  label?: string;
};

/** Immediate visual feedback while an on-demand modal bundle is loading. */
export function LazyModalFallback({ label = "Loading" }: Props) {
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-backdrop" role="status" aria-live="polite">
      <div className="rounded-lg bg-surface-1 p-5 shadow-raised-200">
        <LogoSpinner />
        <span className="sr-only">{label}</span>
      </div>
    </div>
  );
}
