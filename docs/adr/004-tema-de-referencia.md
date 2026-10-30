# ADR-004 · Tema visual alineado con las pantallas de referencia

Estado: **implementado** (29 oct 2026).

## Decisión

La interfaz de la aplicación sigue la composición y los colores de las 8 pantallas de referencia entregadas (Inicio, Animales, Producción, Reproducción, Sanidad, Pasturas, Economía y Asistencia técnica): barra lateral verde con ilustración del hato, barra superior crema con el nombre del sistema y la finca, encabezado de página con cuadro de ícono y título en negrita, tarjetas blancas con encabezado (ícono, título, subtítulo, acción), mosaicos pastel con ilustración, botones azules y verde oscuro para altas, y tabla con ficha lateral.

Esto **reemplaza** lo decidido antes de seguir el manual de CONtexto Ganadero en la aplicación (botones dorados, titulares en Playfair). El manual sigue rigiendo la **landing** y la pantalla de acceso (marca, tipografía editorial, oro).

## Ilustraciones

`apps/web/public/art/*.png` son **recortes de las imágenes de referencia** (hato de la barra lateral, mosaicos de Inicio, tarjeta «Apoyo para decidir» y fotos de la ficha). Resolución baja (≈120 a 270 px) y con fondo propio, por eso se funden con máscaras. **Deben sustituirse por los archivos finales** de arte (PNG/SVG con fondo transparente) cuando existan.

## Honestidad de datos

Las pantallas de referencia muestran datos de ejemplo. La aplicación solo muestra datos reales: donde un módulo aún no existe (agenda, planes, sesión de manejo, producción, reproducción…) se dibuja el espacio de la tarjeta con filas fantasma y la etiqueta de la semana en que llegará, nunca cifras inventadas.

## Límites

- Con pantallas de menos de 1440 px de ancho, la ficha del animal se abre como panel lateral en vez de ir junto a la tabla.
- No hay selector de finca ni de período en la barra superior; llegarán con el módulo de reportes.
- Los módulos 3 a 8 son vistas previas de su estructura, no funciones.
