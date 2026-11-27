/** Pantalla de bienvenida de la app instalada. Repite el marcado de index.html para no saltar. */
export function Splash() {
  return (
    <output className="splash" aria-label="Abriendo FarmaGan">
      <i />
      <p>FarmaGan</p>
      <small>Su finca ordenada, con o sin señal</small>
      <span className="splash-bar" />
    </output>
  );
}
