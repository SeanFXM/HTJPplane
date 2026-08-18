/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane types
import { useTranslation } from "@plane/i18n";
import type { IUser } from "@plane/types";
// plane ui
// hooks
import { useCurrentTime } from "@/hooks/use-current-time";

export interface IUserGreetingsView {
  user: IUser;
}

export function UserGreetingsView(props: IUserGreetingsView) {
  const { user } = props;
  // current time hook
  const { currentTime } = useCurrentTime();
  // store hooks
  const { currentLocale, t } = useTranslation();
  const timeZone = user.user_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const hour = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(currentTime);

  const localizedDateTime = new Intl.DateTimeFormat(currentLocale, {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).format(currentTime);

  const greeting = parseInt(hour, 10) < 12 ? "morning" : parseInt(hour, 10) < 18 ? "afternoon" : "evening";
  const localizedGreeting =
    currentLocale === "en"
      ? `${t("good")} ${t(greeting)}`
      : currentLocale === "ja" && greeting === "morning"
        ? `${t("good")}${t(greeting)}`
        : t(greeting);
  const greetingSeparator = currentLocale === "ja" ? "、" : currentLocale === "zh-CN" ? "，" : ",";

  return (
    <div className="my-6 flex flex-col items-center">
      <h2 className="text-center text-20 font-semibold">
        {localizedGreeting}
        {greetingSeparator} {user.first_name} {user.last_name}
      </h2>
      <h5 className="flex items-center gap-2 font-medium text-placeholder">
        <div>{greeting === "morning" ? "🌤️" : greeting === "afternoon" ? "🌥️" : "🌙️"}</div>
        <div>{localizedDateTime}</div>
      </h5>
    </div>
  );
}
