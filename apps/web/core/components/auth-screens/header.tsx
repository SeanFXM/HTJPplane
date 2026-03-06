/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { PageHead } from "@/components/core/page-title";
import { EAuthModes } from "@/helpers/authentication.helper";

const authContentMap = {
  [EAuthModes.SIGN_IN]: { pageTitle: "sign_in" },
  [EAuthModes.SIGN_UP]: { pageTitle: "sign_up" },
};

type AuthHeaderProps = {
  type: EAuthModes;
};

export const AuthHeader = observer(function AuthHeader({ type }: AuthHeaderProps) {
  const { t } = useTranslation();
  return <AuthHeaderBase pageTitle={t(authContentMap[type].pageTitle)} />;
});

type TAuthHeaderBase = {
  pageTitle: string;
};

export function AuthHeaderBase(props: TAuthHeaderBase) {
  return (
    <>
      <PageHead title={props.pageTitle} />
      <div className="sticky top-0 flex w-full flex-shrink-0" />
    </>
  );
}
