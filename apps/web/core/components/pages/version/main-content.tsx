/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { EyeIcon, TriangleAlert } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPageVersion } from "@plane/types";
// helpers
import type { EPageStoreType } from "@/plane-web/hooks/store";
import { useUser } from "@/hooks/store/user";
// local imports
import type { TVersionEditorProps } from "./editor";

type Props = {
  activeVersion: string | null;
  editorComponent: React.FC<TVersionEditorProps>;
  fetchVersionDetails: (pageId: string, versionId: string) => Promise<TPageVersion | undefined>;
  handleClose: () => void;
  handleRestore: (descriptionHTML: string) => Promise<void>;
  pageId: string;
  restoreEnabled: boolean;
  storeType: EPageStoreType;
};

export const PageVersionsMainContent = observer(function PageVersionsMainContent(props: Props) {
  const {
    activeVersion,
    editorComponent,
    fetchVersionDetails,
    handleClose,
    handleRestore,
    pageId,
    restoreEnabled,
    storeType,
  } = props;
  // states
  const [isRestoring, setIsRestoring] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const { currentLocale, t } = useTranslation();
  const { data: currentUser } = useUser();

  const formatVersionTimestamp = (value: string | Date) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(currentLocale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: currentUser?.user_timezone || "Asia/Tokyo",
    }).format(date);
  };

  const {
    data: versionDetails,
    error: versionDetailsError,
    mutate: mutateVersionDetails,
  } = useSWR(
    pageId && activeVersion ? `PAGE_VERSION_${activeVersion}` : null,
    pageId && activeVersion ? () => fetchVersionDetails(pageId, activeVersion) : null
  );

  const handleRestoreVersion = async () => {
    if (!restoreEnabled) return;
    setIsRestoring(true);
    await handleRestore(versionDetails?.description_html ?? "<p></p>")
      .then(() => {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("pages_ui.version.restore_success"),
        });
        handleClose();
      })
      .catch(() =>
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("pages_ui.version.restore_failed"),
        })
      )
      .finally(() => setIsRestoring(false));
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    await mutateVersionDetails();
    setIsRetrying(false);
  };

  const VersionEditor = editorComponent;

  return (
    <div className="flex flex-grow flex-col overflow-hidden">
      {versionDetailsError ? (
        <div className="grid flex-grow place-items-center">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="grid size-11 flex-shrink-0 place-items-center text-tertiary">
              <TriangleAlert className="size-10" />
            </span>
            <div>
              <h6 className="text-16 font-semibold">{t("pages_ui.version.load_failed_title")}</h6>
              <p className="text-13 text-tertiary">{t("pages_ui.version.load_failed_message")}</p>
            </div>
            <Button variant="link" onClick={handleRetry} loading={isRetrying}>
              {t("pages_ui.version.retry")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex min-h-14 items-center justify-between gap-2 border-b border-subtle px-5 py-3">
            <div className="flex items-center gap-4">
              <h6 className="text-14 font-medium">
                {versionDetails ? formatVersionTimestamp(versionDetails.last_saved_at) : t("pages_ui.version.loading")}
              </h6>
              <span className="flex flex-shrink-0 items-center gap-1 rounded-sm bg-accent-primary/20 px-1.5 py-1 text-11 font-medium text-accent-primary">
                <EyeIcon className="size-3 flex-shrink-0" />
                {t("pages_ui.version.view_only")}
              </span>
            </div>
            {restoreEnabled && (
              <Button variant="primary" className="flex-shrink-0" onClick={handleRestoreVersion} loading={isRestoring}>
                {isRestoring ? t("pages_ui.version.restoring") : t("common.actions.restore")}
              </Button>
            )}
          </div>
          <div className="vertical-scrollbar scrollbar-sm h-full overflow-y-scroll pt-8">
            <VersionEditor activeVersion={activeVersion} storeType={storeType} versionDetails={versionDetails} />
          </div>
        </>
      )}
    </div>
  );
});
