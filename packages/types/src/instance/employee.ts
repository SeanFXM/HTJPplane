/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { EUserWorkspaceRoles } from "../workspace";

export type TInstanceEmployeeRole = EUserWorkspaceRoles.MEMBER | EUserWorkspaceRoles.ADMIN;

export interface IInstanceEmployee {
  id: string;
  display_name: string;
  email: string;
  role: TInstanceEmployeeRole;
  is_active: boolean;
  created_at: string;
}

export interface ICreateInstanceEmployeePayload {
  display_name: string;
  email: string;
  initial_password: string;
  role: TInstanceEmployeeRole;
}

export type IUpdateInstanceEmployeePayload =
  | { role: TInstanceEmployeeRole; is_active?: never }
  | { role?: never; is_active: boolean };
