/**
 * Berserk WASM adapter for TypeScript web applications.
 *
 * The consuming application only needs this file. The worker, wasm-bindgen
 * loader, and WASM binary are fetched from the official Berserk-web repository.
 */

export const WASM_URL =
  "https://media.githubusercontent.com/media/official-knightly/Berserk-web/main/engine/berserk_bg.wasm";

const WORKER_MODULE_URL =
  "https://raw.githubusercontent.com/official-knightly/Berserk-web/main/engine/engine-worker.js";

export type Candidate = {
  rank: number;
  depth: number;
  uci: string;
  pv: string[];
  scoreCp: number;
  mate: number | null;
};

export type SearchResult = {
  bestmove: string;
  scoreCp: number;
  depth: number;
  nodes: string;
  candidates: Candidate[];
};

export type EngineStatus = "idle" | "loading" | "ready" | "error";

type StatusUpdate = {
  status: EngineStatus;
  progress: number;
  error?: string;
};

type Listener = (status: StatusUpdate) => void;

type PendingSearch = {
  resolve: (result: SearchResult) => void;
  reject: (error: Error) => void;
};

class BerserkEngine {
  private worker: Worker | null = null;
  private workerBootstrapUrl: string | null = null;
  private pending = new Map<number, PendingSearch>();
  private seq = 0;
  private queue: Promise<unknown> = Promise.resolve();

  status: EngineStatus = "idle";
  progress = 0;
  error?: string;
  private listeners = new Set<Listener>();
  ready!: Promise<void>;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener({
      status: this.status,
      progress: this.progress,
      error: this.error,
    });
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const update: StatusUpdate = {
      status: this.status,
      progress: this.progress,
      error: this.error,
    };
    this.listeners.forEach((listener) => listener(update));
  }

  private createRemoteWorker(): Worker {
    // Worker() itself must use the page's origin. This tiny same-origin Blob
    // worker imports the official module worker from Berserk-web. Its relative
    // import of berserk.js therefore continues to resolve from GitHub.
    const bootstrap = new Blob(
      ["import " + JSON.stringify(WORKER_MODULE_URL) + ";"],
      { type: "text/javascript" },
    );
    const blobUrl = URL.createObjectURL(bootstrap);

    try {
      const worker = new Worker(blobUrl, {
        type: "module",
        name: "Berserk-WASM",
      });
      this.workerBootstrapUrl = blobUrl;
      return worker;
    } catch (error) {
      URL.revokeObjectURL(blobUrl);
      throw error;
    }
  }

  private releaseWorkerBootstrap(): void {
    if (!this.workerBootstrapUrl) return;
    URL.revokeObjectURL(this.workerBootstrapUrl);
    this.workerBootstrapUrl = null;
  }

  start(): Promise<void> {
    if (this.worker) return this.ready;

    if (typeof window === "undefined" || typeof Worker === "undefined") {
      const error = new Error("Berserk WASM can only run in a browser that supports Web Workers.");
      this.status = "error";
      this.error = error.message;
      this.emit();
      return Promise.reject(error);
    }

    this.status = "loading";
    this.progress = 0;
    this.error = undefined;
    this.emit();

    this.ready = new Promise<void>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = this.createRemoteWorker();
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        this.fail(error.message);
        reject(error);
        return;
      }

      this.worker = worker;

      worker.onmessage = (event: MessageEvent) => {
        const message = event.data || {};

        if (message.type === "ready") {
          this.status = "ready";
          this.progress = 1;
          this.releaseWorkerBootstrap();
          this.emit();
          resolve();
          return;
        }

        if (message.type === "progress") {
          this.progress = message.total
            ? Math.min(1, message.loaded / message.total)
            : Math.min(0.95, message.loaded / 64_000_000);
          this.emit();
          return;
        }

        if (message.type === "init-error") {
          const error = new Error(message.error || "Berserk WASM initialization failed.");
          this.fail(error.message);
          this.releaseWorkerBootstrap();
          reject(error);
          return;
        }

        if (message.type === "result" || message.type === "search-error") {
          const pending = this.pending.get(message.id);
          if (!pending) return;

          this.pending.delete(message.id);
          if (message.type === "search-error") {
            pending.reject(new Error(message.error || "Berserk search failed."));
          } else {
            pending.resolve(message as SearchResult);
          }
        }
      };

      worker.onerror = (event: ErrorEvent) => {
        const error = new Error(event.message || "Berserk worker failed to load.");
        this.fail(error.message);
        this.releaseWorkerBootstrap();
        reject(error);
      };

      worker.onmessageerror = () => {
        const error = new Error("Berserk worker returned a message that could not be decoded.");
        this.fail(error.message);
        this.releaseWorkerBootstrap();
        reject(error);
      };

      worker.postMessage({ type: "init", wasmUrl: WASM_URL });
    });

    // Avoid an unhandled-rejection warning when callers subscribe to status
    // updates first and start the engine later.
    this.ready.catch(() => undefined);
    return this.ready;
  }

  private fail(message: string): void {
    this.status = "error";
    this.error = message;
    this.emit();

    this.pending.forEach((pending) => pending.reject(new Error(message)));
    this.pending.clear();
  }

  /**
   * Searches are serialized because the WASM search runs synchronously inside
   * the worker. The result contains the best move and the MultiPV candidates.
   */
  search(fen: string, milliseconds: number, multiPV = 1): Promise<SearchResult> {
    const run = async (): Promise<SearchResult> => {
      await this.start();

      if (!this.worker) {
        throw new Error("Berserk worker is unavailable.");
      }

      const id = ++this.seq;
      return new Promise<SearchResult>((resolve, reject) => {
        this.pending.set(id, { resolve, reject });

        this.worker!.postMessage({
          type: "search",
          id,
          fen,
          milliseconds: Math.max(100, Math.min(10_000, Math.round(milliseconds))),
          multiPV: Math.max(1, Math.min(8, Math.round(multiPV))),
        });
      });
    };

    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.releaseWorkerBootstrap();

    const error = new Error("Berserk engine stopped.");
    this.pending.forEach((pending) => pending.reject(error));
    this.pending.clear();

    this.status = "idle";
    this.progress = 0;
    this.error = undefined;
    this.emit();
  }
}

export const engine = new BerserkEngine();
