/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// store
import { CoreRootStore } from "@/store/root.store";
import type { ITimelineStore } from "./timeline";
import { TimeLineStore } from "./timeline";

export class RootStore extends CoreRootStore {
  private _timelineStore?: ITimelineStore;

  get timelineStore(): ITimelineStore {
    return (this._timelineStore ??= new TimeLineStore(this));
  }

  override resetOnSignOut() {
    this._timelineStore?.dispose();
    this._timelineStore = undefined;
    super.resetOnSignOut();
  }
}
