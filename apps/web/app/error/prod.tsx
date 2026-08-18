/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTheme } from "next-themes";
// plane imports
import { Button } from "@plane/propel/button";
// assets
import maintenanceModeDarkModeImage from "@/app/assets/instance/maintenance-mode-dark.svg?url";
import maintenanceModeLightModeImage from "@/app/assets/instance/maintenance-mode-light.svg?url";
// layouts
import DefaultLayout from "@/layouts/default-layout";

// Production Error Component
interface ProdErrorComponentProps {
  errorReference: string;
  onGoHome: () => void;
  onReload: () => void;
}

export function ProdErrorComponent({ errorReference, onGoHome, onReload }: ProdErrorComponentProps) {
  // hooks
  const { resolvedTheme } = useTheme();

  // derived values
  const maintenanceModeImage = resolvedTheme === "dark" ? maintenanceModeDarkModeImage : maintenanceModeLightModeImage;

  return (
    <DefaultLayout>
      <div className="relative container mx-auto flex h-full w-full max-w-xl flex-col items-center justify-center gap-2 gap-y-6 bg-surface-1 px-6 text-center">
        <div className="relative w-full">
          <img
            src={maintenanceModeImage}
            height="176"
            width="288"
            alt="ProjectSettingImg"
            className="h-full w-full object-fill object-center"
          />
        </div>
        <div className="relative mt-4 flex w-full flex-col gap-4">
          <div className="flex flex-col gap-2.5">
            <h1 className="text-left text-18 font-semibold text-primary">&#x1F6A7; Looks like something went wrong!</h1>
            <span className="text-left text-14 font-medium text-secondary">
              The page couldn’t finish loading. Try it again, or return to the workspace home. If the problem continues,
              share the error reference with the internal support team.
            </span>
            <p className="text-left font-code text-12 text-tertiary">Error reference: {errorReference}</p>
          </div>

          <div className="flex items-center justify-start gap-3">
            <Button variant="primary" size="lg" onClick={onReload}>
              Try again
            </Button>
            <Button variant="secondary" size="lg" onClick={onGoHome}>
              Return home
            </Button>
          </div>
        </div>
      </div>
    </DefaultLayout>
  );
}
