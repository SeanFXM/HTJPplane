/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { ContentWrapper } from "@plane/ui";

export const WorkspaceActiveCyclesUpgrade = observer(function WorkspaceActiveCyclesUpgrade() {
  return (
    <ContentWrapper>
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center gap-2 py-20 text-center">
        <h2 className="text-18 font-semibold text-primary">Active cycles are not enabled</h2>
        <p className="text-13 text-tertiary">
          Hotone Japan tracks operational work from Projects and My Work, without sprint-style cycle planning.
        </p>
      </div>
    </ContentWrapper>
  );
});
