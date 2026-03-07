/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import type { WeekMonthDataType, ChartDataType, TGanttViews } from "@plane/types";
import { EStartOfTheWeek } from "@plane/types";

// constants
export const generateWeeks = (startOfWeek: EStartOfTheWeek = EStartOfTheWeek.SUNDAY): WeekMonthDataType[] => [
  ...weeks.slice(startOfWeek),
  ...weeks.slice(0, startOfWeek),
];

export const weeks: (WeekMonthDataType & { i18n_abbr: string })[] = [
  { key: 0, shortTitle: "sun", title: "sunday", abbreviation: "Su", i18n_abbr: "calendar.day_abbr.sun" },
  { key: 1, shortTitle: "mon", title: "monday", abbreviation: "M", i18n_abbr: "calendar.day_abbr.mon" },
  { key: 2, shortTitle: "tue", title: "tuesday", abbreviation: "T", i18n_abbr: "calendar.day_abbr.tue" },
  { key: 3, shortTitle: "wed", title: "wednesday", abbreviation: "W", i18n_abbr: "calendar.day_abbr.wed" },
  { key: 4, shortTitle: "thurs", title: "thursday", abbreviation: "Th", i18n_abbr: "calendar.day_abbr.thu" },
  { key: 5, shortTitle: "fri", title: "friday", abbreviation: "F", i18n_abbr: "calendar.day_abbr.fri" },
  { key: 6, shortTitle: "sat", title: "saturday", abbreviation: "Sa", i18n_abbr: "calendar.day_abbr.sat" },
];

export const months: (WeekMonthDataType & { i18n_abbr: string; i18n_full: string })[] = [
  { key: 0, shortTitle: "jan", title: "january", abbreviation: "Jan", i18n_abbr: "calendar.month_abbr.jan", i18n_full: "calendar.month_full.jan" },
  { key: 1, shortTitle: "feb", title: "february", abbreviation: "Feb", i18n_abbr: "calendar.month_abbr.feb", i18n_full: "calendar.month_full.feb" },
  { key: 2, shortTitle: "mar", title: "march", abbreviation: "Mar", i18n_abbr: "calendar.month_abbr.mar", i18n_full: "calendar.month_full.mar" },
  { key: 3, shortTitle: "apr", title: "april", abbreviation: "Apr", i18n_abbr: "calendar.month_abbr.apr", i18n_full: "calendar.month_full.apr" },
  { key: 4, shortTitle: "may", title: "may", abbreviation: "May", i18n_abbr: "calendar.month_abbr.may", i18n_full: "calendar.month_full.may" },
  { key: 5, shortTitle: "jun", title: "june", abbreviation: "Jun", i18n_abbr: "calendar.month_abbr.jun", i18n_full: "calendar.month_full.jun" },
  { key: 6, shortTitle: "jul", title: "july", abbreviation: "Jul", i18n_abbr: "calendar.month_abbr.jul", i18n_full: "calendar.month_full.jul" },
  { key: 7, shortTitle: "aug", title: "august", abbreviation: "Aug", i18n_abbr: "calendar.month_abbr.aug", i18n_full: "calendar.month_full.aug" },
  { key: 8, shortTitle: "sept", title: "september", abbreviation: "Sept", i18n_abbr: "calendar.month_abbr.sep", i18n_full: "calendar.month_full.sep" },
  { key: 9, shortTitle: "oct", title: "october", abbreviation: "Oct", i18n_abbr: "calendar.month_abbr.oct", i18n_full: "calendar.month_full.oct" },
  { key: 10, shortTitle: "nov", title: "november", abbreviation: "Nov", i18n_abbr: "calendar.month_abbr.nov", i18n_full: "calendar.month_full.nov" },
  { key: 11, shortTitle: "dec", title: "december", abbreviation: "Dec", i18n_abbr: "calendar.month_abbr.dec", i18n_full: "calendar.month_full.dec" },
];

export const quarters: WeekMonthDataType[] = [
  { key: 0, shortTitle: "Q1", title: "Jan - Mar", abbreviation: "Q1" },
  { key: 1, shortTitle: "Q2", title: "Apr - Jun", abbreviation: "Q2" },
  { key: 2, shortTitle: "Q3", title: "Jul - Sept", abbreviation: "Q3" },
  { key: 3, shortTitle: "Q4", title: "Oct - Dec", abbreviation: "Q4" },
];

export const charCapitalize = (word: string) => `${word.charAt(0).toUpperCase()}${word.substring(1)}`;

export const bindZero = (value: number) => (value > 9 ? `${value}` : `0${value}`);

export const timePreview = (date: Date) => {
  let hours = date.getHours();
  const amPm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;

  let minutes: number | string = date.getMinutes();
  minutes = bindZero(minutes);

  return `${bindZero(hours)}:${minutes} ${amPm}`;
};

export const datePreview = (date: Date, includeTime: boolean = false) => {
  const day = date.getDate();
  let month: number | WeekMonthDataType = date.getMonth();
  month = months[month];
  const year = date.getFullYear();

  return `${charCapitalize(month?.shortTitle)} ${day}, ${year}${includeTime ? `, ${timePreview(date)}` : ``}`;
};

// context data
export const VIEWS_LIST: ChartDataType[] = [
  {
    key: "week",
    i18n_title: "common.week",
    data: {
      startDate: new Date(),
      currentDate: new Date(),
      endDate: new Date(),
      approxFilterRange: 4, // it will preview week dates with weekends highlighted with 1 week limitations ex: title (Wed 1, Thu 2, Fri 3)
      dayWidth: 60,
    },
  },
  {
    key: "month",
    i18n_title: "common.month",
    data: {
      startDate: new Date(),
      currentDate: new Date(),
      endDate: new Date(),
      approxFilterRange: 6, // it will preview monthly all dates with weekends highlighted with no limitations ex: title (1, 2, 3)
      dayWidth: 20,
    },
  },
  {
    key: "quarter",
    i18n_title: "common.quarter",
    data: {
      startDate: new Date(),
      currentDate: new Date(),
      endDate: new Date(),
      approxFilterRange: 24, // it will preview week starting dates all months data and there is 3 months limitation for preview ex: title (2, 9, 16, 23, 30)
      dayWidth: 5,
    },
  },
];

export const currentViewDataWithView = (view: TGanttViews = "month") =>
  VIEWS_LIST.find((_viewData) => _viewData.key === view);
