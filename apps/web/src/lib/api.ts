import type {
  AiConfigDto,
  AiConfigInput,
  AssistantReply,
  AssistantRequest,
  AulaCourseDto,
  AulaProgressDto,
  AulaQuizDto,
  AulaQuizResultDto,
  CommunityPostCreate,
  CommunityPostDto,
  CommunityReplyDto,
  CommunityThreadDto,
  CommunityTopic,
  CourseDto,
  DataConsentInput,
  DataConsentState,
  DataRequestDto,
  DataRequestInput,
  DemoUserDto,
  ExtensionSummaryDto,
  FarmCreate,
  FarmDto,
  FarmProfileDto,
  FarmProfileInput,
  FarmUpdate,
  FieldVerificationCreate,
  FieldVerificationDto,
  ForestCheckDto,
  ForestCheckRequest,
  InvitationCreate,
  InvitationDto,
  InvitationPreview,
  MyCourseDto,
  NewsItemDto,
  OnboardingRequest,
  PullResponse,
  PushResponse,
  RecommendationCreate,
  RecommendationDto,
  RecommendationStatus,
  RegisterInvitedRequest,
  RegisterRequest,
  SessionDto,
  StaffDto,
  StaffInboxDto,
  StoreCatalogDto,
  StoreCategoryDto,
  StoreSearchDto,
  TeamDto,
  TechCaseCreate,
  TechCaseDto,
  TechCaseThreadDto,
  UrgentAlertCreate,
  UrgentAlertDto,
  UrgentMessageCreate,
  UrgentMessageDto,
  UrgentRecipient,
  VetAdd,
  VetOption,
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

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: { timeoutMs?: number; keep5xx?: boolean } = {},
): Promise<T> {
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
      signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
    });
  } catch {
    throw new NetworkError();
  }
  // Un 5xx significa servidor no disponible (el proxy de estáticos responde 500/502 sin API):
  // se trata como falta de conexión; los datos locales siguen seguros y se reintenta después.
  if (res.status >= 500 && !(opts.keep5xx && res.headers.get("content-type")?.includes("json")))
    throw new NetworkError();
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

/** Descarga «Mis datos» como archivo JSON (lo arma el servidor; no pasa por la base local). */
async function downloadMyData(): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/v1/me/datos", {
      credentials: "same-origin",
      headers: { "x-requested-with": "ganaderia" },
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new NetworkError();
  }
  if (res.status >= 500) throw new NetworkError();
  if (!res.ok)
    throw new ApiError(res.status, "ERROR", "No se pudo preparar la copia de sus datos.");
  const name =
    /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ??
    "mis-datos.json";
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const api = {
  // Trazabilidad libre de deforestación: revisión del lindero con la capa de bosque.
  forestChecks: (organizationId: string) =>
    request<{ items: ForestCheckDto[] }>(
      "GET",
      `/v1/trazabilidad?organizationId=${organizationId}`,
    ),
  forestCheck: (input: ForestCheckRequest) =>
    request<ForestCheckDto>("POST", "/v1/trazabilidad/bosque", input, { timeoutMs: 60_000 }),
  // Extensión híbrida: consultas al Secretario Técnico, recomendaciones y verificación en finca.
  extension: (organizationId: string) =>
    request<ExtensionSummaryDto>("GET", `/v1/extension?organizationId=${organizationId}`),
  escalate: (input: TechCaseCreate) =>
    request<TechCaseDto>("POST", "/v1/extension/consultas", input),
  caseThread: (id: string) => request<TechCaseThreadDto>("GET", `/v1/extension/consultas/${id}`),
  caseReply: (id: string, body: string) =>
    request<TechCaseThreadDto>("POST", `/v1/extension/consultas/${id}/mensajes`, { body }),
  caseClose: (id: string) =>
    request<TechCaseThreadDto>("POST", `/v1/extension/consultas/${id}/cerrar`, {}),
  recommend: (input: RecommendationCreate) =>
    request<RecommendationDto>("POST", "/v1/extension/recomendaciones", input),
  recoStatus: (id: string, status: RecommendationStatus) =>
    request<RecommendationDto>("PATCH", `/v1/extension/recomendaciones/${id}`, { status }),
  recoVerify: (id: string, note: string) =>
    request<RecommendationDto>("POST", `/v1/extension/recomendaciones/${id}/verificar`, { note }),
  staffMe: () => request<{ staff: StaffDto | null }>("GET", "/v1/gremio/yo"),
  staffInbox: () => request<StaffInboxDto>("GET", "/v1/gremio/bandeja"),
  fieldVerify: (input: FieldVerificationCreate) =>
    request<FieldVerificationDto>("POST", "/v1/gremio/verificaciones", input),
  // Protocolo de datos del productor (consentimiento, copia de los datos, solicitudes).
  consent: () => request<DataConsentState>("GET", "/v1/me/consentimiento"),
  saveConsent: (input: DataConsentInput) =>
    request<DataConsentState>("PUT", "/v1/me/consentimiento", input),
  downloadMyData,
  dataRequests: () => request<{ items: DataRequestDto[] }>("GET", "/v1/me/solicitudes"),
  addDataRequest: (input: DataRequestInput) =>
    request<DataRequestDto>("POST", "/v1/me/solicitudes", input),
  login: (email: string, password: string, remember = false) =>
    request<SessionDto>("POST", "/v1/auth/login", { email, password, remember }),
  register: (input: RegisterRequest) => request<SessionDto>("POST", "/v1/auth/register", input),
  onboarding: (input: OnboardingRequest) => request<SessionDto>("POST", "/v1/onboarding", input),
  registerInvited: (input: RegisterInvitedRequest) =>
    request<SessionDto>("POST", "/v1/auth/register-invited", input),
  previewInvitation: (code: string) =>
    request<InvitationPreview>("GET", `/v1/invitations/${encodeURIComponent(code)}`),
  vets: (organizationId: string) =>
    request<{ items: VetOption[] }>(
      "GET",
      `/v1/team/veterinarios?organizationId=${organizationId}`,
    ),
  addVet: (input: VetAdd) => request<{ ok: true }>("POST", "/v1/team/veterinarios", input),
  acceptInvitation: (code: string) =>
    request<SessionDto>("POST", "/v1/invitations/accept", { code }),
  profile: (organizationId: string) =>
    request<FarmProfileDto>("GET", `/v1/profile?organizationId=${organizationId}`),
  saveProfile: (organizationId: string, profile: FarmProfileInput) =>
    request<FarmProfileDto>("PUT", `/v1/profile?organizationId=${organizationId}`, profile),
  urgent: (orgId: string) =>
    request<{ items: UrgentAlertDto[] }>("GET", `/v1/urgencias?organizationId=${orgId}`),
  urgentMessages: (id: string) =>
    request<{ items: UrgentMessageDto[] }>("GET", `/v1/urgencias/${id}/mensajes`),
  urgentSend: (id: string, input: UrgentMessageCreate) =>
    request<{ ok: true }>("POST", `/v1/urgencias/${id}/mensajes`, input, { timeoutMs: 90_000 }),
  urgentTeam: (orgId: string) =>
    request<{ team: UrgentRecipient[] }>("GET", `/v1/urgencias/equipo?organizationId=${orgId}`),
  urgentCreate: (input: UrgentAlertCreate) =>
    request<UrgentAlertDto>("POST", "/v1/urgencias", input),
  urgentAck: (id: string) => request<{ ok: true }>("POST", `/v1/urgencias/${id}/atender`, {}),
  assistantStatus: (orgId: string) =>
    request<{ enabled: boolean; dailyLimit: number }>(
      "GET",
      `/v1/assistant/status?organizationId=${orgId}`,
    ),
  // El asistente puede tardar: se le da más tiempo y se leen sus errores 5xx con mensaje.
  aiConfig: (orgId: string) =>
    request<AiConfigDto>("GET", `/v1/assistant/config?organizationId=${orgId}`),
  saveAiConfig: (input: AiConfigInput) =>
    request<AiConfigDto>("PUT", "/v1/assistant/config", input),
  ask: (input: AssistantRequest) =>
    request<AssistantReply>("POST", "/v1/assistant", input, { timeoutMs: 120_000, keep5xx: true }),
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
  // Ecosistema FEDEGÁN 5.0: contenido de CONtexto Ganadero, la Escuela Virtual y TvGan.
  news: () => request<{ items: NewsItemDto[] }>("GET", "/v1/ecosistema/noticias"),
  courses: () => request<{ items: CourseDto[] }>("GET", "/v1/ecosistema/cursos"),
  // Aula: estudiar un curso de la Escuela Virtual dentro de la app.
  myCourses: () => request<{ items: MyCourseDto[] }>("GET", "/v1/ecosistema/mis-cursos"),
  aula: (slug: string) => request<AulaCourseDto>("GET", `/v1/ecosistema/cursos/${slug}`),
  aulaEnroll: (slug: string) =>
    request<AulaCourseDto>("POST", `/v1/ecosistema/cursos/${slug}/inscripcion`, {}),
  aulaComplete: (slug: string, lesson: string) =>
    request<AulaProgressDto>(
      "POST",
      `/v1/ecosistema/cursos/${slug}/lecciones/${lesson}/completar`,
      {},
    ),
  aulaQuiz: (slug: string, lesson: string) =>
    request<AulaQuizDto>("GET", `/v1/ecosistema/cursos/${slug}/lecciones/${lesson}/evaluacion`),
  aulaSubmitQuiz: (slug: string, lesson: string, answers: Record<string, number>) =>
    request<AulaQuizResultDto>(
      "POST",
      `/v1/ecosistema/cursos/${slug}/lecciones/${lesson}/evaluacion`,
      { answers },
    ),
  storeCategories: () =>
    request<{ items: StoreCategoryDto[] }>("GET", "/v1/ecosistema/tienda/categorias", undefined, {
      timeoutMs: 45_000,
    }),
  // La primera carga lee todas las páginas de la tienda; luego el servidor la tiene en memoria.
  storeCatalog: (categoria?: string) =>
    request<StoreCatalogDto>(
      "GET",
      `/v1/ecosistema/tienda/catalogo${categoria ? `?categoria=${encodeURIComponent(categoria)}` : ""}`,
      undefined,
      { timeoutMs: 45_000 },
    ),
  storeSearch: (q: string) =>
    request<StoreSearchDto>("GET", `/v1/ecosistema/tienda?q=${encodeURIComponent(q)}`, undefined, {
      keep5xx: true,
    }),
  communityList: (opts: { topic?: CommunityTopic; q?: string; before?: string } = {}) => {
    const p = new URLSearchParams();
    if (opts.topic) p.set("topic", opts.topic);
    if (opts.q) p.set("q", opts.q);
    if (opts.before) p.set("before", opts.before);
    return request<{ items: CommunityPostDto[]; nextBefore: string | null }>(
      "GET",
      `/v1/comunidad?${p.toString()}`,
    );
  },
  communityThread: (id: string) => request<CommunityThreadDto>("GET", `/v1/comunidad/${id}`),
  communityPost: (input: CommunityPostCreate) =>
    request<CommunityPostDto>("POST", "/v1/comunidad", input),
  communityReply: (id: string, body: string) =>
    request<CommunityReplyDto>("POST", `/v1/comunidad/${id}/respuestas`, { body }),
  communityRemove: (kind: "post" | "reply", id: string) =>
    request<{ ok: true }>("DELETE", `/v1/comunidad/${kind}/${id}`),
  communityReport: (kind: "post" | "reply", id: string) =>
    request<{ hidden: boolean }>("POST", `/v1/comunidad/${kind}/${id}/reporte`),
  logout: () => request<{ ok: true }>("POST", "/v1/auth/logout"),
  me: () => request<SessionDto>("GET", "/v1/auth/me"),
  saveAvatar: (image: string | null) => request<SessionDto>("PUT", "/v1/me/avatar", { image }),
  demoUsers: () => request<DemoUserDto[]>("GET", "/v1/demo/users"),
  demoLogin: (key: string) => request<SessionDto>("POST", "/v1/demo/login", { key }),
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
