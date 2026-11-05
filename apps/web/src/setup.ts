import { useEffect, useState } from "react";
import { localdb } from "./lib/localdb";
import { type SetupState, setupSteps } from "./lib/setupSteps";
import { useApp } from "./state";

export { SETUP_MODULES, type SetupState, type SetupStep, setupSteps } from "./lib/setupSteps";

export function useSetup(): SetupState {
  const { orgId, dataVersion } = useApp();
  const [state, setState] = useState<SetupState>({ loading: true, ready: false, steps: [] });

  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  useEffect(() => {
    let alive = true;
    void Promise.all([localdb.listFarms(orgId), localdb.counts(orgId)])
      .then(([farms, inv]) => {
        if (!alive) return;
        const steps = setupSteps(farms, inv.total);
        setState({ loading: false, ready: steps.every((s) => s.done), steps });
      })
      .catch(() => {
        // Si la copia local falla, no se deja a nadie encerrado en la configuración.
        if (alive) setState({ loading: false, ready: true, steps: [] });
      });
    return () => {
      alive = false;
    };
  }, [orgId, dataVersion]);

  return state;
}
