import { useState } from "react";
import { AnimalsScreen } from "./animals";
import { Home, Login, type ModuleKey, ModulePreview, Shell } from "./screens";
import { useApp } from "./state";
import { SuppliesScreen } from "./supplies";

export function App() {
  const { session } = useApp();
  const [module, setModule] = useState<ModuleKey>("inicio");
  const [syncOpen, setSyncOpen] = useState(false);

  if (!session) return <Login />;

  return (
    <Shell module={module} onModule={setModule} syncOpen={syncOpen} onSyncOpen={setSyncOpen}>
      {module === "inicio" && <Home onOpenSync={() => setSyncOpen(true)} onModule={setModule} />}
      {module === "animales" && <AnimalsScreen />}
      {module === "compras" && <SuppliesScreen />}
      {module !== "inicio" && module !== "animales" && module !== "compras" && (
        <ModulePreview module={module} />
      )}
    </Shell>
  );
}
