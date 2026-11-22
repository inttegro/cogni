"use client";

import Link from "next/link";
import {
  forwardRef,
  useCallback,
  type ComponentPropsWithoutRef,
  type FocusEventHandler,
  type MouseEventHandler,
  type PointerEventHandler,
  type TouchEventHandler,
} from "react";
import {
  useNextRouteIntent,
  type UseNextRouteIntentOptions,
} from "./use-next-route-intent";

type LinkProps = ComponentPropsWithoutRef<typeof Link>;

export interface PredictiveLinkProps
  extends
    Omit<LinkProps, "href" | "prefetch">,
    Omit<UseNextRouteIntentOptions, "href" | "key"> {
  readonly href: string;
  readonly predictionKey?: string;
  /** Next's own viewport prefetch is disabled by default to prevent duplicate work. */
  readonly prefetch?: LinkProps["prefetch"];
}

/** A Next Link whose intent prefetch is admitted, measured, and reused by Cogni. */
export const PredictiveLink = forwardRef<HTMLAnchorElement, PredictiveLinkProps>(
  function PredictiveLink(
    {
      href,
      prefetch = false,
      enabled,
      hoverDelayMs,
      maxDeferMs,
      prefetchRoute,
      onInvalidate,
      predictionKey,
      policy,
      destination,
      probability,
      horizonMs,
      cost,
      priority,
      estimatedBytes,
      onPointerEnter,
      onPointerLeave,
      onPointerDown,
      onTouchStart,
      onFocus,
      onBlur,
      onClick,
      onNavigate,
      target,
      download,
      ...linkProps
    },
    ref,
  ) {
    const intent = useNextRouteIntent({
      href,
      probability,
      horizonMs,
      ...(enabled === undefined ? {} : { enabled }),
      ...(hoverDelayMs === undefined ? {} : { hoverDelayMs }),
      ...(maxDeferMs === undefined ? {} : { maxDeferMs }),
      ...(prefetchRoute === undefined ? {} : { prefetchRoute }),
      ...(onInvalidate === undefined ? {} : { onInvalidate }),
      ...(predictionKey === undefined ? {} : { key: predictionKey }),
      ...(policy === undefined ? {} : { policy }),
      ...(destination === undefined ? {} : { destination }),
      ...(cost === undefined ? {} : { cost }),
      ...(priority === undefined ? {} : { priority }),
      ...(estimatedBytes === undefined ? {} : { estimatedBytes }),
    });

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
        if (event.defaultPrevented) {
          intent.cancel();
          return;
        }

        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          target === "_blank" ||
          (download !== undefined && download !== false)
        ) {
          intent.cancel();
          return;
        }

        intent.runNow("click");
      },
      [download, intent, onClick, target],
    );
    const handleNavigate: NonNullable<LinkProps["onNavigate"]> = useCallback(
      (event) => {
        let prevented = false;
        onNavigate?.({
          preventDefault: () => {
            prevented = true;
            event.preventDefault();
          },
        });

        if (prevented) {
          intent.cancel();
          return;
        }
        intent.commit();
      },
      [intent, onNavigate],
    );

    return (
      <Link
        {...linkProps}
        ref={ref}
        href={href}
        prefetch={prefetch}
        target={target}
        download={download}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        onTouchStart={handleTouchStart}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onClick={handleClick}
        onNavigate={handleNavigate}
      />
    );
  },
);
