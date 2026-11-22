"use client";

import {
  useRouteIntent,
  type RouteCandidateOptions,
  type RoutePrefetch,
} from "@inttegro/cogni-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type FocusEventHandler,
  type MouseEventHandler,
  type PointerEventHandler,
  type TouchEventHandler,
} from "react";
import {
  Link,
  useHref,
  useLocation,
  useNavigate,
  type LinkProps,
  type To,
} from "react-router";
import { useFrameworkRoutePrefetch } from "./framework-prefetch";

export interface PredictiveLinkProps
  extends Omit<LinkProps, "to" | "prefetch">, Omit<RouteCandidateOptions, "key"> {
  readonly to: To;
  readonly predictionKey?: string;
  readonly enabled?: boolean;
  readonly hoverDelayMs?: number;
  readonly maxDeferMs?: number;
  /**
   * Required in React Router Data or Declarative Mode. Framework Mode can omit
   * this and Cogni will drive React Router's PrefetchPageLinks directly.
   */
  readonly prefetchRoute?: RoutePrefetch;
}

/** A React Router Link whose route work is admitted and measured by Cogni. */
export const PredictiveLink = forwardRef<HTMLAnchorElement, PredictiveLinkProps>(
  function PredictiveLink(
    {
      to,
      predictionKey,
      enabled,
      hoverDelayMs,
      maxDeferMs,
      prefetchRoute,
      policy,
      destination,
      probability,
      horizonMs,
      cost,
      priority,
      estimatedBytes,
      relative,
      reloadDocument,
      replace,
      state,
      preventScrollReset,
      viewTransition,
      defaultShouldRevalidate,
      mask,
      target,
      download,
      onPointerEnter,
      onPointerLeave,
      onPointerDown,
      onTouchStart,
      onFocus,
      onBlur,
      onClick,
      ...linkProps
    },
    ref,
  ) {
    const href = useHref(to, relative === undefined ? {} : { relative });
    const location = useLocation();
    const navigate = useNavigate();
    const frameworkPrefetch = useFrameworkRoutePrefetch(prefetchRoute);
    const navigationPendingRef = useRef(false);
    const sameOrigin = isSameOrigin(href);
    const intent = useRouteIntent({
      href,
      prefetchRoute: frameworkPrefetch.prefetchRoute,
      probability,
      horizonMs,
      enabled: (enabled ?? true) && sameOrigin && !reloadDocument,
      retainOnUnmount: true,
      ...(hoverDelayMs === undefined ? {} : { hoverDelayMs }),
      ...(maxDeferMs === undefined ? {} : { maxDeferMs }),
      ...(predictionKey === undefined ? {} : { key: predictionKey }),
      policy: policy ?? "react-router-route",
      ...(destination === undefined ? {} : { destination }),
      ...(cost === undefined ? {} : { cost }),
      ...(priority === undefined ? {} : { priority }),
      ...(estimatedBytes === undefined ? {} : { estimatedBytes }),
    });
    const intentRef = useRef(intent);
    intentRef.current = intent;

    useEffect(
      () => () => {
        if (!navigationPendingRef.current) intentRef.current.cancel();
      },
      [],
    );

    const handlePointerEnter: PointerEventHandler<HTMLAnchorElement> = useCallback(
      (event) => {
        onPointerEnter?.(event);
        if (!event.defaultPrevented) intent.scheduleHover();
      },
      [intent, onPointerEnter],
    );
    const handlePointerLeave: PointerEventHandler<HTMLAnchorElement> = useCallback(
      (event) => {
        onPointerLeave?.(event);
        if (!event.defaultPrevented) intent.cancel();
      },
      [intent, onPointerLeave],
    );
    const handlePointerDown: PointerEventHandler<HTMLAnchorElement> = useCallback(
      (event) => {
        onPointerDown?.(event);
        if (!event.defaultPrevented) intent.runNow("pointer");
      },
      [intent, onPointerDown],
    );
    const handleTouchStart: TouchEventHandler<HTMLAnchorElement> = useCallback(
      (event) => {
        onTouchStart?.(event);
        if (!event.defaultPrevented) intent.runNow("touch");
      },
      [intent, onTouchStart],
    );
    const handleFocus: FocusEventHandler<HTMLAnchorElement> = useCallback(
      (event) => {
        onFocus?.(event);
        if (!event.defaultPrevented) intent.runNow("focus");
      },
      [intent, onFocus],
    );
    const handleBlur: FocusEventHandler<HTMLAnchorElement> = useCallback(
      (event) => {
        onBlur?.(event);
        if (!event.defaultPrevented) intent.cancel();
      },
      [intent, onBlur],
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
          target === "_blank" ||
          (download !== undefined && download !== false) ||
          reloadDocument ||
          !sameOrigin
        ) {
          intent.cancel();
          return;
        }

        event.preventDefault();
        intent.runNow("click");
        navigationPendingRef.current = true;
        const navigation = navigate(to, {
          replace: replace ?? locationHref(location) === normalizedHref(href),
          ...(relative === undefined ? {} : { relative }),
          ...(state === undefined ? {} : { state }),
          ...(preventScrollReset === undefined ? {} : { preventScrollReset }),
          ...(viewTransition === undefined ? {} : { viewTransition }),
          ...(defaultShouldRevalidate === undefined ? {} : { defaultShouldRevalidate }),
          ...(mask === undefined ? {} : { mask }),
        });
        void Promise.resolve(navigation).then(
          () => {
            intent.commit();
            navigationPendingRef.current = false;
          },
          () => {
            intent.cancel();
            navigationPendingRef.current = false;
          },
        );
      },
      [
        defaultShouldRevalidate,
        download,
        href,
        intent,
        location,
        mask,
        navigate,
        onClick,
        preventScrollReset,
        relative,
        reloadDocument,
        replace,
        sameOrigin,
        state,
        target,
        to,
        viewTransition,
      ],
    );

    return (
      <>
        <Link
          {...linkProps}
          ref={ref}
          to={to}
          prefetch="none"
          {...(relative === undefined ? {} : { relative })}
          {...(reloadDocument === undefined ? {} : { reloadDocument })}
          {...(replace === undefined ? {} : { replace })}
          {...(state === undefined ? {} : { state })}
          {...(preventScrollReset === undefined ? {} : { preventScrollReset })}
          {...(viewTransition === undefined ? {} : { viewTransition })}
          {...(defaultShouldRevalidate === undefined
            ? {}
            : { defaultShouldRevalidate })}
          {...(mask === undefined ? {} : { mask })}
          {...(target === undefined ? {} : { target })}
          {...(download === undefined ? {} : { download })}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onPointerDown={handlePointerDown}
          onTouchStart={handleTouchStart}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onClick={handleClick}
        />
        {frameworkPrefetch.prefetchLinks}
      </>
    );
  },
);

function normalizedHref(href: string): string {
  const url = new URL(href, "http://cogni.local");
  return `${url.pathname}${url.search}${url.hash}`;
}

function locationHref(location: {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
}): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

function isSameOrigin(href: string): boolean {
  if (typeof window === "undefined") return href.startsWith("/");
  return new URL(href, window.location.href).origin === window.location.origin;
}
