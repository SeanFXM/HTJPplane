/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export const IME_COMPOSITION_KEY_CODE = 229;

type TKeyboardEventLike = {
  isComposing?: boolean;
  keyCode?: number;
  nativeEvent?: {
    isComposing?: boolean;
    keyCode?: number;
  } | null;
} | null;

export const isImeComposing = (event: TKeyboardEventLike): boolean => {
  const nativeEvent = event?.nativeEvent;
  const isComposing = nativeEvent?.isComposing ?? event?.isComposing ?? false;
  const keyCode = nativeEvent?.keyCode ?? event?.keyCode;

  return isComposing || keyCode === IME_COMPOSITION_KEY_CODE;
};
