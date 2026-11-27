import { type ReactNode, useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { ActivosScreen } from "./Activos";
import { ContabilidadScreen } from "./Contabilidad";
import { ConsentGate } from "./Datos";
import { EconomiaScreen } from "./Economia";
import { CapacitacionScreen, ComunidadScreen, NoticiasScreen, TiendaScreen } from "./Ecosistema";
import { ExpedienteScreen } from "./Expediente";
import { ExtensionScreen } from "./Extension";
import { OnboardingWizard } from "./Onboarding";
import { PasturasScreen } from "./Pasturas";
import { PersonalScreen } from "./Personal";
import { ProduccionScreen } from "./Produccion";
import { ReproduccionScreen } from "./Reproduccion";
import { HAS_ROLE_HOME, RoleHome } from "./RoleHome";
import { SanidadScreen } from "./Sanidad";
import { Splash } from "./Splash";
import { StaffGate } from "./Tecnigan";
import { TrazabilidadScreen } from "./Trazabilidad";
import { VentasScreen } from "./Ventas";
import { AnimalsScreen } from "./animals";
import { api } from "./lib/api";
import { isDemoOrg } from "./lib/scope";
import { canSeeModule } from "./modules";
import { ModuleProto } from "./proto";
import { Home, Login, type ModuleKey, Shell } from "./screens";
import { SettingsScreen } from "./settings";
import { SETUP_MODULES, useSetup } from "./setup";
import { useApp } from "./state";
import { SuppliesScreen } from "./supplies";

const SCREENS: Partial<Record<ModuleKey, (go: (m: ModuleKey) => void) => ReactNode>> = {
  expediente: (go) => <ExpedienteScreen onModule={go} />,
  trazabilidad: (go) => <TrazabilidadScreen onModule={go} />,
  animales: () => <AnimalsScreen />,
  compras: () => <SuppliesScreen />,
  configuracion: () => <SettingsScreen />,
  produccion: () => <ProduccionScreen />,
  reproduccion: () => <ReproduccionScreen />,
  sanidad: () => <SanidadScreen />,
  pasturas: () => <PasturasScreen />,
  economia: () => <EconomiaScreen />,
  asistencia: () => <ExtensionScreen />,
  ventas: () => <VentasScreen />,
  personal: () => <PersonalScreen />,
  activos: () => <ActivosScreen />,
  contabilidad: () => <ContabilidadScreen />,
  noticias: () => <NoticiasScreen />,
  capacitacion: () => <CapacitacionScreen />,
  tienda: () => <TiendaScreen />,
  comunidad: () => <ComunidadScreen />,
};

export function App() {
  const { session, role, acceptInvitation, notify, booting } = useApp();
  const [module, setModule] = useState<ModuleKey>("inicio");
  /** Cambio de pantalla con transición suave del navegador (View Transitions), si la hay. */
  const go = useCallback((m: ModuleKey) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (!doc.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setModule(m);
      return;
    }
    doc.startViewTransition(() => flushSync(() => setModule(m)));
  }, []);
  const [syncOpen, setSyncOpen] = useState(false);
  const setup = useSetup();

  // Invitación pendiente de alguien que ya tenía cuenta: se acepta apenas inicia sesión.
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al cambiar de usuario
  useEffect(() => {
    if (!session) return;
    // El enlace puede abrirse con la sesión ya iniciada.
    let code: string | null = new URLSearchParams(location.search).get("invitacion");
    try {
      code = sessionStorage.getItem("gg.invite") ?? code;
      sessionStorage.removeItem("gg.invite");
    } catch {
      /* sin almacenamiento de sesión */
    }
    if (new URLSearchParams(location.search).has("invitacion"))
      history.replaceState(null, "", location.pathname);
    if (!code) return;
    // Quien se registró con la invitación ya la usó: la vista previa falla y no se hace nada.
    const pending = code;
    void api
      .previewInvitation(pending)
      .then(() => acceptInvitation(pending))
      .then(
        (r) => {
          if (r.ok) notify("Invitación aceptada: ya tiene acceso a la nueva ganadería.", "ok");
          else notify(r.message, "warn");
        },
        () => undefined,
      );
  }, [session?.userId]);

  if (booting) return <Splash />;
  if (!session) return <Login />;
  if (session.onboardingPending) return <OnboardingWizard />;
  // Sin ganaderías: personal del gremio (Secretario Técnico) o una cuenta aún sin invitación.
  if (session.memberships.length === 0) return <StaffGate />;

  // Mientras falte la configuración mínima (finca, área, ubicación y animales) solo se abren
  // Inicio y los módulos que sirven para completarla. La cuenta demostrativa no se bloquea.
  const locked =
    !setup.loading && !setup.ready && !isDemoOrg(session.memberships[0]?.organizationName);
  // Si el rol no permite el módulo (p. ej. un veterinario y Economía), se muestra Inicio.
  const shown: ModuleKey =
    canSeeModule(module, role) && (!locked || SETUP_MODULES.includes(module)) ? module : "inicio";

  return (
    <>
      {/* Protocolo de datos: la autorización se pide antes de seguir registrando. */}
      <ConsentGate />
      <Shell
        module={shown}
        onModule={go}
        syncOpen={syncOpen}
        onSyncOpen={setSyncOpen}
        locked={locked}
      >
        {shown === "inicio" && !locked && role && HAS_ROLE_HOME.includes(role) ? (
          <RoleHome onOpenSync={() => setSyncOpen(true)} onModule={go} />
        ) : shown === "inicio" ? (
          <Home onOpenSync={() => setSyncOpen(true)} onModule={go} setup={locked ? setup : null} />
        ) : (
          (SCREENS[shown] ?? (() => <ModuleProto module={shown} />))(go)
        )}
      </Shell>
    </>
  );
}
