/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";

const INITIAL_PREFETCH_DELAY_MS = 120;
const PREFETCH_STAGE_GAP_MS = 180;
const PREFETCH_IDLE_TIMEOUT_MS = 500;
const EMPTY_PREFETCH_QUEUE: readonly never[] = [];

type TPrefetchProgress = {
  key: string;
  stage: number;
};

/**
 * Releases queued background fetches one at a time. Route-critical resources
 * can be supplied through `eagerQueue`; they become ready together while the
 * remaining route-aware resources continue to wait for idle time.
 */
export const useIdlePrefetchQueue = <TResource extends string>(
  queue: readonly TResource[],
  contextKey: string,
  eagerQueue: readonly TResource[] = EMPTY_PREFETCH_QUEUE
): ReadonlySet<TResource> => {
  const eagerResources = useMemo(() => {
    if (!contextKey) return new Set<TResource>();

    const queuedResources = new Set(queue);
    return new Set(eagerQueue.filter((resource) => queuedResources.has(resource)));
  }, [contextKey, eagerQueue, queue]);
  const backgroundQueue = useMemo(
    () => queue.filter((resource) => !eagerResources.has(resource)),
    [eagerResources, queue]
  );
  const queueSignature = backgroundQueue.join(":");
  const scheduleKey = contextKey && backgroundQueue.length > 0 ? `${contextKey}:${queueSignature}` : "";
  const [progress, setProgress] = useState<TPrefetchProgress>({ key: "", stage: 0 });
  const activeStage = progress.key === scheduleKey ? progress.stage : 0;

  useEffect(() => {
    if (!scheduleKey) return;

    let isCancelled = false;
    let idleCallbackId: number | undefined;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;

    const scheduleAtIdle = (nextStage: number) => {
      const advanceQueue = () => {
        if (isCancelled) return;

        setProgress({ key: scheduleKey, stage: nextStage });

        if (nextStage < backgroundQueue.length) {
          timeoutId = globalThis.setTimeout(() => scheduleAtIdle(nextStage + 1), PREFETCH_STAGE_GAP_MS);
        }
      };

      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        idleCallbackId = window.requestIdleCallback(advanceQueue, { timeout: PREFETCH_IDLE_TIMEOUT_MS });
        return;
      }

      timeoutId = globalThis.setTimeout(advanceQueue, 0);
    };

    timeoutId = globalThis.setTimeout(() => scheduleAtIdle(1), INITIAL_PREFETCH_DELAY_MS);

    return () => {
      isCancelled = true;
      if (idleCallbackId !== undefined && typeof window !== "undefined") {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
    };
  }, [backgroundQueue.length, scheduleKey]);

  return useMemo(
    () => new Set([...eagerResources, ...backgroundQueue.slice(0, activeStage)]),
    [activeStage, backgroundQueue, eagerResources]
  );
};
