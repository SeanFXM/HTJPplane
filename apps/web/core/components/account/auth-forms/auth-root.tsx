/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { OAuthOptions } from "@plane/ui";
// assets
import hotoneLogo from "@/app/assets/logos/hotone-logo.png?url";
// helpers
import type { TAuthErrorInfo } from "@/helpers/authentication.helper";
import {
  EAuthModes,
  EAuthSteps,
  EAuthenticationErrorCodes,
  EErrorAlertType,
  authErrorHandler,
} from "@/helpers/authentication.helper";
// hooks
import { useOAuthConfig } from "@/hooks/oauth";
import { useInstance } from "@/hooks/store/use-instance";
// local imports
import { AuthBanner } from "./auth-banner";
import { AuthHeader, AuthHeaderBase } from "./auth-header";
import { AuthFormRoot } from "./form-root";

type TAuthRoot = {
  authMode: EAuthModes;
};

export const AuthRoot = observer(function AuthRoot(props: TAuthRoot) {
  const { t } = useTranslation();
  //router
  const searchParams = useSearchParams();
  // query params
  const emailParam = searchParams.get("email");
  const invitation_id = searchParams.get("invitation_id");
  const workspaceSlug = searchParams.get("slug");
  const error_code = searchParams.get("error_code");
  // props
  const { authMode: currentAuthMode } = props;
  // states
  const [authMode, setAuthMode] = useState<EAuthModes | undefined>(undefined);
  const [authStep, setAuthStep] = useState<EAuthSteps>(EAuthSteps.EMAIL);
  const [email, setEmail] = useState(emailParam ? emailParam.toString() : "");
  const [errorInfo, setErrorInfo] = useState<TAuthErrorInfo | undefined>(undefined);
  // store hooks
  const { config } = useInstance();
  // derived values
  const oAuthActionText = authMode === EAuthModes.SIGN_UP ? t("sign_up") : t("sign_in");
  const { isOAuthEnabled, oAuthOptions } = useOAuthConfig(oAuthActionText);
  const isEmailBasedAuthEnabled = config?.is_email_password_enabled || config?.is_magic_login_enabled;
  const noAuthMethodsAvailable = !isOAuthEnabled && !isEmailBasedAuthEnabled;

  useEffect(() => {
    if (!authMode && currentAuthMode) setAuthMode(currentAuthMode);
  }, [currentAuthMode, authMode]);

  useEffect(() => {
    if (error_code && authMode) {
      const errorhandler = authErrorHandler(error_code?.toString() as EAuthenticationErrorCodes);
      if (errorhandler) {
        // password error handler
        if ([EAuthenticationErrorCodes.AUTHENTICATION_FAILED_SIGN_UP].includes(errorhandler.code)) {
          setAuthMode(EAuthModes.SIGN_UP);
          setAuthStep(EAuthSteps.PASSWORD);
        }
        if ([EAuthenticationErrorCodes.AUTHENTICATION_FAILED_SIGN_IN].includes(errorhandler.code)) {
          setAuthMode(EAuthModes.SIGN_IN);
          setAuthStep(EAuthSteps.PASSWORD);
        }
        // magic_code error handler
        if (
          [
            EAuthenticationErrorCodes.INVALID_MAGIC_CODE_SIGN_UP,
            EAuthenticationErrorCodes.INVALID_EMAIL_MAGIC_SIGN_UP,
            EAuthenticationErrorCodes.EXPIRED_MAGIC_CODE_SIGN_UP,
            EAuthenticationErrorCodes.EMAIL_CODE_ATTEMPT_EXHAUSTED_SIGN_UP,
          ].includes(errorhandler.code)
        ) {
          setAuthMode(EAuthModes.SIGN_UP);
          setAuthStep(EAuthSteps.UNIQUE_CODE);
        }
        if (
          [
            EAuthenticationErrorCodes.INVALID_MAGIC_CODE_SIGN_IN,
            EAuthenticationErrorCodes.INVALID_EMAIL_MAGIC_SIGN_IN,
            EAuthenticationErrorCodes.EXPIRED_MAGIC_CODE_SIGN_IN,
            EAuthenticationErrorCodes.EMAIL_CODE_ATTEMPT_EXHAUSTED_SIGN_IN,
          ].includes(errorhandler.code)
        ) {
          setAuthMode(EAuthModes.SIGN_IN);
          setAuthStep(EAuthSteps.UNIQUE_CODE);
        }

        setErrorInfo(errorhandler);
      }
    }
  }, [error_code, authMode]);

  if (!authMode) return <></>;

  if (noAuthMethodsAvailable) {
    return (
      <AuthContainer>
        <AuthHeaderBase
          header={t("no_authentication_methods_available")}
          subHeader="Please contact your administrator to enable authentication for your instance."
        />
      </AuthContainer>
    );
  }

  return (
    <AuthContainer>
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="shadow-sm rounded-md bg-white px-4 py-2 ring-1 ring-black/5">
          <img src={hotoneLogo} alt="Hotone" className="h-auto w-52" />
        </div>
        <div className="space-y-1">
          <h1 className="text-h4-semibold text-primary">{t("auth.hotone_portal.title")}</h1>
          <p className="text-body-sm-regular text-secondary">{t("auth.hotone_portal.description")}</p>
        </div>
      </div>
      {errorInfo && errorInfo?.type === EErrorAlertType.BANNER_ALERT && (
        <AuthBanner message={errorInfo.message} handleBannerData={(value) => setErrorInfo(value)} />
      )}
      <AuthHeader
        workspaceSlug={workspaceSlug?.toString() || undefined}
        invitationId={invitation_id?.toString() || undefined}
        invitationEmail={email || undefined}
        authMode={authMode}
        currentAuthStep={authStep}
      />
      {isOAuthEnabled && (
        <OAuthOptions
          options={oAuthOptions}
          compact={authStep === EAuthSteps.PASSWORD}
          showDivider={isEmailBasedAuthEnabled}
        />
      )}
      {isEmailBasedAuthEnabled && (
        <AuthFormRoot
          authStep={authStep}
          authMode={authMode}
          email={email}
          setEmail={(nextEmail) => setEmail(nextEmail)}
          setAuthMode={(nextAuthMode) => setAuthMode(nextAuthMode)}
          setAuthStep={(nextAuthStep) => setAuthStep(nextAuthStep)}
          setErrorInfo={(nextErrorInfo) => setErrorInfo(nextErrorInfo)}
          currentAuthMode={currentAuthMode}
        />
      )}
      <p className="text-center text-body-xs-regular text-tertiary">{t("auth.hotone_portal.help")}</p>
    </AuthContainer>
  );
});

function AuthContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-10 flex w-full flex-grow flex-col items-center justify-center py-6">
      <div className="relative flex w-full max-w-[22.5rem] flex-col gap-6">{children}</div>
    </div>
  );
}
