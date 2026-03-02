/// <reference types="vite/client" />

interface IQwQNTPlugin {
  name: string;
  qwqnt?: {
    name?: string;
    icon?: string;
    inject?: {
      main?: string;
      renderer?: string;
      preload?: string;
    };
  };
}

declare namespace RendererEvents {
  const onLogin: (callback: (uid?: string) => void) => void;
  const onSettingsWindowCreated: (callback: () => void) => void;
  const onSettingsWindowCreatedOnce: (callback: () => void) => void;
  const onMessageWindowCreated: (callback: () => void) => void;
  const onMessageWindowCreatedOnce: (callback: () => void) => void;
}

declare namespace PluginSettings {
  interface ICommon {
    readConfig: <T>(id: string, defaultConfig?: T) => T;
    writeConfig: <T>(id: string, newConfig: T) => boolean;
    openPath: (path: string) => void;
    openExternal: (url: string) => void;
  }

  interface IRenderer extends ICommon {
    registerPluginSettings: (packageJson: IQwQNTPlugin) => Promise<HTMLDivElement>;
  }

  const main: ICommon;
  const preload: ICommon;
  const renderer: IRenderer;
}

declare global {
  interface Window {
    anti_recall: {
      clearDb: () => Promise<void>;
      getNowConfig: <T = unknown>() => Promise<T>;
      getStorageStatus: () => Promise<{ effective: 'json' | 'level'; requested: 'json' | 'ldb'; error?: string }>;
      saveConfig: <T = unknown>(newConfig: T) => Promise<void>;
      repatchCss: (callback: () => void) => void;
      recallTip: (callback: (_event: unknown, msgId: string) => void) => void;
      recallTipList: (callback: (_event: unknown, msgIds: string[]) => void) => void;
    };
  }
}

export {};
