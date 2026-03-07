/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TCalendarLayouts } from "@plane/types";
import { EStartOfTheWeek } from "@plane/types";

export const MONTH_KEYS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
] as const;

export const MONTHS_LIST: {
  [monthNumber: number]: {
    shortTitle: string;
    title: string;
    i18n_abbr: string;
    i18n_full: string;
  };
} = {
  1: { shortTitle: "Jan", title: "January", i18n_abbr: "calendar.month_abbr.jan", i18n_full: "calendar.month_full.jan" },
  2: { shortTitle: "Feb", title: "February", i18n_abbr: "calendar.month_abbr.feb", i18n_full: "calendar.month_full.feb" },
  3: { shortTitle: "Mar", title: "March", i18n_abbr: "calendar.month_abbr.mar", i18n_full: "calendar.month_full.mar" },
  4: { shortTitle: "Apr", title: "April", i18n_abbr: "calendar.month_abbr.apr", i18n_full: "calendar.month_full.apr" },
  5: { shortTitle: "May", title: "May", i18n_abbr: "calendar.month_abbr.may", i18n_full: "calendar.month_full.may" },
  6: { shortTitle: "Jun", title: "June", i18n_abbr: "calendar.month_abbr.jun", i18n_full: "calendar.month_full.jun" },
  7: { shortTitle: "Jul", title: "July", i18n_abbr: "calendar.month_abbr.jul", i18n_full: "calendar.month_full.jul" },
  8: { shortTitle: "Aug", title: "August", i18n_abbr: "calendar.month_abbr.aug", i18n_full: "calendar.month_full.aug" },
  9: { shortTitle: "Sep", title: "September", i18n_abbr: "calendar.month_abbr.sep", i18n_full: "calendar.month_full.sep" },
  10: { shortTitle: "Oct", title: "October", i18n_abbr: "calendar.month_abbr.oct", i18n_full: "calendar.month_full.oct" },
  11: { shortTitle: "Nov", title: "November", i18n_abbr: "calendar.month_abbr.nov", i18n_full: "calendar.month_full.nov" },
  12: { shortTitle: "Dec", title: "December", i18n_abbr: "calendar.month_abbr.dec", i18n_full: "calendar.month_full.dec" },
};

export const DAYS_LIST: {
  [dayIndex: number]: {
    shortTitle: string;
    title: string;
    value: EStartOfTheWeek;
    i18n_abbr: string;
    i18n_short: string;
  };
} = {
  1: { shortTitle: "Sun", title: "Sunday", value: EStartOfTheWeek.SUNDAY, i18n_abbr: "calendar.day_abbr.sun", i18n_short: "calendar.day_short.sun" },
  2: { shortTitle: "Mon", title: "Monday", value: EStartOfTheWeek.MONDAY, i18n_abbr: "calendar.day_abbr.mon", i18n_short: "calendar.day_short.mon" },
  3: { shortTitle: "Tue", title: "Tuesday", value: EStartOfTheWeek.TUESDAY, i18n_abbr: "calendar.day_abbr.tue", i18n_short: "calendar.day_short.tue" },
  4: { shortTitle: "Wed", title: "Wednesday", value: EStartOfTheWeek.WEDNESDAY, i18n_abbr: "calendar.day_abbr.wed", i18n_short: "calendar.day_short.wed" },
  5: { shortTitle: "Thu", title: "Thursday", value: EStartOfTheWeek.THURSDAY, i18n_abbr: "calendar.day_abbr.thu", i18n_short: "calendar.day_short.thu" },
  6: { shortTitle: "Fri", title: "Friday", value: EStartOfTheWeek.FRIDAY, i18n_abbr: "calendar.day_abbr.fri", i18n_short: "calendar.day_short.fri" },
  7: { shortTitle: "Sat", title: "Saturday", value: EStartOfTheWeek.SATURDAY, i18n_abbr: "calendar.day_abbr.sat", i18n_short: "calendar.day_short.sat" },
};

export const CALENDAR_LAYOUTS: {
  [layout in TCalendarLayouts]: {
    key: TCalendarLayouts;
    title: string;
  };
} = {
  month: {
    key: "month",
    title: "Month layout",
  },
  week: {
    key: "week",
    title: "Week layout",
  },
};
