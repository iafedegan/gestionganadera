// Función de Vercel: carga la API empaquetada durante la compilación (scripts/vercel-prepare.mjs).
const app = require("./_app.cjs");
module.exports = app.default ?? app;
