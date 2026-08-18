/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cn } from "@plane/utils";

export function IssueEmbedUpgradeCard(props: any) {
  return (
    <div
      className={cn("flex w-full rounded-md border border-subtle bg-layer-1 px-4 py-3", {
        "border-strong": props.selected,
      })}
    >
      <p className="!text-13 text-secondary">
        Work item embeds are not enabled in this internal workspace. Paste the work item link into the page instead.
      </p>
    </div>
  );
}
