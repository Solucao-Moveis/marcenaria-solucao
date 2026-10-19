// Tema claro/escuro — alterna a classe .dark no <html> e persiste a escolha.
// A APLICAÇÃO inicial (anti-flash) é feita por um script inline no <head>
// (ver src/routes/__root.tsx), que também lê o tema vindo do Hub (#smerp_theme).
export type Theme = "light" | "dark";

const KEY = "smerp-theme";

export function getTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
  const d = document.documentElement;
  if (t === "dark") d.classList.add("dark");
  else d.classList.remove("dark");
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
