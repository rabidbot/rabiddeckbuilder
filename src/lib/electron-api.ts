export interface ScryfallFetchResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface FileReadResult {
  ok: boolean;
  content?: string;
  error?: string;
}

export interface ElectronAPI {
  db: {
    run: (query: string, params?: unknown[]) => Promise<{ ok: boolean; error?: string }>;
    all: (query: string, params?: unknown[]) => Promise<{ ok: boolean; rows?: Record<string, unknown>[]; error?: string }>;
    exec: (sql: string) => Promise<{ ok: boolean; error?: string }>;
    save: () => Promise<{ ok: boolean; error?: string }>;
  };
  dialog: {
    openCsv: () => Promise<string | null>;
  };
  fs: {
    readFile: (filePath: string) => Promise<FileReadResult>;
  };
  scryfall: {
    fetchCard: (scryfallId: string) => Promise<ScryfallFetchResult>;
  };
  isElectron: boolean;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
