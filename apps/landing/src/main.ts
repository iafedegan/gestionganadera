import "@fontsource-variable/inter";
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/jetbrains-mono/500.css";
import "@ganaderia/ui/tokens.css";
import {
  BarChart3,
  Building2,
  Calculator,
  Check,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  Coins,
  Crown,
  Download,
  Files,
  Hand,
  History,
  Home,
  LockKeyhole,
  Menu,
  Package,
  PawPrint,
  ShieldCheck,
  SignalZero,
  SmartphoneNfc,
  Sprout,
  Stethoscope,
  Store,
  Tractor,
  UserCheck,
  Users,
  VenusAndMars,
  Wifi,
  WifiOff,
  createIcons,
} from "lucide";
import "./styles.css";

createIcons({
  icons: {
    BarChart3,
    Building2,
    Calculator,
    Check,
    CheckCircle2,
    CircleHelp,
    ClipboardList,
    Coins,
    Crown,
    Download,
    Files,
    Hand,
    History,
    Home,
    LockKeyhole,
    Menu,
    Package,
    PawPrint,
    ShieldCheck,
    SignalZero,
    SmartphoneNfc,
    Sprout,
    Stethoscope,
    Store,
    Tractor,
    UserCheck,
    Users,
    VenusAndMars,
    Wifi,
    WifiOff,
  },
});

// Enlaces a la aplicación y contacto: se configuran por variables de entorno, sin valores falsos.
const appUrl = import.meta.env.VITE_APP_URL ?? "/app/";
for (const a of document.querySelectorAll<HTMLAnchorElement>("[data-app-link]")) a.href = appUrl;
for (const a of document.querySelectorAll<HTMLAnchorElement>("[data-signup-link]"))
  a.href = `${appUrl}?registro`;

const contact = import.meta.env.VITE_CONTACT_EMAIL as string | undefined;
if (contact) {
  for (const a of document.querySelectorAll<HTMLAnchorElement>("[data-contact]")) {
    a.href = `mailto:${contact}?subject=${encodeURIComponent("Demostración de Gestión Ganadera")}`;
    a.hidden = false;
  }
}

// Menú móvil
const burger = document.querySelector<HTMLButtonElement>(".burger");
const menu = document.getElementById("menu");
const header = document.querySelector(".nav");
function setMenu(open: boolean) {
  menu?.classList.toggle("open", open);
  burger?.setAttribute("aria-expanded", String(open));
  burger?.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
}
burger?.addEventListener("click", () => setMenu(!menu?.classList.contains("open")));
menu?.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).tagName === "A") setMenu(false);
});

// Barra con fondo al desplazarse
const onScroll = () => header?.classList.toggle("solid", window.scrollY > 24);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

// Aparición suave al entrar en pantalla (respeta «reducir movimiento»)
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const items = document.querySelectorAll(".reveal");
if (reduce || !("IntersectionObserver" in window)) {
  for (const el of items) el.classList.add("in");
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
  );
  for (const el of items) io.observe(el);
}
