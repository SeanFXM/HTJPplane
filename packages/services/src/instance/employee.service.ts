/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { ICreateInstanceEmployeePayload, IInstanceEmployee, IUpdateInstanceEmployeePayload } from "@plane/types";
import { APIService } from "../api.service";

export class InstanceEmployeeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceId: string): Promise<IInstanceEmployee[]> {
    return this.get(`/api/instances/workspaces/${encodeURIComponent(workspaceId)}/employees/`)
      .then((response) => response.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceId: string, data: ICreateInstanceEmployeePayload): Promise<IInstanceEmployee> {
    return this.post(`/api/instances/workspaces/${encodeURIComponent(workspaceId)}/employees/`, data)
      .then((response) => response.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceId: string,
    membershipId: string,
    data: IUpdateInstanceEmployeePayload
  ): Promise<IInstanceEmployee> {
    return this.patch(
      `/api/instances/workspaces/${encodeURIComponent(workspaceId)}/employees/${encodeURIComponent(membershipId)}/`,
      data
    )
      .then((response) => response.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
