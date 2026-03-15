import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { RendererEventChannel, RendererEventPayloadMap, WindowIpcRenderer } from '../shared/ipc';

const api = {
  invoke: (channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args) as Promise<unknown>,
  on: <K extends RendererEventChannel>(
    channel: K,
    func: RendererEventPayloadMap[K] extends undefined
      ? () => void
      : (payload: RendererEventPayloadMap[K]) => void,
  ) => {
    const subscription = (_event: IpcRendererEvent, payload?: RendererEventPayloadMap[K]) => {
      if (payload === undefined) {
        (func as () => void)();
        return;
      }

      (func as (value: RendererEventPayloadMap[K]) => void)(payload);
    };
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
  send: (channel: string, ...args: unknown[]) => {
    ipcRenderer.send(channel, ...args);
  },
} as WindowIpcRenderer;

contextBridge.exposeInMainWorld('ipcRenderer', api);
