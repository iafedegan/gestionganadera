import type {
  AnimalCommand,
  AnimalEventCommand,
  AnimalEventPayload,
  Category,
  Sex,
  Species,
} from "@ganaderia/contracts";
import { uuidv7, validateRegistration } from "@ganaderia/domain";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFarms } from "./animals";
import {
  type Animal,
  type CmtRec,
  FEMALES,
  HERD,
  type HealthEvent,
  LACTATING,
  type MilkDay,
  type RepEvent,
  animalOf as sampleAnimalOf,
  speciesOf as sampleSpeciesOf,
} from "./herd";
import { addDays, ago, daysBetween, iso, today } from "./kit";
import { todayLocal } from "./labels";
import { reviewAnimalEvent } from "./lib/animalHistory";
import { type LocalAnimalEvent, type LocalHerdAnimal, localdb } from "./lib/localdb";
import { isDemoScope } from "./lib/scope";
import { useApp } from "./state";

/**
 * Puente entre las pantallas y los datos. Con animales registrados entrega el hato y los eventos
 * reales de la base local; sin animales entrega el hato de ejemplo, para poder conocer el módulo.
 */

export type RealAnimal = Animal & { id: string; farmId: string };
export interface Pesaje {
  fecha: string;
  tag: string;
  peso: number;
  metodo: string;
}

const MILK_DAYS = 21;
const LABEL: Record<string, string> = {
  vaca: "Vaca",
  novilla: "Novilla",
  novillo: "Novillo",
  toro: "Toro",
  otro: "Otro",
};

/** El evento sin sus identificadores, conservando la relación entre `type` y `data`. */
export type EventInput = AnimalEventPayload extends infer E
  ? E extends AnimalEventPayload
    ? Omit<E, "id" | "animalId">
    : never
  : never;

/** Días de lactancia en que se seca, o null si la finca aún no lo definió. */
type DryOffLookup = (tag: string) => number | null;

export function toAnimal(a: LocalHerdAnimal, events: LocalAnimalEvent[]): RealAnimal {
  const mine = events.filter((e) => e.animalId === a.id);
  const lastPeso = mine
    .filter((e) => e.type === "peso")
    .sort((x, y) => (x.occurredOn < y.occurredOn ? 1 : -1))[0];
  const since = ago(7);
  const litros = mine
    .filter((e) => e.type === "leche" && e.occurredOn >= since)
    .reduce((s, e) => s + (e.type === "leche" ? e.data.liters : 0), 0);
  return {
    id: a.id,
    farmId: a.farmId,
    tag: a.tag,
    species: a.species as Species,
    sex: a.sex as Sex,
    cat:
      a.category === "ternero"
        ? a.sex === "hembra"
          ? "Ternera"
          : "Ternero"
        : (LABEL[a.category] ?? a.category),
    born: a.birthDate ? daysBetween(a.birthDate, iso(today())) : 0,
    lot: "",
    breed: "",
    weight: lastPeso?.type === "peso" ? lastPeso.data.kg : 0,
    milk: Math.round((litros / 7) * 10) / 10,
  };
}

export function toRep(e: LocalAnimalEvent): RepEvent | null {
  const base = { tag: e.tag, fecha: e.occurredOn };
  const obs = (note?: string) => (note ? { obs: note } : {});
  switch (e.type) {
    case "servicio":
      return {
        ...base,
        tipo: "servicio",
        via: e.data.via,
        macho: e.data.sire,
        ...obs(e.data.note),
      };
    case "celo":
      return { ...base, tipo: "celo", ...obs(e.data.note) };
    case "dx":
      return {
        ...base,
        tipo: "dx",
        resultado: e.data.result,
        obs: [e.data.method, e.data.note].filter(Boolean).join(" · "),
      };
    case "parto":
      return {
        ...base,
        tipo: "parto",
        ...(e.data.calfTag ? { cria: e.data.calfTag } : {}),
        ...(e.data.calfSex ? { sexo: e.data.calfSex } : {}),
        ...(e.data.birthWeightKg ? { peso: String(e.data.birthWeightKg) } : {}),
        ...obs(e.data.note),
      };
    case "aborto":
    case "secado":
      return { ...base, tipo: e.type, ...obs(e.data.note) };
    default:
      return null;
  }
}

export function useHerdData() {
  const { orgId, dataVersion, session, online, refresh, syncNow } = useApp();
  const farms = useFarms();
  const [herd, setHerd] = useState<LocalHerdAnimal[]>([]);
  const [events, setEvents] = useState<LocalAnimalEvent[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion fuerza la relectura
  useEffect(() => {
    if (!orgId) return;
    void localdb.herdAnimals(orgId).then(setHerd);
    void localdb.listAnimalEvents(orgId).then(setEvents);
  }, [orgId, dataVersion]);

  // Fuera de la cuenta demo siempre se usan los datos reales, aunque estén vacíos.
  const real = herd.length > 0 || !isDemoScope();
  const animals = useMemo(() => herd.map((a) => toAnimal(a, events)), [herd, events]);
  const byTag = useMemo(() => new Map(animals.map((a) => [a.tag, a])), [animals]);

  const females = useMemo(
    () =>
      real
        ? (animals.filter(
            (a) => a.sex === "hembra" && (a.cat === "Vaca" || a.cat === "Novilla"),
          ) as Animal[])
        : FEMALES,
    [real, animals],
  );
  const lactating = useMemo(() => {
    if (!real) return LACTATING;
    return animals.filter((a) => {
      if (a.sex !== "hembra" || a.cat !== "Vaca") return false;
      const mine = events.filter((e) => e.animalId === a.id);
      const lastOf = (t: string) =>
        mine
          .filter((e) => e.type === t)
          .map((e) => e.occurredOn)
          .sort()
          .pop();
      const secado = lastOf("secado");
      const parto = lastOf("parto");
      return !secado || Boolean(parto && parto > secado);
    }) as Animal[];
  }, [real, animals, events]);
  const growing = useMemo(
    () =>
      real
        ? (animals.filter((a) =>
            ["Ternera", "Ternero", "Novilla", "Novillo"].includes(a.cat),
          ) as Animal[])
        : HERD.filter((a) => a.lot === "Levante" || a.lot === "Crías"),
    [real, animals],
  );

  const rep = useMemo(() => events.map(toRep).filter((e): e is RepEvent => e !== null), [events]);
  const health = useMemo<HealthEvent[]>(
    () =>
      events.flatMap((e) =>
        e.type === "salud"
          ? [
              {
                tipo: e.data.kind,
                sujeto: e.tag,
                fecha: e.occurredOn,
                producto: e.data.product,
                motivo: e.data.reason,
                ...(e.data.dose ? { dosis: e.data.dose } : {}),
                responsable: e.data.responsible,
                costo: e.data.cost ?? 0,
                retiroLeche: e.data.milkWithdrawalDays,
                retiroCarne: e.data.meatWithdrawalDays,
              },
            ]
          : [],
      ),
    [events],
  );
  const cmt = useMemo<CmtRec[]>(
    () =>
      events.flatMap((e) =>
        e.type === "cmt" ? [{ fecha: e.occurredOn, tag: e.tag, ...e.data }] : [],
      ),
    [events],
  );
  const pesos = useMemo<Pesaje[]>(
    () =>
      events.flatMap((e) =>
        e.type === "peso"
          ? [{ fecha: e.occurredOn, tag: e.tag, peso: e.data.kg, metodo: e.data.method }]
          : [],
      ),
    [events],
  );
  const milkDays = useMemo<MilkDay[]>(() => {
    const days: MilkDay[] = Array.from({ length: MILK_DAYS }, (_, i) => ({
      fecha: addDays(iso(today()), i - MILK_DAYS + 1),
      litros: {},
    }));
    const index = new Map(days.map((d) => [d.fecha, d]));
    for (const e of events) {
      if (e.type !== "leche") continue;
      const day = index.get(e.occurredOn);
      if (day) day.litros[e.tag] = (day.litros[e.tag] ?? 0) + e.data.liters;
    }
    return days;
  }, [events]);

  const dryOffDays = useCallback<DryOffLookup>(
    (tag) => {
      const a = byTag.get(tag);
      if (!a) return null;
      const farm = farms.find((f) => f.id === a.farmId);
      return farm?.speciesSettings[a.species]?.dryOffDays ?? null;
    },
    [byTag, farms],
  );

  /** Revisa con la historia del animal si lo que se va a registrar cuadra. */
  const review = useCallback(
    (type: AnimalEventPayload["type"], tag: string, occurredOn: string, kg?: number) => {
      const animal = byTag.get(tag);
      if (!real || !animal) return null;
      return reviewAnimalEvent(
        { type, occurredOn, ...(kg === undefined ? {} : { kg }) },
        tag,
        events.filter((e) => e.animalId === animal.id),
        todayLocal(),
      );
    },
    [real, byTag, events],
  );

  /** Guarda uno o varios eventos en el dispositivo y los envía si hay conexión. */
  const record = useCallback(
    async (items: { tag: string; event: EventInput }[]) => {
      const commands: { command: AnimalEventCommand; farmId: string; label: string }[] = [];
      for (const { tag, event } of items) {
        const a = byTag.get(tag);
        if (!a) throw new Error(`El animal ${tag} no está en este dispositivo.`);
        commands.push({
          farmId: a.farmId,
          label: `${tag} · ${event.type}`,
          command: {
            id: uuidv7(),
            type: "animal.event.record",
            clientTs: new Date().toISOString(),
            payload: { id: uuidv7(), animalId: a.id, ...event } as AnimalEventPayload,
          },
        });
      }
      await localdb.enqueueAnimalEvents({ orgId, items: commands });
      await refresh();
      if (online) void syncNow();
    },
    [byTag, orgId, online, refresh, syncNow],
  );

  /** Alta de la cría de un parto, vinculada a su madre. Devuelve el error si no se pudo crear. */
  const registerCalf = useCallback(
    async (motherTag: string, calfTag: string, sex: Sex, born: string): Promise<string | null> => {
      const mother = byTag.get(motherTag);
      if (!mother) return "No se encontró la madre.";
      const payload = {
        id: uuidv7(),
        farmId: mother.farmId,
        tag: calfTag.trim().toUpperCase(),
        species: mother.species,
        sex,
        category: "ternero" as Category,
        birthDate: { date: born, precision: "exacta" as const },
        motherId: mother.id,
        entry: { reason: "nacimiento" as const, occurredAt: born },
      };
      const issue = validateRegistration(payload, {
        today: todayLocal(),
        mother: { id: mother.id, species: mother.species, sex: "hembra" },
      })[0];
      if (issue) return issue.message;
      const command: AnimalCommand = {
        id: uuidv7(),
        type: "animal.register",
        clientTs: new Date().toISOString(),
        payload,
      };
      const res = await localdb.enqueueRegister({ orgId, command });
      return res.ok ? null : res.message;
    },
    [byTag, orgId],
  );

  return {
    real,
    animals: real ? (animals as Animal[]) : HERD,
    females,
    lactating,
    growing,
    animalOf: (tag: string): Animal | undefined => (real ? byTag.get(tag) : sampleAnimalOf(tag)),
    speciesOf: (tag: string): Species =>
      real ? (byTag.get(tag)?.species ?? "bovino") : sampleSpeciesOf(tag),
    rep,
    health,
    cmt,
    pesos,
    milkDays,
    dryOffDays,
    review,
    record,
    registerCalf,
    responsible: session?.displayName ?? "",
  };
}
