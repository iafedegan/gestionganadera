import type { OnboardingRequest, RegisterRequest, Role, SessionDto } from "@ganaderia/contracts";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ApiError, NetworkError, api } from "./lib/api";
import { localdb } from "./lib/localdb";
import { isDemoOrg, setDataScope } from "./lib/scope";
import {
  clearKeystore,
  leaseActive,
  loadKeystore,
  loadSession,
  saveKeystore,
  saveSession,
} from "./lib/session";
import { type SyncOutcome, runSync } from "./lib/sync";

export interface Counts {
  pendiente: number;
  rechazado: number;
  conflicto: number;
}

export interface Toast {
  id: number;
  message: string;
  tone: "ok" | "info" | "warn";
}

interface AppState {
  toasts: Toast[];
  notify(message: string, tone?: Toast["tone"]): void;
  dismissToast(id: number): void;
  session: SessionDto | null;
  orgId: string;
  role: Role | null;
  online: boolean;
  syncing: boolean;
  lastSync: string | null;
  syncNotice: string | null;
  sessionExpired: boolean;
  counts: Counts;
  /** Se incrementa cuando cambian los datos locales; las pantallas lo usan para releer. */
  dataVersion: number;
  login(
    email: string,
    password: string,
  ): Promise<{ ok: true; notice?: string } | { ok: false; message: string }>;
  register(input: RegisterRequest): Promise<{ ok: true } | { ok: false; message: string }>;
  completeOnboarding(
    input: OnboardingRequest,
  ): Promise<{ ok: true } | { ok: false; message: string }>;
  logout(): Promise<void>;
  syncNow(): Promise<SyncOutcome | null>;
  refresh(): Promise<void>;
}

const Ctx = createContext<AppState | null>(null);
export const useApp = (): AppState => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp fuera de AppProvider");
  return v;
};

const ZERO: Counts = { pendiente: 0, rechazado: 0, conflicto: 0 };

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionDto | null>(null);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [counts, setCounts] = useState<Counts>(ZERO);
  const [dataVersion, setDataVersion] = useState(0);
  const busy = useRef(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);
  const notify = useCallback(
    (message: string, tone: Toast["tone"] = "ok") => {
      const id = toastId.current++;
      setToasts((t) => [...t.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismissToast(id), 5000);
    },
    [dismissToast],
  );

  const orgId = session?.memberships[0]?.organizationId ?? "";
  const role = session?.memberships[0]?.role ?? null;
  // Antes de pintar cualquier pantalla: datos de ejemplo solo en la organización demostrativa.
  setDataScope(orgId, isDemoOrg(session?.memberships[0]?.organizationName));

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setCounts(await localdb.outboxCount(orgId));
    setDataVersion((v) => v + 1);
  }, [orgId]);

  const syncNow = useCallback(async (): Promise<SyncOutcome | null> => {
    if (!orgId || busy.current) return null;
    busy.current = true;
    setSyncing(true);
    try {
      const out = await runSync(orgId);
      if (out.kind === "ok") {
        setOnline(true);
        setSessionExpired(false);
        setLastSync(out.at);
        const parts = [`${out.sent} enviados`, `${out.received} recibidos`];
        if (out.rejected + out.conflicts > 0)
          parts.push(`${out.rejected + out.conflicts} requieren revisión`);
        setSyncNotice(parts.join(" · "));
        // Con conexión se renueva el permiso de operación sin conexión (72 h).
        api
          .me()
          .then((s) => {
            saveSession(s);
            setSession(s);
          })
          .catch(() => undefined);
      } else if (out.kind === "offline") {
        setOnline(false);
        setSyncNotice("Sin conexión. Los registros quedan guardados en este dispositivo.");
      } else if (out.kind === "session_expired") {
        setSessionExpired(true);
        setSyncNotice("La sesión caducó. Vuelva a iniciar sesión para sincronizar.");
      } else {
        setSyncNotice(`No se pudo sincronizar: ${out.message}`);
      }
      await refresh();
      return out;
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, [orgId, refresh]);

  const enter = useCallback(
    async (s: SessionDto, password: string): Promise<string | undefined> => {
      let notice: string | undefined;
      let store = loadKeystore(s.userId);
      try {
        const res = await localdb.unlock({ userId: s.userId, password, keystore: store });
        store = res.keystore;
      } catch (err) {
        if (!(err instanceof Error) || err.message !== "CLAVE_INCORRECTA") throw err;
        // La contraseña cambió en el servidor: la clave local ya no se puede abrir.
        clearKeystore(s.userId);
        const res = await localdb.unlock({ userId: s.userId, password, keystore: null });
        store = res.keystore;
        await localdb.wipe();
        notice = "La contraseña cambió: se reinició la copia local de este dispositivo.";
      }
      saveKeystore(s.userId, store);
      saveSession(s);
      setSession(s);
      setSessionExpired(false);
      return notice;
    },
    [],
  );

  const login: AppState["login"] = useCallback(
    async (rawEmail, password) => {
      const email = rawEmail.trim().toLowerCase();
      try {
        const s = await api.login(email, password);
        const notice = await enter(s, password);
        setOnline(true);
        return notice ? { ok: true as const, notice } : { ok: true as const };
      } catch (err) {
        if (err instanceof ApiError) return { ok: false as const, message: err.message };
        if (!(err instanceof NetworkError)) {
          return {
            ok: false as const,
            message: err instanceof Error ? err.message : "Error inesperado.",
          };
        }
      }
      // Sin conexión: desbloqueo local con la contraseña, dentro del permiso de 72 h.
      const stored = loadSession(email);
      if (!stored || !loadKeystore(stored.userId)) {
        return {
          ok: false as const,
          message:
            "Sin conexión. La primera vez que use este dispositivo debe conectarse para iniciar sesión.",
        };
      }
      if (!leaseActive(stored)) {
        return {
          ok: false as const,
          message: "El permiso para trabajar sin conexión venció (72 h). Conéctese para renovarlo.",
        };
      }
      try {
        const res = await localdb.unlock({
          userId: stored.userId,
          password,
          keystore: loadKeystore(stored.userId),
        });
        saveKeystore(stored.userId, res.keystore);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "CLAVE_INCORRECTA")
          return { ok: false as const, message: "Contraseña incorrecta." };
        if (msg.startsWith("ALMACENAMIENTO"))
          return {
            ok: false as const,
            message: "La aplicación ya está abierta en otra pestaña o ventana.",
          };
        return { ok: false as const, message: "No se pudo abrir la copia local." };
      }
      setSession(stored);
      setOnline(false);
      return {
        ok: true as const,
        notice: "Modo sin conexión: los cambios se enviarán al reconectar.",
      };
    },
    [enter],
  );

  /** Crea la cuenta en el servidor y entra con ella, igual que un inicio de sesión. */
  const register: AppState["register"] = useCallback(
    async (input) => {
      try {
        const s = await api.register({ ...input, email: input.email.trim().toLowerCase() });
        await enter(s, input.password);
        setOnline(true);
        return { ok: true as const };
      } catch (err) {
        if (err instanceof ApiError) return { ok: false as const, message: err.message };
        if (err instanceof NetworkError)
          return {
            ok: false as const,
            message: "Necesita conexión a internet para crear la cuenta.",
          };
        return {
          ok: false as const,
          message: err instanceof Error ? err.message : "Error inesperado.",
        };
      }
    },
    [enter],
  );

  const completeOnboarding: AppState["completeOnboarding"] = useCallback(async (input) => {
    try {
      const s = await api.onboarding(input);
      saveSession(s);
      setSession(s);
      return { ok: true as const };
    } catch (err) {
      if (err instanceof ApiError) return { ok: false as const, message: err.message };
      return {
        ok: false as const,
        message: "Sin conexión: termine la configuración cuando vuelva la señal.",
      };
    }
  }, []);

  const logout = useCallback(async () => {
    await localdb.lock();
    api.logout().catch(() => undefined);
    setSession(null);
    setCounts(ZERO);
    setLastSync(null);
    setSyncNotice(null);
  }, []);

  // Sincroniza al entrar y cuando el navegador recupera la red.
  const entered = useRef<string | null>(null);
  useEffect(() => {
    if (!session) {
      entered.current = null;
      return;
    }
    if (entered.current === session.userId) return;
    entered.current = session.userId;
    void refresh().then(() => syncNow());
  }, [session, refresh, syncNow]);

  useEffect(() => {
    const on = () => void syncNow();
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [syncNow]);

  const value = useMemo<AppState>(
    () => ({
      toasts,
      notify,
      dismissToast,
      session,
      orgId,
      role,
      online,
      syncing,
      lastSync,
      syncNotice,
      sessionExpired,
      counts,
      dataVersion,
      login,
      register,
      completeOnboarding,
      logout,
      syncNow,
      refresh,
    }),
    [
      toasts,
      notify,
      dismissToast,
      session,
      orgId,
      role,
      online,
      syncing,
      lastSync,
      syncNotice,
      sessionExpired,
      counts,
      dataVersion,
      login,
      register,
      completeOnboarding,
      logout,
      syncNow,
      refresh,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
