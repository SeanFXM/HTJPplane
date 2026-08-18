/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import React from "react";
import { ToggleSwitch } from "./toggle-switch";

const meta: Meta<typeof ToggleSwitch> = {
  title: "Buttons/ToggleSwitch",
  component: ToggleSwitch,
  args: {
    onChange: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof ToggleSwitch>;

export const Accessible: Story = {
  args: {
    ariaLabel: "Email notifications",
    value: false,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("switch", { name: "Email notifications" });

    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await userEvent.click(toggle);
    await expect(args.onChange).toHaveBeenCalledWith(true);
  },
};

export const LabelledByVisibleText: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <ToggleSwitch {...args} ariaLabelledBy="release-notifications-label" />
      <span id="release-notifications-label">Release notifications</span>
    </div>
  ),
  args: {
    value: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("switch", { name: "Release notifications" })).toBeInTheDocument();
  },
};
