import { Camera, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "./lib/api";
import { isDemoEmail, localAvatar, setLocalAvatar, toAvatar } from "./lib/avatar";
import { saveSession } from "./lib/session";
import { useApp } from "./state";

const EVENT = "gg-avatar";

/** La foto de quien tiene la sesión, o null si no ha subido ninguna. */
export function useMyAvatar(): string | null {
  const { session } = useApp();
  const [, setTick] = useState(0);
  useEffect(() => {
    const again = () => setTick((n) => n + 1);
    window.addEventListener(EVENT, again);
    return () => window.removeEventListener(EVENT, again);
  }, []);
  if (!session) return null;
  if (isDemoEmail(session.email)) return localAvatar(session.userId);
  const mine = changed.get(session.userId);
  return mine !== undefined ? mine : (session.avatar ?? null);
}

/** Cambios hechos en esta visita, antes de que la sesión se renueve. */
const changed = new Map<string, string | null>();

export function Avatar(props: { initials: string; src?: string | null; className?: string }) {
  return (
    <span className={`avatar ${props.className ?? ""}`} aria-hidden="true">
      {props.src ? <img src={props.src} alt="" /> : props.initials}
    </span>
  );
}

/** La foto en grande, con botones para subirla o quitarla. */
export function AvatarPicker({ initials }: { initials: string }) {
  const { session, notify } = useApp();
  const current = useMyAvatar();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function save(image: string | null) {
    if (!session) return;
    if (isDemoEmail(session.email)) setLocalAvatar(session.userId, image);
    else {
      const fresh = await api.saveAvatar(image);
      saveSession(fresh);
      changed.set(session.userId, image);
    }
    window.dispatchEvent(new Event(EVENT));
    notify(image ? "Foto de perfil guardada." : "Foto de perfil quitada.", "ok");
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
    } catch (e) {
      notify(
        e instanceof ApiError
          ? e.message
          : "No se pudo guardar la foto. Revise la imagen y la conexión.",
        "warn",
      );
    }
    setBusy(false);
  }

  return (
    <div className="avatar-pick">
      <button
        type="button"
        className="ap-photo"
        aria-label={current ? "Cambiar foto de perfil" : "Subir foto de perfil"}
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <Avatar initials={initials} src={current} />
        <span className="ap-cam" aria-hidden="true">
          <Camera size={14} />
        </span>
      </button>
      {current && (
        <button
          type="button"
          className="ap-remove"
          aria-label="Quitar foto de perfil"
          disabled={busy}
          onClick={() => void run(() => save(null))}
        >
          <Trash2 size={16} />
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void run(async () => save(await toAvatar(file)));
        }}
      />
    </div>
  );
}
