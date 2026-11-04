import { type ReactNode, useState } from "react";
import { ActivosScreen } from "./Activos";
import { AsistenciaScreen } from "./Asistencia";
import { ContabilidadScreen } from "./Contabilidad";
import { EconomiaScreen } from "./Economia";
import { OnboardingWizard } from "./Onboarding";
import { PasturasScreen } from "./Pasturas";
import { PersonalScreen } from "./Personal";
import { ProduccionScreen } from "./Produccion";
import { ReproduccionScreen } from "./Reproduccion";
import { SanidadScreen } from "./Sanidad";
import { VentasScreen } from "./Ventas";
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
  asistencia: () => <AsistenciaScreen />,
  ventas: () => <VentasScreen />,
  personal: () => <PersonalScreen />,
  activos: () => <ActivosScreen />,
  contabilidad: () => <ContabilidadScreen />,
};

export function App() {
  const { session } = useApp();
  const [module, setModule] = useState<ModuleKey>("inicio");
  const [syncOpen, setSyncOpen] = useState(false);

  if (!session) return <Login />;
  if (session.onboardingPending) return <OnboardingWizard />;

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
