/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import AnalyticsWrapper from "../analytics-wrapper";
import { OperationalReport } from "./operational-report";

function Overview() {
  return (
    <AnalyticsWrapper i18nTitle="common.overview">
      <OperationalReport />
    </AnalyticsWrapper>
  );
}

export { Overview };
