"use client";

import type { PredictionWorkResult } from "@inttegro/cogni-client";
import type { RoutePrefetch } from "@inttegro/cogni-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type LinkHTMLAttributes,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { PrefetchPageLinks } from "react-router";

const FrameworkPrefetchPageLinks = PrefetchPageLinks as ComponentType<
  { readonly page: string } & LinkHTMLAttributes<HTMLLinkElement>
>;

interface FrameworkPrefetchRequest {
  readonly id: string;
  readonly href: string;
  readonly signal: AbortSignal;
  readonly resolve: (result: PredictionWorkResult) => void;
  readonly reject: (error: unknown) => void;
}

let requestSequence = 0;

/**
 * React Router Framework Mode exposes prefetch as rendered resource hints.
 * This bridge activates those hints only after Cogni admits the candidate and
 * keeps the prediction running until every emitted resource settles.
 */
export function useFrameworkRoutePrefetch(customPrefetch: RoutePrefetch | undefined): {
  readonly prefetchRoute: RoutePrefetch;
  readonly prefetchLinks: ReactNode;
} {
  const customPrefetchRef = useRef(customPrefetch);
  const [request, setRequest] = useState<FrameworkPrefetchRequest | null>(null);
  customPrefetchRef.current = customPrefetch;

  const prefetchRoute = useCallback<RoutePrefetch>((href, { signal }) => {
    const custom = customPrefetchRef.current;
    if (custom) return custom(href, { signal });

    return new Promise<PredictionWorkResult>((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason ?? new Error("route prefetch aborted"));
        return;
      }

      const nextRequest: FrameworkPrefetchRequest = {
        id: `cogni-react-router-${++requestSequence}`,
        href,
        signal,
        resolve,
        reject,
      };
      setRequest((current) => {
        current?.reject(new Error("route prefetch superseded"));
        return nextRequest;
      });
    });
  }, []);

  const settle = useCallback((settled: FrameworkPrefetchRequest) => {
    setRequest((current) => (current === settled ? null : current));
  }, []);

  return {
    prefetchRoute,
    prefetchLinks:
      customPrefetch || !request ? null : (
        <FrameworkPrefetch request={request} onSettled={settle} />
      ),
  };
}

function FrameworkPrefetch({
  request,
  onSettled,
}: {
  readonly request: FrameworkPrefetchRequest;
  readonly onSettled: (request: FrameworkPrefetchRequest) => void;
}) {
  const completedRef = useRef(new Set<HTMLLinkElement>());
  const settledRef = useRef(false);
  const quietTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const links = useCallback(
    () =>
      Array.from(
        document.querySelectorAll<HTMLLinkElement>(
          `link[data-cogni-prefetch="${request.id}"]`,
        ),
      ),
    [request.id],
  );

  const resolve = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    const emittedLinks = links();
    request.resolve({ materialWork: emittedLinks.length > 0 });
    onSettled(request);
  }, [links, onSettled, request]);

  const reject = useCallback(
    (error: unknown) => {
      if (settledRef.current) return;
      settledRef.current = true;
      request.reject(error);
      onSettled(request);
    },
    [onSettled, request],
  );

  const checkAfterQuietPeriod = useCallback(() => {
    if (quietTimerRef.current) clearTimeout(quietTimerRef.current);
    quietTimerRef.current = setTimeout(() => {
      const emittedLinks = links();
      if (
        emittedLinks.length === 0 ||
        emittedLinks.every((link) => completedRef.current.has(link))
      ) {
        resolve();
      }
    }, 100);
  }, [links, resolve]);

  useEffect(() => {
    const abort = () =>
      reject(request.signal.reason ?? new Error("route prefetch aborted"));
    request.signal.addEventListener("abort", abort, { once: true });

    const observer = new MutationObserver(checkAfterQuietPeriod);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    checkAfterQuietPeriod();

    return () => {
      request.signal.removeEventListener("abort", abort);
      observer.disconnect();
      if (quietTimerRef.current) clearTimeout(quietTimerRef.current);
      if (!settledRef.current) {
        settledRef.current = true;
        request.resolve({ materialWork: links().length > 0 });
      }
    };
  }, [checkAfterQuietPeriod, links, reject, request]);

  const handleLoad = useCallback(
    (event: SyntheticEvent<HTMLLinkElement>) => {
      completedRef.current.add(event.currentTarget);
      checkAfterQuietPeriod();
    },
    [checkAfterQuietPeriod],
  );

  const handleError = useCallback(
    (event: SyntheticEvent<HTMLLinkElement>) => {
      reject(new Error(`React Router failed to prefetch ${event.currentTarget.href}`));
    },
    [reject],
  );

  return (
    <FrameworkPrefetchPageLinks
      page={request.href}
      data-cogni-prefetch={request.id}
      onLoad={handleLoad}
      onError={handleError}
    />
  );
}
