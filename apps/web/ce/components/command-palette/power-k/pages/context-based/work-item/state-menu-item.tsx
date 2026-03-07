/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane types
import { useTranslation } from "@plane/i18n";
import { StateGroupIcon } from "@plane/propel/icons";
import type { IState } from "@plane/types";
// components
import { PowerKModalCommandItem } from "@/components/power-k/ui/modal/command-item";
import { getStateDisplayName } from "@/lib/state-display";

export type TPowerKProjectStatesMenuItemsProps = {
  handleSelect: (stateId: string) => void;
  projectId: string | undefined;
  selectedStateId: string | undefined;
  states: IState[];
  workspaceSlug: string;
};

export const PowerKProjectStatesMenuItems = observer(function PowerKProjectStatesMenuItems(
  props: TPowerKProjectStatesMenuItemsProps
) {
  const { handleSelect, selectedStateId, states } = props;
  const { t } = useTranslation();

  return (
    <>
      {states.map((state) => (
        <PowerKModalCommandItem
          key={state.id}
          iconNode={<StateGroupIcon stateGroup={state.group} color={state.color} className="size-3.5 shrink-0" />}
          label={getStateDisplayName(state, t)}
          isSelected={state.id === selectedStateId}
          onSelect={() => handleSelect(state.id)}
        />
      ))}
    </>
  );
});
