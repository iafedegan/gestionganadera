import type { InvitationDto, InviteRole, Role, TeamDto } from "@ganaderia/contracts";
import { can } from "@ganaderia/domain";
import {
  Check,
  Copy,
  HardHat,
  Share2,
  ShieldCheck,
  Stethoscope,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFarms } from "./animals";
import { CardHead } from "./components";
import { ApiError, api } from "./lib/api";
import { useApp } from "./state";

const ROLE_NAME: Record<Role, string> = {
  propietario: "Propietario",
  admin_entidad: "Administrador",
  operario: "Empleado",
  tecnico: "Veterinario o asesor",
};

const WHO: { role: InviteRole; icon: typeof HardHat; title: string; text: string }[] = [
  {
    role: "operario",
    icon: HardHat,
    title: "Un empleado",
    text: "Mayordomo, ordeñador o vaquero. Registra animales, eventos del día y la bodega. No ve costos.",
  },
  {
    role: "tecnico",
    icon: Stethoscope,
    title: "Mi veterinario o asesor",
    text: "Ve la hoja de vida, la historia clínica y la reproducción, y registra tratamientos. Sin acceso a la economía y por el tiempo que usted decida.",
  },
  {
    role: "admin_entidad",
    icon: ShieldCheck,
    title: "Un administrador",
    text: "Maneja la finca completa e invita personas. No ve la economía.",
  },
];

const DAYS = [
  { v: 30, l: "1 mes" },
  { v: 90, l: "3 meses" },
  { v: 180, l: "6 meses" },
  { v: 0, l: "Sin vencimiento" },
];

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
const linkFor = (code: string) => `${location.origin}/app/?invitacion=${encodeURIComponent(code)}`;

function shareText(org: string, role: InviteRole, code: string) {
  return `Hola, lo invito a ${org} en Gestión Ganadera como ${ROLE_NAME[role].toLowerCase()}. Abra este enlace para crear su cuenta: ${linkFor(code)} (código ${code}).`;
}

/** Equipo de la organización: quién tiene acceso, invitaciones pendientes y nuevas invitaciones. */
export function TeamPanel() {
  const { orgId, role, session, online, notify } = useApp();
  const farms = useFarms();
  const [team, setTeam] = useState<TeamDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const allowed = role ? can(role, "team.manage") : false;
  const org = session?.memberships[0]?.organizationName ?? "la ganadería";

  const load = async () => {
    try {
      setTeam(await api.team(orgId));
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Sin conexión: el equipo se ve cuando haya señal.",
      );
    }
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: se carga al entrar y al recuperar la red
  useEffect(() => {
    if (allowed && orgId) void load();
  }, [allowed, orgId, online]);

  if (!allowed) return null;
  const farmName = (id: string | null) =>
    id ? (farms.find((f) => f.id === id)?.name ?? "Una finca") : "Todas las fincas";

  return (
    <article className="card team">
      <CardHead
        icon={<Users size={26} aria-hidden="true" />}
        title="Su equipo"
        sub="Invite a sus trabajadores y a su veterinario. Usted decide qué ven y por cuánto tiempo."
        action={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!online}
            onClick={() => setOpen(true)}
          >
            <UserPlus size={16} aria-hidden="true" /> Invitar
          </button>
        }
      />
      {error && <p className="hint">{error}</p>}
      {team && (
        <>
          <ul className="team-list">
            {team.members.map((m) => (
              <li key={m.membershipId}>
                <span className="avatar sm" aria-hidden="true">
                  {initials(m.displayName)}
                </span>
                <span className="tm-text">
                  <b>
                    {m.displayName}
                    {m.isMe ? " (usted)" : ""}
                  </b>
                  <small>
                    {ROLE_NAME[m.role]} · {farmName(m.farmId)}
                    {m.validUntil ? ` · acceso hasta ${fmt(m.validUntil)}` : ""}
                  </small>
                </span>
                {!m.isMe && m.role !== "propietario" && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm danger"
                    onClick={async () => {
                      if (
                        !window.confirm(
                          `¿Quitar el acceso de ${m.displayName}? Dejará de ver la información desde ya.`,
                        )
                      )
                        return;
                      try {
                        await api.removeMember(orgId, m.membershipId);
                        notify(`${m.displayName} ya no tiene acceso.`, "ok");
                        void load();
                      } catch (e) {
                        notify(
                          e instanceof ApiError ? e.message : "No se pudo quitar el acceso.",
                          "warn",
                        );
                      }
                    }}
                  >
                    Quitar
                  </button>
                )}
              </li>
            ))}
          </ul>
          {team.invitations.length > 0 && (
            <>
              <h3 className="team-sub">Invitaciones pendientes</h3>
              <ul className="team-list">
                {team.invitations.map((i: InvitationDto) => (
                  <li key={i.id} className="pending">
                    <span className="avatar sm ghost" aria-hidden="true">
                      <UserPlus size={16} />
                    </span>
                    <span className="tm-text">
                      <b>{i.label}</b>
                      <small>
                        {ROLE_NAME[i.role]} · vence el {fmt(i.expiresAt)}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={async () => {
                        if (!window.confirm(`¿Anular la invitación de ${i.label}?`)) return;
                        await api.revokeInvitation(orgId, i.id).catch(() => undefined);
                        void load();
                      }}
                    >
                      Anular
                    </button>
                  </li>
                ))}
              </ul>
              <p className="hint">
                Por seguridad el código solo se muestra al crearlo. Si se perdió, anule y cree otro.
              </p>
            </>
          )}
        </>
      )}
      {open && (
        <InviteDialog
          org={org}
          farms={farms.map((f) => ({ id: f.id, name: f.name }))}
          onClose={() => {
            setOpen(false);
            void load();
          }}
        />
      )}
    </article>
  );
}

function InviteDialog(props: {
  org: string;
  farms: { id: string; name: string }[];
  onClose(): void;
}) {
  const { orgId } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const [who, setWho] = useState<InviteRole | null>(null);
  const [label, setLabel] = useState("");
  const [farmId, setFarmId] = useState("");
  const [days, setDays] = useState(90);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ code: string; role: InviteRole } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function create() {
    if (!who) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.invite({
        organizationId: orgId,
        role: who,
        label: label.trim(),
        ...(farmId ? { farmId } : {}),
        ...(who === "tecnico" && days > 0 ? { accessDays: days } : {}),
      });
      setDone({ code: r.code, role: who });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Necesita conexión para invitar.");
    }
    setBusy(false);
  }

  const text = done ? shareText(props.org, done.role, done.code) : "";

  return (
    <dialog
      ref={ref}
      className="dialog dialog-form"
      onClose={props.onClose}
      aria-labelledby="inv-title"
    >
      <div className="inv">
        <header className="dialog-head">
          <button
            type="button"
            className="icon-btn"
            aria-label="Cerrar"
            onClick={() => ref.current?.close()}
          >
            <X size={20} />
          </button>
          <h2 id="inv-title">{done ? "Invitación lista" : "Invitar a su equipo"}</h2>
        </header>
        <div className="dialog-body">
          {!done && (
            <>
              <section className="fsec">
                <h3 className="fsec-t">¿A quién invita?</h3>
                <div className="inv-who">
                  {WHO.map((w) => {
                    const Icon = w.icon;
                    return (
                      <button
                        key={w.role}
                        type="button"
                        className={who === w.role ? "inv-card on" : "inv-card"}
                        aria-pressed={who === w.role}
                        onClick={() => setWho(w.role)}
                      >
                        <span className="inv-icon">
                          <Icon size={22} aria-hidden="true" />
                        </span>
                        <span>
                          <b>{w.title}</b>
                          <small>{w.text}</small>
                        </span>
                        {who === w.role && (
                          <Check size={18} className="inv-check" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
              {who && (
                <section className="fsec">
                  <div className="kf-grid">
                    <label htmlFor="inv-label">
                      Nombre de la persona
                      <input
                        id="inv-label"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder={
                          who === "tecnico" ? "Ej. Dra. Marcela Ruiz" : "Ej. Pedro Gómez"
                        }
                        autoComplete="off"
                      />
                    </label>
                    {props.farms.length > 1 && (
                      <label htmlFor="inv-farm">
                        ¿Qué finca puede ver?
                        <select
                          id="inv-farm"
                          value={farmId}
                          onChange={(e) => setFarmId(e.target.value)}
                        >
                          <option value="">Todas las fincas</option>
                          {props.farms.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  {who === "tecnico" && (
                    <>
                      <p className="ob-label">¿Por cuánto tiempo tendrá acceso?</p>
                      <div className="ob-chips">
                        {DAYS.map((d) => (
                          <button
                            key={d.v}
                            type="button"
                            className={days === d.v ? "ob-chip on" : "ob-chip"}
                            aria-pressed={days === d.v}
                            onClick={() => setDays(d.v)}
                          >
                            {days === d.v && <Check size={14} aria-hidden="true" />} {d.l}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </section>
              )}
              {error && (
                <p role="alert" className="login-alert">
                  {error}
                </p>
              )}
            </>
          )}
          {done && (
            <section className="fsec inv-done">
              <p>Envíele este enlace. Al abrirlo crea su cuenta y entra directo a {props.org}.</p>
              <div className="inv-code" aria-label="Código de invitación">
                {done.code}
              </div>
              <small className="hint">El código sirve una sola vez y vence en 7 días.</small>
              <a
                className="btn btn-primary btn-block"
                href={`https://wa.me/?text=${encodeURIComponent(text)}`}
                target="_blank"
                rel="noreferrer"
              >
                <Share2 size={18} aria-hidden="true" /> Enviar por WhatsApp
              </a>
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={async () => {
                  try {
                    if (navigator.share) await navigator.share({ text });
                    else await navigator.clipboard.writeText(text);
                    setCopied(true);
                  } catch {
                    /* el usuario canceló */
                  }
                }}
              >
                {copied ? (
                  <Check size={18} aria-hidden="true" />
                ) : (
                  <Copy size={18} aria-hidden="true" />
                )}{" "}
                {copied ? "Listo" : "Copiar o compartir el enlace"}
              </button>
            </section>
          )}
        </div>
        <div className="dialog-actions">
          {done ? (
            <button type="button" className="btn btn-primary" onClick={() => ref.current?.close()}>
              Terminar
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => ref.current?.close()}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!who || label.trim().length < 2 || busy}
                onClick={() => void create()}
              >
                Crear invitación
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
