/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cn } from "@plane/utils";

type Props = {
  className?: string;
};

export function BulkOperationsUpgradeBanner(props: Props) {
  const { className } = props;

  return (
    <div className={cn("sticky bottom-0 left-0 z-[2] grid h-20 place-items-center px-3.5", className)}>
      <div className="flex min-h-14 w-full items-center rounded-md border border-subtle bg-layer-1 px-3.5 py-4">
        <p className="text-13 font-medium text-secondary">
          Bulk editing is not enabled in this internal workspace. Update the selected work items individually.
        </p>
      </div>
    </div>
  );
}
