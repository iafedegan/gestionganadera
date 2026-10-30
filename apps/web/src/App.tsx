import { type ReactNode, useState } from "react";
import { EconomiaScreen } from "./Economia";
import { PasturasScreen } from "./Pasturas";
import { ProduccionScreen } from "./Produccion";
import { ReproduccionScreen } from "./Reproduccion";
import { SanidadScreen } from "./Sanidad";
import { AnimalsScreen } from "./animals";
import { ModuleProto } from "./proto";
import { Home, Login, type ModuleKey, Shell } from "./screens";
import { SettingsScreen } from "./settings";
import { useApp } from "./state";
import { SuppliesScreen } from "./supplies";

const SCREENS: Partial<Record<ModuleKey, () => ReactNode>> = {
  animales: () => <AnimalsScreen />,
  compras: () => <SuppliesScreen />,
  configuracion: () => <SettingsScreen />,
  produccion: () => <ProduccionScreen />,
  reproduccion: () => <ReproduccionScreen />,
  sanidad: () => <SanidadScreen />,
  pasturas: () => <PasturasScreen />,
  economia: () => <EconomiaScreen />,
};

export function App() {
  const { session } = useApp();
  const [module, setModule] = useState<ModuleKey>("inicio");
  const [syncOpen, setSyncOpen] = useState(false);

  if (!session) return <Login />;

  return (
    <Shell module={module} onModule={setModule} syncOpen={syncOpen} onSyncOpen={setSyncOpen}>
      {module === "inicio" ? (
        <Home onOpenSync={() => setSyncOpen(true)} onModule={setModule} />
      ) : (
        (SCREENS[module] ?? (() => <ModuleProto module={module} />))()
      )}
    </Shell>
  );
}
