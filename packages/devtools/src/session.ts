import type { PredictionScheduler } from "@inttegro/cogni-client";

import { installCogniDevtoolsBridge } from "./bridge";
import { mountCogniDevtoolsPanel } from "./panel";
import { CogniDevtoolsRecorder } from "./recorder";
import type { CogniDevtoolsRecorderOptions } from "./recorder";
import type {
  MountedCogniDevtoolsPanel,
  MountCogniDevtoolsPanelOptions,
} from "./panel";

export interface CreateCogniDevtoolsOptions extends CogniDevtoolsRecorderOptions {
  bridge?: boolean;
}

export interface CogniDevtoolsSession {
  recorder: CogniDevtoolsRecorder;
  mount(
    container: HTMLElement,
    options?: Omit<MountCogniDevtoolsPanelOptions, "store">,
  ): MountedCogniDevtoolsPanel;
  dispose(): void;
}

export function createCogniDevtools(
  scheduler: PredictionScheduler,
  options: CreateCogniDevtoolsOptions = {},
): CogniDevtoolsSession {
  const recorder = new CogniDevtoolsRecorder(scheduler, options);
  const disposeBridge =
    options.bridge === false || typeof window === "undefined"
      ? () => undefined
      : installCogniDevtoolsBridge(recorder);
  const panels = new Set<MountedCogniDevtoolsPanel>();

  return {
    recorder,
    mount(container, panelOptions = {}) {
      const panel = mountCogniDevtoolsPanel(container, {
        ...panelOptions,
        store: recorder,
      });
      panels.add(panel);
      return {
        ...panel,
        destroy() {
          panel.destroy();
          panels.delete(panel);
        },
      };
    },
    dispose() {
      for (const panel of panels) panel.destroy();
      panels.clear();
      disposeBridge();
      recorder.dispose();
    },
  };
}
