const out = document.getElementById("out") as HTMLPreElement;
const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });

function call(cmd: "run" | "reset"): Promise<unknown> {
  return new Promise((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) =>
      e.data.error ? reject(new Error(e.data.error)) : resolve(e.data);
    worker.onerror = (e) => reject(new Error(e.message));
    worker.postMessage({ cmd });
  });
}

async function go(cmd: "run" | "reset") {
  out.textContent = "Ejecutando…";
  try {
    const res = await call(cmd);
    (window as unknown as { __s0: unknown }).__s0 = res;
    out.textContent = JSON.stringify(res, null, 2);
  } catch (err) {
    (window as unknown as { __s0: unknown }).__s0 = { error: String(err) };
    out.textContent = `Error: ${err instanceof Error ? err.stack : String(err)}`;
  }
}

document.getElementById("run")?.addEventListener("click", () => go("run"));
document.getElementById("reset")?.addEventListener("click", () => go("reset"));
