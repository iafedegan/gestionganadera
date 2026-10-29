import type { WorkerApi } from "./localdb.worker";

export type {
  AnimalDetail,
  Keystore,
  LocalAnimal,
  OutboxItem,
  SyncState,
} from "./localdb.worker";

type Awaited<T> = T extends Promise<infer U> ? U : T;
type Remote = {
  [K in keyof WorkerApi]: (
    ...args: Parameters<WorkerApi[K]>
  ) => Promise<Awaited<ReturnType<WorkerApi[K]>>>;
};

const worker = new Worker(new URL("./localdb.worker.ts", import.meta.url), { type: "module" });
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

worker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
  const p = pending.get(e.data.id);
  if (!p) return;
  pending.delete(e.data.id);
  if (e.data.error !== undefined) p.reject(new Error(e.data.error));
  else p.resolve(e.data.result);
};

/** Cliente tipado de la base local: cada método viaja al Worker, donde viven SQLite y la clave. */
export const localdb = new Proxy({} as Remote, {
  get:
    (_t, method: string) =>
    (...args: unknown[]) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, method, args });
      }),
});
