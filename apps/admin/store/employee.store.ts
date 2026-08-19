/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
// plane imports
import { InstanceEmployeeService } from "@plane/services";
import type { ICreateInstanceEmployeePayload, IInstanceEmployee, IUpdateInstanceEmployeePayload } from "@plane/types";
// root store
import type { RootStore } from "@/store/root.store";

export interface IEmployeeStore {
  employeesByWorkspaceId: Record<string, IInstanceEmployee[] | undefined>;
  hydrate: (data: Record<string, IInstanceEmployee[]>) => void;
  getEmployeesByWorkspaceId: (workspaceId: string) => IInstanceEmployee[] | undefined;
  fetchEmployees: (workspaceId: string) => Promise<IInstanceEmployee[]>;
  createEmployee: (workspaceId: string, data: ICreateInstanceEmployeePayload) => Promise<IInstanceEmployee>;
  updateEmployee: (
    workspaceId: string,
    membershipId: string,
    data: IUpdateInstanceEmployeePayload
  ) => Promise<IInstanceEmployee>;
}

export class EmployeeStore implements IEmployeeStore {
  employeesByWorkspaceId: Record<string, IInstanceEmployee[] | undefined> = {};
  employeeService;

  constructor(_store: RootStore) {
    makeObservable(this, {
      employeesByWorkspaceId: observable,
      hydrate: action,
      fetchEmployees: action,
      createEmployee: action,
      updateEmployee: action,
    });

    this.employeeService = new InstanceEmployeeService();
  }

  hydrate = (data: Record<string, IInstanceEmployee[]>) => {
    if (data) this.employeesByWorkspaceId = data;
  };

  getEmployeesByWorkspaceId = (workspaceId: string) => this.employeesByWorkspaceId[workspaceId];

  fetchEmployees = async (workspaceId: string): Promise<IInstanceEmployee[]> => {
    try {
      const employees = await this.employeeService.list(workspaceId);
      runInAction(() => {
        this.employeesByWorkspaceId[workspaceId] = employees;
      });
      return employees;
    } catch (error) {
      console.error("Error fetching employee accounts", error);
      throw error;
    }
  };

  createEmployee = async (workspaceId: string, data: ICreateInstanceEmployeePayload): Promise<IInstanceEmployee> => {
    try {
      const employee = await this.employeeService.create(workspaceId, data);
      runInAction(() => {
        const currentEmployees = this.employeesByWorkspaceId[workspaceId] ?? [];
        this.employeesByWorkspaceId[workspaceId] = [
          employee,
          ...currentEmployees.filter((currentEmployee) => currentEmployee.id !== employee.id),
        ];
      });
      return employee;
    } catch (error) {
      console.error("Error creating employee account", error);
      throw error;
    }
  };

  updateEmployee = async (
    workspaceId: string,
    membershipId: string,
    data: IUpdateInstanceEmployeePayload
  ): Promise<IInstanceEmployee> => {
    try {
      const employee = await this.employeeService.update(workspaceId, membershipId, data);
      runInAction(() => {
        const currentEmployees = this.employeesByWorkspaceId[workspaceId] ?? [];
        this.employeesByWorkspaceId[workspaceId] = currentEmployees.map((currentEmployee) =>
          currentEmployee.id === employee.id ? employee : currentEmployee
        );
      });
      return employee;
    } catch (error) {
      console.error("Error updating employee account", error);
      throw error;
    }
  };
}
