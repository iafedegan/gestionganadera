import { type ReactNode, useEffect, useState } from "react";
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
import { canSeeModule } from "./modules";
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
  const { session, role, acceptInvitation, notify, syncNow } = useApp();
  const [module, setModule] = useState<ModuleKey>("inicio");
  const [syncOpen, setSyncOpen] = useState(false);

  // Invitación pendiente de alguien que ya tenía cuenta: se acepta apenas inicia sesión.
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al cambiar de usuario
  useEffect(() => {
    if (!session) return;
    let code: string | null = null;
    try {
      code = sessionStorage.getItem("gg.invite");
      sessionStorage.removeItem("gg.invite");
    } catch {
      /* sin almacenamiento de sesión */
    }
    if (new URLSearchParams(location.search).has("invitacion"))
      history.replaceState(null, "", location.pathname);
    if (!code) return;
    // Quien se registró con la invitación ya está dentro: no hay nada más que aceptar.
    if (session.memberships.length === 1 && session.memberships[0]?.role !== "propietario") return;
    void acceptInvitation(code).then((r) => {
      if (r.ok) {
        notify("Invitación aceptada: ya tiene acceso a la nueva ganadería.", "ok");
        void syncNow();
      } else notify(r.message, "warn");
    });
  }, [session?.userId]);

  if (!session) return <Login />;
  if (session.onboardingPending) return <OnboardingWizard />;

  // Si el rol no permite el módulo (p. ej. un veterinario y Economía), se muestra Inicio.
  const shown: ModuleKey = canSeeModule(module, role) ? module : "inicio";

  return (
    <Shell module={shown} onModule={setModule} syncOpen={syncOpen} onSyncOpen={setSyncOpen}>
      {shown === "inicio" ? (
        <Home onOpenSync={() => setSyncOpen(true)} onModule={setModule} />
      ) : (
        (SCREENS[shown] ?? (() => <ModuleProto module={shown} />))()
      )}
    </Shell>
  );
}
