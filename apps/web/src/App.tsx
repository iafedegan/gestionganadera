import { useState } from "react";
import { AnimalsScreen } from "./animals";
import { Home, Login, type ModuleKey, Placeholder, Shell } from "./screens";
import { useApp } from "./state";

export function App() {
  const { session } = useApp();
  const [module, setModule] = useState<ModuleKey>("inicio");
  const [syncOpen, setSyncOpen] = useState(false);

  if (!session) return <Login />;

  return (
    <Shell module={module} onModule={setModule} syncOpen={syncOpen} onSyncOpen={setSyncOpen}>
      {module === "inicio" && <Home onOpenSync={() => setSyncOpen(true)} onModule={setModule} />}
      {module === "animales" && <AnimalsScreen />}
      {module !== "inicio" && module !== "animales" && <Placeholder module={module} />}
    </Shell>
  );
}
