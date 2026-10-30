/** Ruta de una ilustración publicada con la app (respeta la base /app/). */
export const art = (name: string): string => `${import.meta.env.BASE_URL}art/${name}.png`;
