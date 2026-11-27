import { Check, Ticket } from "lucide-react";
import { useState } from "react";
import { myOrgs } from "./lib/orgs";
import { haptic } from "./native";
import { useApp } from "./state";

/** Mis ganaderías: cambiar entre ellas y unirse a otra con el código de una invitación. */
export function MyOrgs(props: { onDone?(): void }) {
  const { session, orgId, switchOrg, acceptInvitation, notify } = useApp();
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const orgs = myOrgs(session);

  async function join() {
    setBusy(true);
    setError(null);
    const r = await acceptInvitation(code.trim());
    setBusy(false);
    if (!r.ok) return setError(r.message);
    notify("Listo: ya hace parte de la nueva ganadería.", "ok");
    setCode("");
    setJoining(false);
    props.onDone?.();
  }

  return (
    <div className="my-orgs">
      {orgs.length > 1 && (
        <>
          <p className="mo-title">Mis ganaderías</p>
          <ul>
            {orgs.map((o) => (
              <li key={o.organizationId}>
                <button
                  type="button"
                  className={o.organizationId === orgId ? "mo-org on" : "mo-org"}
                  aria-pressed={o.organizationId === orgId}
                  onClick={() => {
                    haptic(8);
                    switchOrg(o.organizationId);
                    props.onDone?.();
                  }}
                >
                  <span>{o.organizationName}</span>
                  {o.organizationId === orgId && <Check size={18} aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {joining ? (
        <form
          className="mo-join"
          onSubmit={(e) => {
            e.preventDefault();
            void join();
          }}
        >
          <label>
            Código de la invitación
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCDE-FGHJK"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {error && (
            <p role="alert" className="login-alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={busy || code.trim().length < 8}
          >
            Unirme
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-ghost btn-block" onClick={() => setJoining(true)}>
          <Ticket size={18} aria-hidden="true" /> Unirme con un código
        </button>
      )}
    </div>
  );
}
