/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export function MaintenanceMessage() {
  return (
    <>
      <div className="flex flex-col gap-2.5">
        <h1 className="text-left text-18 font-semibold text-primary">&#x1F6A7; 起動に失敗しました</h1>
        <span className="text-left text-14 font-medium text-secondary">
          一部のサービスが起動していない可能性があります。コンテナログを確認してください。
        </span>
      </div>
      <div className="mt-1 flex items-center justify-start gap-6">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-13 text-accent-primary hover:underline focus-visible:rounded focus-visible:outline"
        >
          再読み込み
        </button>
        <span className="text-13 text-secondary">改善しない場合は社内管理者へ連絡してください。</span>
      </div>
    </>
  );
}
