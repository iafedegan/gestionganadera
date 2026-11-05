import type {
  FarmCreate,
  FarmDto,
  FarmUpdate,
  InvitationCreate,
  InvitationDto,
  InvitationPreview,
  OnboardingRequest,
  PullResponse,
  PushResponse,
  RegisterInvitedRequest,
  RegisterRequest,
  SessionDto,
  TeamDto,
} from "@ganaderia/contracts";

/** Sin respuesta del servidor: no hay red o el servidor no está disponible. */
export class NetworkError extends Error {
  constructor() {
    super("Sin conexión con el servidor");
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 15_000;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        "x-requested-with": "ganaderia",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? null : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new NetworkError();
  }
  // Un 5xx significa servidor no disponible (el proxy de estáticos responde 500/502 sin API):
  // se trata como falta de conexión; los datos locales siguen seguros y se reintenta después.
  if (res.status >= 500) throw new NetworkError();
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    throw new ApiError(
      res.status,
      String(json.error ?? "ERROR"),
      String(json.message ?? res.statusText),
    );
  }
  return json as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<SessionDto>("POST", "/v1/auth/login", { email, password }),
  register: (input: RegisterRequest) => request<SessionDto>("POST", "/v1/auth/register", input),
  onboarding: (input: OnboardingRequest) => request<SessionDto>("POST", "/v1/onboarding", input),
  registerInvited: (input: RegisterInvitedRequest) =>
    request<SessionDto>("POST", "/v1/auth/register-invited", input),
  previewInvitation: (code: string) =>
    request<InvitationPreview>("GET", `/v1/invitations/${encodeURIComponent(code)}`),
  acceptInvitation: (code: string) =>
    request<SessionDto>("POST", "/v1/invitations/accept", { code }),
  team: (organizationId: string) =>
    request<TeamDto>("GET", `/v1/team?organizationId=${organizationId}`),
  invite: (input: InvitationCreate) =>
    request<{ code: string; invitation: InvitationDto }>("POST", "/v1/team/invitations", input),
  revokeInvitation: (organizationId: string, id: string) =>
    request<{ ok: true }>("DELETE", `/v1/team/invitations/${id}?organizationId=${organizationId}`),
  removeMember: (organizationId: string, membershipId: string) =>
    request<{ ok: true }>(
      "DELETE",
      `/v1/team/members/${membershipId}?organizationId=${organizationId}`,
    ),
  logout: () => request<{ ok: true }>("POST", "/v1/auth/logout"),
  me: () => request<SessionDto>("GET", "/v1/auth/me"),
  approxLocation: () => request<{ lat: number; lng: number }>("GET", "/v1/geo/approx"),
  createFarm: (input: FarmCreate) => request<FarmDto>("POST", "/v1/farms", input),
  updateFarm: (id: string, input: FarmUpdate) => request<FarmDto>("PUT", `/v1/farms/${id}`, input),
  pull: (organizationId: string, since: number, limit = 200) =>
    request<PullResponse>(
      "GET",
      `/v1/sync/pull?organizationId=${organizationId}&since=${since}&limit=${limit}`,
    ),
  push: (organizationId: string, deviceId: string, commands: unknown[]) =>
    request<PushResponse>("POST", "/v1/sync/push", { organizationId, deviceId, commands }),
};
