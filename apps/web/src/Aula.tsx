import type {
  AulaCourseDto,
  AulaLessonDto,
  AulaQuizDto,
  AulaQuizResultDto,
  CourseDto,
} from "@ganaderia/contracts";
import {
  ArrowLeft,
  Award,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Lock,
  PlayCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, NetworkError, api } from "./lib/api";

const msg = (e: unknown) =>
  e instanceof NetworkError
    ? "Sin conexión. Necesita internet para estudiar."
    : e instanceof ApiError
      ? e.message
      : "No se pudo completar. Intente de nuevo.";

const kindIcon = (l: AulaLessonDto) =>
  l.kind === "quiz" ? (
    <Award size={18} aria-hidden="true" />
  ) : l.kind === "lectura" ? (
    <BookOpen size={18} aria-hidden="true" />
  ) : (
    <PlayCircle size={18} aria-hidden="true" />
  );

/**
 * Estudiar un curso de la Escuela Virtual sin salir de la app: inscribirse, ver las lecciones, marcar
 * el avance, presentar evaluaciones y obtener el certificado. El servidor habla con la Escuela.
 */
export function AulaDialog({ course, onClose }: { course: CourseDto; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<AulaCourseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.aula(course.slug));
      setError(null);
    } catch (e) {
      setError(msg(e));
    }
  }, [course.slug]);

  useEffect(() => {
    ref.current?.showModal();
    void load();
  }, [load]);

  const lessons = data?.modules.flatMap((m) => m.lessons) ?? [];
  const current = lessons.find((l) => l.id === lessonId) ?? null;
  const enrolled = Boolean(data?.enrollment);

  async function enroll() {
    setBusy(true);
    setHint(null);
    try {
      setData(await api.aulaEnroll(course.slug));
    } catch (e) {
      setHint(msg(e));
    } finally {
      setBusy(false);
    }
  }

  const nextOf = (id: string) => {
    const i = lessons.findIndex((l) => l.id === id);
    return lessons.slice(i + 1).find((l) => l.available) ?? null;
  };
  const resume =
    lessons.find((l) => l.available && !l.done) ?? lessons.find((l) => l.available) ?? null;

  return (
    <dialog ref={ref} className="dialog dialog-form" onClose={onClose} aria-labelledby="aula-t">
      <header className="dialog-head">
        <button
          type="button"
          className="icon-btn"
          aria-label={current ? "Volver al curso" : "Cerrar"}
          onClick={() => (current ? setLessonId(null) : ref.current?.close())}
        >
          {current ? <ArrowLeft size={18} aria-hidden="true" /> : "✕"}
        </button>
        <h2 id="aula-t">{current ? current.title : course.title}</h2>
      </header>
      <div className="dialog-body">
        {error && !data && (
          <div className="aula-error" role="alert">
            <p>{error}</p>
            <button type="button" className="btn btn-primary" onClick={() => void load()}>
              Reintentar
            </button>
            <a className="eco-out" href={course.url} target="_blank" rel="noopener noreferrer">
              Abrir en la Escuela Virtual <ExternalLink size={14} aria-hidden="true" />
            </a>
          </div>
        )}
        {!data && !error && <p className="hint">Cargando el curso…</p>}
        {data && current && (
          <LessonView
            key={current.id}
            course={data}
            lesson={current}
            enrolled={enrolled}
            next={nextOf(current.id)}
            onOpen={setLessonId}
            onBack={() => setLessonId(null)}
            onChanged={load}
          />
        )}
        {data && !current && (
          <>
            {data.image && <img className="eco-img eco-cd-img" src={data.image} alt="" />}
            <p className="eco-meta">
              {[
                data.level,
                `${lessons.length} lecciones`,
                data.minutes ? `${data.minutes} min` : null,
              ]
                .filter(Boolean)
                .map((f) => (
                  <span key={String(f)}>{f}</span>
                ))}
            </p>
            {data.instructor && <p className="eco-text">Instructor: {data.instructor}</p>}

            {data.enrollment ? (
              <div className="aula-progress">
                <div
                  className="aula-bar"
                  role="img"
                  aria-label={`Avance ${data.enrollment.percent} %`}
                >
                  <span style={{ width: `${data.enrollment.percent}%` }} />
                </div>
                <p className="hint">
                  {data.enrollment.done} de {data.enrollment.total} lecciones ·{" "}
                  {data.enrollment.percent} %
                </p>
                {resume && !data.enrollment.completedAt && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setLessonId(resume.id)}
                  >
                    {data.enrollment.done > 0 ? "Continuar" : "Empezar"}
                  </button>
                )}
                {data.enrollment.certificate && (
                  <div className="aula-cert">
                    <Award size={28} aria-hidden="true" />
                    <div>
                      <strong>¡Curso terminado!</strong>
                      <p>
                        Certificado <b>{data.enrollment.certificate.code}</b>
                      </p>
                      <a
                        className="eco-out"
                        href={data.enrollment.certificate.verifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Comprobar certificado <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="aula-progress">
                <p className="eco-text">
                  Gratis, a su ritmo. Inscríbase para guardar su avance y obtener el certificado.
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void enroll()}
                >
                  {busy ? "Inscribiendo…" : "Inscribirme gratis"}
                </button>
              </div>
            )}
            {hint && (
              <p className="hint" role="alert">
                {hint}
              </p>
            )}

            {data.outcomes.length > 0 && (
              <>
                <h3 className="eco-sub">Lo que aprenderá</h3>
                <ul className="eco-checks">
                  {data.outcomes.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </>
            )}
            <h3 className="eco-sub">Lecciones</h3>
            {data.modules.map((m) => (
              <div key={m.id} className="eco-module">
                <p className="eco-module-title">{m.title}</p>
                <ul className="aula-lessons">
                  {m.lessons.map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        className={l.done ? "aula-row done" : "aula-row"}
                        onClick={() =>
                          l.available
                            ? setLessonId(l.id)
                            : setHint("Inscríbase para ver esta lección.")
                        }
                      >
                        <span className="aula-ic">
                          {l.done ? (
                            <CheckCircle2 size={20} aria-hidden="true" />
                          ) : l.available ? (
                            kindIcon(l)
                          ) : (
                            <Lock size={18} aria-hidden="true" />
                          )}
                        </span>
                        <span className="aula-t">{l.title}</span>
                        <small>
                          {l.preview && !enrolled ? "Vista previa · " : ""}
                          {l.kind === "quiz" ? "Evaluación" : l.minutes ? `${l.minutes} min` : ""}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </div>
    </dialog>
  );
}

function LessonView(props: {
  course: AulaCourseDto;
  lesson: AulaLessonDto;
  enrolled: boolean;
  next: AulaLessonDto | null;
  onOpen(id: string): void;
  onBack(): void;
  onChanged(): Promise<void>;
}) {
  const { course, lesson, enrolled, next } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function done() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.aulaComplete(course.slug, lesson.id);
      await props.onChanged();
      if (r.completedAt) props.onBack();
      else if (next) props.onOpen(next.id);
      else props.onBack();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {lesson.kind === "video" && lesson.video && (
        <div className="aula-video">
          {lesson.video.type === "file" ? (
            // biome-ignore lint/a11y/useMediaCaption: videos de la Escuela sin pista de subtítulos
            <video controls src={lesson.video.src} preload="metadata" />
          ) : (
            <iframe
              src={lesson.video.src}
              title={lesson.title}
              loading="lazy"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          )}
        </div>
      )}
      {lesson.content && <p className="eco-text aula-content">{lesson.content}</p>}
      {lesson.resource && (
        <a className="eco-out" href={lesson.resource.url} target="_blank" rel="noopener noreferrer">
          {lesson.resource.label} <ExternalLink size={14} aria-hidden="true" />
        </a>
      )}

      {lesson.kind === "quiz" ? (
        enrolled ? (
          <Quiz course={course} lesson={lesson} onChanged={props.onChanged} onBack={props.onBack} />
        ) : (
          <p className="hint">Inscríbase al curso para presentar la evaluación.</p>
        )
      ) : (
        <>
          {error && (
            <p className="hint" role="alert">
              {error}
            </p>
          )}
          <div className="aula-actions">
            {enrolled && !lesson.done && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void done()}
              >
                {busy ? "Guardando…" : next ? "Marcar como vista y seguir" : "Marcar como vista"}
              </button>
            )}
            {(lesson.done || !enrolled) && next && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => props.onOpen(next.id)}
              >
                Siguiente lección
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={props.onBack}>
              Ver todas las lecciones
            </button>
          </div>
          {!enrolled && (
            <p className="hint">Esta es una vista previa. Inscríbase para guardar su avance.</p>
          )}
        </>
      )}
    </>
  );
}

function Quiz(props: {
  course: AulaCourseDto;
  lesson: AulaLessonDto;
  onChanged(): Promise<void>;
  onBack(): void;
}) {
  const { course, lesson } = props;
  const [quiz, setQuiz] = useState<AulaQuizDto | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<AulaQuizResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.aulaQuiz(course.slug, lesson.id).then(setQuiz, (e) => setError(msg(e)));
  }, [course.slug, lesson.id]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.aulaSubmitQuiz(course.slug, lesson.id, answers);
      setResult(r);
      if (r.passed) await props.onChanged();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  if (error && !quiz)
    return (
      <p className="hint" role="alert">
        {error}
      </p>
    );
  if (!quiz) return <p className="hint">Cargando la evaluación…</p>;
  if (quiz.questions.length === 0)
    return <p className="hint">Esta evaluación aún no tiene preguntas.</p>;

  if (result) {
    return (
      <output className="aula-result">
        <h3 className="eco-sub">
          {result.passed ? "¡Aprobó!" : "No alcanzó la nota mínima"} · {result.score} %
        </h3>
        <p className="hint">Nota mínima: {quiz.passScore} %</p>
        {result.wrong.length > 0 && (
          <ul className="eco-checks">
            {result.wrong.map((w) => (
              <li key={w.question}>
                <b>{w.question}</b>
                {w.explanation && <span> — {w.explanation}</span>}
              </li>
            ))}
          </ul>
        )}
        {result.passed ? (
          <button type="button" className="btn btn-primary" onClick={props.onBack}>
            {result.certificate ? "Ver mi certificado" : "Volver al curso"}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setResult(null);
              setAnswers({});
            }}
          >
            Intentar de nuevo
          </button>
        )}
      </output>
    );
  }

  const complete = quiz.questions.every((q) => answers[q.id] !== undefined);
  return (
    <form
      className="aula-quiz"
      onSubmit={(e) => {
        e.preventDefault();
        if (complete) void submit();
      }}
    >
      {quiz.questions.map((q, i) => (
        <fieldset key={q.id}>
          <legend>
            {i + 1}. {q.question}
          </legend>
          {q.options.map((o, oi) => (
            <label key={o} className="aula-opt">
              <input
                type="radio"
                name={`q-${q.id}`}
                checked={answers[q.id] === oi}
                onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
              />
              <span>{o}</span>
            </label>
          ))}
        </fieldset>
      ))}
      {error && (
        <p className="hint" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={!complete || busy}>
        {busy ? "Calificando…" : "Enviar respuestas"}
      </button>
    </form>
  );
}
