/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { lazy, Suspense } from "react";
import { useTheme } from "next-themes";
import useSWR, { SWRConfig } from "swr";
// Plane Imports
import { WEB_SWR_CONFIG } from "@plane/constants";
import { TranslationProvider } from "@plane/i18n";
import { Toast } from "@plane/propel/toast";
// helpers
import { resolveGeneralTheme } from "@plane/utils";
// hooks
import { useInstance } from "@/hooks/store/use-instance";
import { useUser } from "@/hooks/store/user";
// polyfills
// eslint-disable-next-line import/no-unassigned-import -- browser polyfills must run before the app wrappers mount
import "@/lib/polyfills";
// mobx store provider
import { StoreProvider } from "@/lib/store-context";

// lazy imports
const AppProgressBar = lazy(function AppProgressBar() {
  return import("@/lib/b-progress/AppProgressBar");
});

const StoreWrapper = lazy(function StoreWrapper() {
  return import("@/lib/wrappers/store-wrapper");
});

const InstanceWrapper = lazy(function InstanceWrapper() {
  return import("@/lib/wrappers/instance-wrapper");
});

const ChatSupportModal = lazy(function ChatSupportModal() {
  return import("@/components/global/chat-support-modal");
});

export interface IAppProvider {
  children: React.ReactNode;
}

function AppBootstrapPrefetch() {
  const { fetchInstanceInfo } = useInstance();
  const { fetchCurrentUser } = useUser();

  // Start independent bootstrap requests together. The wrappers below reuse
  // these SWR keys, so they keep their existing loading and error behavior
  // without serializing user loading behind the instance request.
  useSWR("INSTANCE_INFORMATION", async () => await fetchInstanceInfo(), {
    revalidateOnFocus: false,
  });
  useSWR("USER_INFORMATION", async () => await fetchCurrentUser(), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  return null;
}

export function AppProvider(props: IAppProvider) {
  const { children } = props;
  // themes
  const { resolvedTheme } = useTheme();

  return (
    <StoreProvider>
      <SWRConfig value={WEB_SWR_CONFIG}>
        <AppBootstrapPrefetch />
        <AppProgressBar />
        <TranslationProvider>
          <Toast theme={resolveGeneralTheme(resolvedTheme)} />
          <StoreWrapper>
            <InstanceWrapper>
              <Suspense>
                <ChatSupportModal />
                {children}
              </Suspense>
            </InstanceWrapper>
          </StoreWrapper>
        </TranslationProvider>
      </SWRConfig>
    </StoreProvider>
  );
}
