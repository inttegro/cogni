"use client";

import { useCogniScheduler } from "@inttegro/cogni-react";
import { useEffect, useRef } from "react";

import { createCogniDevtools } from "./session";

export interface CogniDevtoolsProps {
  initialOpen?: boolean;
  maxEntries?: number;
  maxTraces?: number;
  bridge?: boolean;
}

export function CogniDevtools({
  initialOpen = false,
  maxEntries,
  maxTraces,
  bridge = true,
}: CogniDevtoolsProps) {
  const scheduler = useCogniScheduler();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const session = createCogniDevtools(scheduler, {
      ...(maxEntries === undefined ? {} : { maxEntries }),
      ...(maxTraces === undefined ? {} : { maxTraces }),
      bridge,
    });
    session.mount(container, { mode: "embedded", initialOpen });
    return () => session.dispose();
  }, [bridge, initialOpen, maxEntries, maxTraces, scheduler]);

  return <div ref={containerRef} data-cogni-devtools-root />;
}

export interface CogniDevtoolsConnectorProps {
  maxEntries?: number;
  maxTraces?: number;
}

export function CogniDevtoolsConnector({
  maxEntries,
  maxTraces,
}: CogniDevtoolsConnectorProps) {
  const scheduler = useCogniScheduler();

  useEffect(() => {
    const session = createCogniDevtools(scheduler, {
      ...(maxEntries === undefined ? {} : { maxEntries }),
      ...(maxTraces === undefined ? {} : { maxTraces }),
      bridge: true,
    });
    return () => session.dispose();
  }, [maxEntries, maxTraces, scheduler]);

  return null;
}
