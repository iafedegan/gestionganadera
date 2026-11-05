import type { ModuleKey } from "../modules";
import type { LocalFarm } from "./localdb";

/**
 * Configuración mínima de la ganadería. Mientras falte algo, la aplicación muestra solo los
 * primeros pasos y los módulos necesarios para completarlos: así las cifras, alertas y el
 * asistente parten de datos reales y no de tableros vacíos.
 */
export interface SetupStep {
  key: "finca" | "area" | "ubicacion" | "animales";
  done: boolean;
  title: string;
  text: string;
  module: ModuleKey;
}

export interface SetupState {
  /** Todavía leyendo la copia local: no se bloquea nada para evitar parpadeos. */
  loading: boolean;
  ready: boolean;
  steps: SetupStep[];
}

/** Módulos que se pueden abrir mientras la configuración está incompleta. */
export const SETUP_MODULES: ModuleKey[] = ["inicio", "configuracion", "animales"];

export function setupSteps(farms: LocalFarm[], animals: number): SetupStep[] {
  const hasArea = farms.some((f) => (f.totalAreaHa ?? 0) > 0 && (f.livestockAreaHa ?? 0) > 0);
  const hasPlace = farms.some(
    (f) => (f.latitude != null && f.longitude != null) || Boolean(f.locationText?.trim()),
  );
  return [
    {
      key: "finca",
      done: farms.length > 0,
      title: "Registre su finca",
      text: "Nombre de la finca y especies que maneja.",
      module: "configuracion",
    },
    {
      key: "area",
      done: hasArea,
      title: "Indique el tamaño de la finca",
      text: "Área total y área en ganadería, para calcular la carga animal.",
      module: "configuracion",
    },
    {
      key: "ubicacion",
      done: hasPlace,
      title: "Ubique la finca",
      text: "En el mapa o con el municipio: así recibe el clima y el tipo de suelo.",
      module: "configuracion",
    },
    {
      key: "animales",
      done: animals > 0,
      title: "Registre sus animales",
      text: "Con el número de chapeta, especie, sexo y categoría.",
      module: "animales",
    },
  ];
}
