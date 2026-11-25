"use client";

import { useRouteIntent, type RouteCandidateOptions } from "@inttegro/cogni-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type FocusEventHandler,
  type ForwardedRef,
  type MouseEventHandler,
  type PointerEventHandler,
  type TouchEventHandler,
} from "react";
import {
  useLinkProps,
  useRouter,
  type LinkComponentProps,
} from "@tanstack/react-router";

export type PredictiveLinkProps = Omit<
  LinkComponentProps<"a">,
  "preload" | "preloadDelay"
> &
  Omit<RouteCandidateOptions, "key"> & {
    readonly predictionKey?: string;
    readonly enabled?: boolean;
    readonly hoverDelayMs?: number;
    readonly maxDeferMs?: number;
  };

/** A TanStack Router Link backed by router.preloadRoute and Cogni admission. */
export const PredictiveLink = forwardRef<HTMLAnchorElement, PredictiveLinkProps>(
  function PredictiveLink(
    {
      predictionKey,
      enabled,
      hoverDelayMs,
      maxDeferMs,
      policy,
      destination,
      probability,
      horizonMs,
      cost,
      priority,
      estimatedBytes,
      children,
      onMouseEnter,
      onMouseLeave,
      onPointerDown,
      onTouchStart,
      onFocus,
      onBlur,
      onClick,
      ...routerOptions
    },
    ref,
  ) {
    const router = useRouter();
    const linkProps = useLinkProps(
      {
        ...routerOptions,
        preload: false,
        onMouseEnter: undefined,
        onMouseLeave: undefined,
        onPointerDown: undefined,
        onTouchStart: undefined,
        onFocus: undefined,
        onBlur: undefined,
        onClick: undefined,
      },
      ref as ForwardedRef<Element>,
    );
    const href = linkProps.href ?? "";
    const sameOrigin = href !== "" && isSameOrigin(href);
    const awaitingCommitRef = useRef<string | null>(null);
    const prefetchRoute = useCallback(
      async (_href: string, { signal }: { readonly signal: AbortSignal }) => {
        if (signal.aborted) return { materialWork: false };
        const matches = await router.preloadRoute({ to: href });
        return { materialWork: matches !== undefined && matches.length > 0 };
      },
      [href, router],
    );
    const intent = useRouteIntent({
      href,
      prefetchRoute,
      ...(probability === undefined ? {} : { probability }),
      ...(horizonMs === undefined ? {} : { horizonMs }),
      enabled:
        (enabled ?? true) &&
        sameOrigin &&
        !routerOptions.reloadDocument &&
        !routerOptions.disabled,
      ...(hoverDelayMs === undefined ? {} : { hoverDelayMs }),
      ...(maxDeferMs === undefined ? {} : { maxDeferMs }),
      ...(predictionKey === undefined ? {} : { key: predictionKey }),
      policy: policy ?? "tanstack-router-route",
      ...(destination === undefined ? {} : { destination }),
      ...(cost === undefined ? {} : { cost }),
      ...(priority === undefined ? {} : { priority }),
      ...(estimatedBytes === undefined ? {} : { estimatedBytes }),
    });

    useEffect(
      () =>
        router.subscribe("onBeforeNavigate", ({ toLocation }) => {
          const awaiting = awaitingCommitRef.current;
          if (!awaiting) return;

          awaitingCommitRef.current = null;
          if (normalizedHref(toLocation.href) === normalizedHref(awaiting))
            intent.commit();
          else intent.cancel();
        }),
      [intent, router],
    );

    const handleMouseEnter: MouseEventHandler<HTMLAnchorElement> = useCallback(
      (event) => {
        onMouseEnter?.(event);
        if (!event.defaultPrevented) intent.scheduleHover();
        linkProps.onMouseEnter?.(event);
      },
      [intent, linkProps, onMouseEnter],
    );
    const handleMouseLeave: MouseEventHandler<HTMLAnchorElement> = useCallback(
      (event) => {
        onMouseLeave?.(event);
        if (!event.defaultPrevented) intent.cancel();
        linkProps.onMouseLeave?.(event);
      },
      [intent, linkProps, onMouseLeave],
    );
    const handlePointerDown: PointerEventHandler<HTMLAnchorElement> = useCallback(
      (event) => {
        onPointerDown?.(event);
        if (!event.defaultPrevented) intent.runNow("pointer");
        linkProps.onPointerDown?.(event);
      },
      [intent, linkProps, onPointerDown],
    );
    const handleTouchStart: TouchEventHandler<HTMLAnchorElement> = useCallback(
      (event) => {
        onTouchStart?.(event);
        if (!event.defaultPrevented) intent.runNow("touch");
        linkProps.onTouchStart?.(event);
      },
      [intent, linkProps, onTouchStart],
    );
    const handleFocus: FocusEventHandler<HTMLAnchorElement> = useCallback(
      (event) => {
        onFocus?.(event);
        if (!event.defaultPrevented) intent.runNow("focus");
        linkProps.onFocus?.(event);
      },
      [intent, linkProps, onFocus],
    );
    const handleBlur: FocusEventHandler<HTMLAnchorElement> = useCallback(
      (event) => {
        onBlur?.(event);
        if (!event.defaultPrevented) intent.cancel();
        linkProps.onBlur?.(event);
      },
      [intent, linkProps, onBlur],
    );
    const handleClick: MouseEventHandler<HTMLAnchorElement> = useCallback(
      (event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          linkProps.target === "_blank" ||
          (linkProps.download !== undefined && linkProps.download !== false) ||
          routerOptions.reloadDocument ||
          !sameOrigin
        ) {
          intent.cancel();
          return;
        }

        intent.runNow("click");
        awaitingCommitRef.current = href;
        linkProps.onClick?.(event);
      },
      [href, intent, linkProps, onClick, routerOptions.reloadDocument, sameOrigin],
    );

    const renderedChildren =
      typeof children === "function"
        ? children({
            isActive:
              (linkProps as Record<string, unknown>)["data-status"] === "active",
          })
        : children;

    return (
      <a
        {...linkProps}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onPointerDown={handlePointerDown}
        onTouchStart={handleTouchStart}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onClick={handleClick}
      >
        {renderedChildren}
      </a>
    );
  },
);

function normalizedHref(href: string): string {
  const url = new URL(href, "http://cogni.local");
  return `${url.pathname}${url.search}${url.hash}`;
}

function isSameOrigin(href: string): boolean {
  if (typeof window === "undefined") return href.startsWith("/");
  return new URL(href, window.location.href).origin === window.location.origin;
}
