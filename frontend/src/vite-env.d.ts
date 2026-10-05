/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Python planner API. Defaults to http://localhost:8000. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
