/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane ui
import { useTranslation } from "@plane/i18n";
import { StateGroupIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TStateGroups } from "@plane/types";
// plane utils
import { cn } from "@plane/utils";
//hooks
import { useStates } from "@/hooks/store/use-state";
import { getStateDisplayName } from "@/lib/state-display";

type Props = {
  shouldShowBorder?: boolean;
} & (
  | {
      stateDetails: {
        name: string;
        group: TStateGroups;
      };
    }
  | {
      stateId: string;
    }
);

export const IssueBlockState = observer(function IssueBlockState(props: Props) {
  const { shouldShowBorder = true } = props;
  const { t } = useTranslation();
  // store hooks
  const { getStateById } = useStates();
  // derived values
  const state = "stateId" in props ? getStateById(props.stateId) : props.stateDetails;
  if (!state) return null;

  const displayName = getStateDisplayName(state, t);

  return (
    <Tooltip tooltipHeading={t("state")} tooltipContent={displayName}>
      <div
        className={cn("flex h-full w-full items-center justify-between gap-1 rounded-sm px-2.5 py-1 text-11", {
          "border-[0.5px] border-strong": shouldShowBorder,
        })}
      >
        <div className="flex w-full items-center gap-1.5">
          <StateGroupIcon stateGroup={state.group} />
          <div className="text-11">{displayName}</div>
        </div>
      </div>
    </Tooltip>
  );
});
