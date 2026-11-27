import type { UrgentAlertCreate, UrgentAlertDto, UrgentRecipient } from "@ganaderia/contracts";
import {
  AlertTriangle,
  BellRing,
  Check,
  ChevronRight,
  ClipboardList,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Phone,
  RotateCw,
  Search,
  Send,
  WifiOff,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { AlertItem } from "./Alerts";
import { UrgentChat } from "./UrgentChat";
import { UrgentRecordSheet } from "./UrgentRecord";
import { useActiveFarm, useFarms } from "./animals";
import { art } from "./art";
import { CATEGORY_LABEL, fechaHora, todayLocal } from "./labels";
import { ageText, animalInfo } from "./lib/animalTags";
import { ApiError, NetworkError, api } from "./lib/api";
import type { LocalAnimalEvent, LocalHerdAnimal } from "./lib/localdb";
import {
  type NotifyState,
  askNotify,
  chime,
  notifyState,
  systemNotify,
  titleBadge,
} from "./lib/notify";
import { myOrgs } from "./lib/orgs";
import { phoneNumber, smsLink, smsText } from "./lib/sms";
import {
  pending,
  saveTeam,
  saveVetPhone,
  setPending,
  teamCache,
  vetPhone,
} from "./lib/urgentLocal";
import { haptic } from "./native";
import { useApp } from "./state";

/**
 * Emergencias: la aplicación no responde por su cuenta, avisa al veterinario del equipo.
 * Quien reporta ve cuándo confirman; sin internet puede avisar por mensaje de texto y el aviso
 * queda en cola. El veterinario lo ve apenas abre la aplicación.
 */

export interface PickedAnimal {
  id: string;
  tag: string;
}

export interface EmergencyState {
  reason: string;
  message: string;
  status: "enviando" | "enviado" | "sin_senal" | "error";
  animal: PickedAnimal | null;
  alert?: UrgentAlertDto;
  detail?: string;
}

export interface Herd {
  herd: LocalHerdAnimal[];
  events: LocalAnimalEvent[];
}

const EVERY = 5_000;
const HIDDEN_EVERY = 20_000;
const picture = (species: string) => art(species === "bufalino" ? "ficha-buffalo" : "ficha-cow");
const initials = (name: string) =>
  name
    .replace(/\(.*?\)|^(Dra?\.)\s*/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

function ago(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  return min < 1440 ? `hace ${Math.round(min / 60)} h` : fechaHora(iso);
}

/** Avisos recientes, revisados cada pocos segundos mientras la app está abierta. */
export function useUrgentList(active: boolean) {
  const { session, online, reloadSession } = useApp();
  const [items, setItems] = useState<UrgentAlertDto[]>([]);
  const known = myOrgs(session)
    .map((o) => o.organizationId)
    .sort()
    .join(",");
  // El servidor responde por todas las ganaderías de la persona, aunque esta app no sepa aún
  // que la agregaron a una nueva: en ese caso se ponen al día los accesos.
  const load = useCallback(() => {
    if (!session || !online) return;
    api.urgentMine().then(
      (r) => {
        setItems(r.items);
        if (r.organizations.some((o) => !known.split(",").includes(o))) void reloadSession();
      },
      () => undefined,
    );
  }, [session, online, known, reloadSession]);
  useEffect(() => {
    if (!active) return;
    load();
    // En segundo plano se sigue revisando, más despacio, para avisar con la notificación.
    let t = setInterval(load, document.hidden ? HIDDEN_EVERY : EVERY);
    const onVisible = () => {
      clearInterval(t);
      t = setInterval(load, document.hidden ? HIDDEN_EVERY : EVERY);
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", load);
    };
  }, [active, load]);
  return { items, reload: load };
}

export function useEmergencyAlert() {
  const { orgId } = useApp();
  const farms = useFarms();
  const active = useActiveFarm();
  const [state, setState] = useState<EmergencyState | null>(null);
  const farmId = active || (farms.length === 1 ? farms[0]?.id : undefined);
  const { items } = useUrgentList(state?.status === "enviado" && !state.alert?.ackBy);

  const send = useCallback(
    async (reason: string, message: string, animal: PickedAnimal | null) => {
      setState({ reason, message, animal, status: "enviando" });
      const input: UrgentAlertCreate = {
        organizationId: orgId,
        ...(animal ? { animalId: animal.id } : farmId ? { farmId } : {}),
        reason,
        message: message.slice(0, 1500),
      };
      try {
        const alert = await api.urgentCreate(input);
        saveTeam(orgId, alert.recipients);
        setState({ reason, message, animal, status: "enviado", alert });
      } catch (e) {
        const offline = e instanceof NetworkError;
        if (offline) setPending(orgId, [...pending(orgId), input]);
        setState({
          reason,
          message,
          animal,
          status: offline ? "sin_senal" : "error",
          ...(e instanceof ApiError ? { detail: e.message } : {}),
        });
      }
    },
    [orgId, farmId],
  );

  const fresh = items.find((a) => a.id === state?.alert?.id);
  const alert = state && fresh ? { ...state, alert: fresh } : state;
  const clear = useCallback(() => setState(null), []);
  return { alert, send, clear };
}

/** La emergencia pregunta primero por el animal, para enviar su hoja de vida. */
export function AnimalAsk(props: Herd & { reason: string; onPick(a: PickedAnimal | null): void }) {
  const farms = useFarms();
  const [q, setQ] = useState("");
  const today = todayLocal();
  const info = animalInfo(props.events, today);
  const term = q.trim().toUpperCase();
  const farmName = (id: string) => farms.find((f) => f.id === id)?.name ?? "";
  // Sin escribir se ofrecen los que ya necesitan cuidado: son los más probables.
  const list = (
    term
      ? props.herd.filter((a) => a.tag.toUpperCase().includes(term))
      : props.herd.filter((a) => info.get(a.id)?.flags.includes("retiro"))
  ).slice(0, 5);

  return (
    <section className="urg" role="alert">
      <header className="urg-top">
        <span className="urg-pulse" aria-hidden="true">
          <AlertTriangle size={22} />
        </span>
        <div>
          <strong>Emergencia</strong>
          <small>¿Qué animal es? Su hoja de vida viaja con el aviso.</small>
        </div>
      </header>
      <div className="urg-body">
        <label className="urg-search">
          <Search size={20} aria-hidden="true" />
          <input
            value={q}
            placeholder="Escriba el arete, ej. CE-004"
            aria-label="Arete del animal"
            autoCapitalize="characters"
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        {list.length > 0 && (
          <>
            {!term && <p className="urg-hint">En tratamiento ahora</p>}
            <ul className="urg-animals">
              {list.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => props.onPick({ id: a.id, tag: a.tag })}>
                    <img src={picture(a.species)} alt="" />
                    <span>
                      <strong>{a.tag}</strong>
                      <small>
                        {[
                          CATEGORY_LABEL[a.category],
                          ageText(a.birthDate, today),
                          farmName(a.farmId),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </span>
                    <ChevronRight size={20} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {term && list.length === 0 && <p className="urg-hint">No hay un animal con ese arete.</p>}
        <button type="button" className="urg-btn urg-soft" onClick={() => props.onPick(null)}>
          No sé el arete o son varios
        </button>
      </div>
    </section>
  );
}

/** Estado del aviso para quien reporta, con las formas de contactar aun sin internet. */
export function EmergencyCard(props: Herd & { alert: EmergencyState; onRetry(): void }) {
  const { orgId, session, online } = useApp();
  const farms = useFarms();
  const { status, reason, detail, alert, message, animal } = props.alert;
  const [team, setTeam] = useState<UrgentRecipient[]>(() => alert?.recipients ?? teamCache(orgId));
  const [typed, setTyped] = useState(() => vetPhone(orgId));

  useEffect(() => {
    if (alert?.recipients.length) setTeam(alert.recipients);
  }, [alert]);

  // Apenas confirman, se abre el chat entre los dos.
  const [chat, setChat] = useState(false);
  const confirmed = Boolean(alert?.ackBy);
  useEffect(() => {
    if (confirmed) setChat(true);
  }, [confirmed]);

  const known = team.find((v) => phoneNumber(v.phone))?.phone ?? "";
  const phone = phoneNumber(known || typed);
  const mine = props.herd.find((a) => a.id === animal?.id);
  const events = props.events.filter((e) => e.animalId === mine?.id);
  const text = smsText({
    reason,
    message,
    who: session?.displayName ?? "",
    farm: farms.find((f) => f.id === mine?.farmId)?.name,
    ...(mine
      ? {
          animal: {
            tag: mine.tag,
            detail: [CATEGORY_LABEL[mine.category], ageText(mine.birthDate, todayLocal())]
              .filter(Boolean)
              .join(", "),
            events,
            withdrawal: Boolean(
              animalInfo(events, todayLocal()).get(mine.id)?.flags.includes("retiro"),
            ),
          },
        }
      : {}),
  });
  const failed = status === "sin_senal" || status === "error";
  const done = Boolean(alert?.ackBy);
  const steps: [string, boolean][] = [
    [failed ? "Aviso sin enviar" : "Aviso enviado", status === "enviado"],
    ["Veterinario confirma", done],
  ];

  return (
    <section className={done ? "urg urg-ok" : "urg"} role="alert">
      <header className="urg-top">
        <span className="urg-pulse" aria-hidden="true">
          {done ? (
            <Check size={22} />
          ) : failed ? (
            <WifiOff size={22} />
          ) : (
            <AlertTriangle size={22} />
          )}
        </span>
        <div>
          <strong>
            {done
              ? `${alert?.ackBy} va a atender`
              : failed
                ? "Sin enviar: avise ya"
                : "Avisando a su veterinario"}
          </strong>
          <small>
            {reason}
            {animal ? ` · ${animal.tag}` : ""}
          </small>
        </div>
      </header>
      <div className="urg-body">
        <ol className="urg-steps">
          {steps.map(([label, ok]) => (
            <li key={label} className={ok ? "ok" : ""}>
              <span aria-hidden="true">{ok && <Check size={14} />}</span>
              {label}
            </li>
          ))}
        </ol>
        {alert && (
          <button
            type="button"
            className={done ? "urg-btn urg-green" : "urg-btn urg-soft urg-chat"}
            onClick={() => setChat(true)}
          >
            <MessagesSquare size={20} aria-hidden="true" />
            <span>
              {done ? `Abrir chat con ${alert.ackBy}` : "Enviar fotos o videos ya"}
              <small>
                {done
                  ? "Envíe fotos y videos del animal"
                  : "El veterinario los ve mientras confirma"}
              </small>
            </span>
          </button>
        )}
        {status === "enviado" && !done && <NotifyPrompt />}
        {chat && alert && <UrgentChat alert={alert} onClose={() => setChat(false)} />}
        {alert?.animal && (
          <p className="urg-note">
            <ClipboardList size={18} aria-hidden="true" /> Hoja de vida de {alert.animal.tag}{" "}
            enviada: {alert.animal.events.length} registros.
          </p>
        )}
        {failed && (
          <p className="urg-note">
            {status === "sin_senal"
              ? "No hay internet. Mande el mensaje de texto; el aviso de la app saldrá solo al volver la señal."
              : (detail ?? "Hubo un error.")}
          </p>
        )}
        {team.length > 0 && (
          <ul className="urg-team">
            {team.map((v) => (
              <li key={v.name}>
                <span aria-hidden="true">{initials(v.name)}</span>
                {v.name}
              </li>
            ))}
          </ul>
        )}
        {status === "enviado" && team.length === 0 && (
          <p className="urg-note">No hay veterinario en su equipo: llame ya.</p>
        )}
        {!known && (
          <label className="urg-search">
            <Phone size={18} aria-hidden="true" />
            <input
              type="tel"
              inputMode="tel"
              value={typed}
              placeholder="Celular de su veterinario"
              aria-label="Celular del veterinario"
              onChange={(e) => {
                setTyped(e.target.value);
                saveVetPhone(orgId, e.target.value);
              }}
            />
          </label>
        )}
        <a className="urg-btn urg-red" href={smsLink(phone, text)}>
          <MessageSquare size={20} aria-hidden="true" />
          <span>
            Enviar mensaje de texto
            <small>Funciona sin internet</small>
          </span>
        </a>
        <div className="urg-pair">
          {phone && (
            <a className="urg-btn urg-soft" href={`tel:${phone}`}>
              <Phone size={18} aria-hidden="true" /> Llamar
            </a>
          )}
          {online && (
            <a
              className="urg-btn urg-soft"
              href={`https://wa.me/${phone.slice(1)}?text=${encodeURIComponent(text)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={18} aria-hidden="true" /> WhatsApp
            </a>
          )}
          {failed && (
            <button type="button" className="urg-btn urg-soft" onClick={props.onRetry}>
              <RotateCw size={18} aria-hidden="true" /> Reintentar
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

const seenKey = (id: string) => `gg.vet.visto.${id}`;
function wasSeen(id: string): boolean {
  try {
    return localStorage.getItem(seenKey(id)) !== null;
  } catch {
    return true;
  }
}
function markSeen(id: string): void {
  try {
    localStorage.setItem(seenKey(id), "1");
  } catch {
    /* sin almacenamiento */
  }
}

const readKey = (alertId: string) => `gg.vet.leido.${alertId}`;
/** Una conversación es nueva hasta que se abre; vuelve a serlo con cada mensaje de la otra parte. */
function isUnread(a: UrgentAlertDto): boolean {
  if (a.lastMessage?.mine) return false;
  try {
    return localStorage.getItem(readKey(a.id)) !== (a.lastMessage?.id ?? "abierto");
  } catch {
    return false;
  }
}
function markRead(a: UrgentAlertDto): void {
  try {
    localStorage.setItem(readKey(a.id), a.lastMessage?.id ?? "abierto");
  } catch {
    /* sin almacenamiento */
  }
}

/**
 * Para quien atiende (veterinario, asesor o dueño). Las urgencias por confirmar salen en la
 * pantalla; las conversaciones van a las notificaciones. También despacha los avisos en cola.
 */
export function useUrgentCenter(): { node: ReactNode; messages: AlertItem[]; unread: number } {
  const { orgId, online, notify } = useApp();
  const { items, reload } = useUrgentList(true);
  const [viewing, setViewing] = useState<string | null>(null);
  const open = items.filter((a) => a.canAck && !a.mine && !a.ackBy);
  // Conversaciones: las que reporté (el chat abre desde el aviso) y las que estoy atendiendo.
  const chats = items.filter((a) => a.mine || a.attending);
  const [chatId, setChatId] = useState<string | null>(null);
  const chat = items.find((a) => a.id === chatId);
  useEffect(() => {
    if (chat) markRead(chat);
  }, [chat]);

  // Un mensaje nuevo suena, sale en el sistema si la app está de fondo y abre su chat.
  useEffect(() => {
    for (const a of chats) {
      const m = a.lastMessage;
      if (!m || m.mine || wasSeen(m.id)) continue;
      markSeen(m.id);
      haptic(300);
      chime(false);
      notify(`${m.authorName}: ${m.preview}`, "warn");
      if (document.hidden)
        void systemNotify(`Mensaje de ${m.authorName}`, m.preview, `chat-${a.id}`);
      if (!document.querySelector("dialog[open]")) setChatId(a.id);
      break;
    }
  }, [chats, notify]);

  useEffect(() => {
    if (!orgId || !online) return;
    // Con señal se guarda el equipo (para el SMS sin internet) y sale lo que quedó en cola.
    api.urgentTeam(orgId).then(
      (r) => saveTeam(orgId, r.team),
      () => undefined,
    );
    const queue = pending(orgId);
    if (queue.length === 0) return;
    setPending(orgId, []);
    void Promise.all(
      queue.map((input) =>
        api.urgentCreate(input).then(
          () => notify("Se envió el aviso urgente que estaba pendiente.", "warn"),
          (e) => {
            if (e instanceof NetworkError) setPending(orgId, [...pending(orgId), input]);
          },
        ),
      ),
    ).then(reload);
  }, [orgId, online, notify, reload]);

  // Urgencia nueva para atender: sonido, vibración y notificación del sistema.
  useEffect(() => {
    const fresh = open.filter((a) => !wasSeen(`aviso-${a.id}`));
    if (fresh.length === 0) return;
    for (const a of fresh) markSeen(`aviso-${a.id}`);
    const a = fresh[0] as UrgentAlertDto;
    haptic(400);
    chime(true);
    void systemNotify(
      `Urgencia${a.animal ? ` · ${a.animal.tag}` : ""}`,
      `${a.authorName}: ${a.message}${a.organizationName ? ` (${a.organizationName})` : ""}`,
      `aviso-${a.id}`,
    );
  }, [open]);

  const unreadChats = chats.filter(isUnread).length;
  useEffect(() => {
    titleBadge(open.length + unreadChats);
    return () => titleBadge(0);
  }, [open.length, unreadChats]);

  const attend = (id: string) =>
    void api.urgentAck(id).then(
      () => {
        notify("Confirmado: quien avisó ya lo ve.", "ok");
        setViewing(null);
        setChatId(id);
        reload();
      },
      () => notify("No se pudo confirmar. Revise la conexión.", "warn"),
    );

  const shown = open.find((a) => a.id === viewing);
  const messages: AlertItem[] = chats.map((a) => ({
    id: a.id,
    tone: a.ackBy ? "info" : "warn",
    fresh: isUnread(a),
    icon: <MessagesSquare size={22} />,
    title: a.mine
      ? a.ackBy
        ? `Chat con ${a.ackBy}`
        : `Urgencia${a.animal ? ` de ${a.animal.tag}` : ""}: esperando al veterinario`
      : `Chat con ${a.authorName}`,
    text: a.lastMessage
      ? `${a.lastMessage.mine ? "Usted" : a.lastMessage.authorName}: ${a.lastMessage.preview}`
      : a.ackBy
        ? `${a.reason}${a.animal ? ` · ${a.animal.tag}` : ""}`
        : "Puede enviar fotos y videos mientras confirman.",
    go: () => setChatId(a.id),
  }));
  const node = (open.length > 0 || chat) && (
    <div className="urgent-list">
      {open.length > 0 && <NotifyPrompt />}
      {open.map((a) => {
        const phone = phoneNumber(a.authorPhone);
        const last = a.animal?.events.find((e) => e.type === "salud");
        return (
          <section key={a.id} className="urg" role="alert">
            <header className="urg-top">
              <span className="urg-pulse" aria-hidden="true">
                <AlertTriangle size={22} />
              </span>
              <div>
                <strong>Urgencia: {a.reason}</strong>
                <small>
                  {ago(a.createdAt)}
                  {a.farmName ? ` · ${a.farmName}` : ""}
                </small>
                {a.organizationName && <em className="urg-org">{a.organizationName}</em>}
              </div>
            </header>
            <div className="urg-body">
              <p className="urg-quote">
                «{a.message}» <small>{a.authorName}</small>
              </p>
              {a.animal && (
                <button type="button" className="urg-patient" onClick={() => setViewing(a.id)}>
                  <img src={picture(a.animal.species)} alt="" />
                  <span>
                    <strong>{a.animal.tag}</strong>
                    <small>
                      {[
                        CATEGORY_LABEL[a.animal.category],
                        ageText(a.animal.birthDate, todayLocal()),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                    {last && <small>Último manejo: {String(last.data.product ?? "")}</small>}
                    <em>Ver hoja de vida y trazabilidad</em>
                  </span>
                  <ChevronRight size={20} aria-hidden="true" />
                </button>
              )}
              <button type="button" className="urg-btn urg-red" onClick={() => attend(a.id)}>
                <Send size={20} aria-hidden="true" />
                <span>
                  Voy a atender
                  <small>Se abre el chat con {a.authorName.replace(/\s*\(.*\)$/, "")}</small>
                </span>
              </button>
              {a.messageCount > 0 && (
                <button type="button" className="urg-btn urg-soft" onClick={() => setChatId(a.id)}>
                  <MessagesSquare size={18} aria-hidden="true" />
                  Ver {a.messageCount === 1 ? "1 mensaje" : `${a.messageCount} mensajes`}
                  {a.lastMessage && !a.lastMessage.mine ? ` · «${a.lastMessage.preview}»` : ""}
                </button>
              )}
              <div className="urg-pair">
                {phone && (
                  <a className="urg-btn urg-soft" href={`tel:${phone}`}>
                    <Phone size={18} aria-hidden="true" /> Llamar
                  </a>
                )}
                <a
                  className="urg-btn urg-soft"
                  href={smsLink(phone, `GanSmart: voy a atender la urgencia (${a.reason}).`)}
                >
                  <MessageSquare size={18} aria-hidden="true" /> Responder por SMS
                </a>
              </div>
            </div>
          </section>
        );
      })}
      {chat && (
        <UrgentChat
          alert={chat}
          onClose={() => setChatId(null)}
          {...(chat.canAck && !chat.mine && !chat.ackBy ? { onAttend: () => attend(chat.id) } : {})}
        />
      )}
      {shown?.animal && (
        <UrgentRecordSheet
          animal={shown.animal}
          onClose={() => setViewing(null)}
          onAttend={() => attend(shown.id)}
        />
      )}
    </div>
  );
  return { node, messages, unread: messages.filter((m) => m.fresh).length };
}

/** Pide permiso para avisar con la notificación del sistema, una sola vez y con un toque. */
export function NotifyPrompt() {
  const [state, setState] = useState<NotifyState>(notifyState);
  if (state !== "ask") return null;
  return (
    <div className="notify-ask">
      <BellRing size={20} aria-hidden="true" />
      <span>
        <strong>Active los avisos</strong>
        <small>Para enterarse de las urgencias aunque la app esté de fondo.</small>
      </span>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => void askNotify().then(setState)}
      >
        Activar
      </button>
    </div>
  );
}
