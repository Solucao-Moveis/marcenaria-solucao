import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Timer, BarChart3, History, Settings2, Lock, Home } from "lucide-react";
import { AppShell, type NavItem } from "@/components/AppShell";
import logo from "@/assets/logo-solucao-moveis.png";

// SMERP: hub central (para o botão "Voltar ao ERP")
const ERP_URL = "https://solucaomoveis-erp.h5xdag.easypanel.host/";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const PAPEL_LABEL = { admin: "Administrador", lider: "Líder", visualizador: "Visualizador" } as const;

function AppLayout() {
  const { user, loading, acesso, papel } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (!acesso) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-warning text-warning-foreground">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">Sem acesso à Marcenaria</h1>
          <p className="text-sm text-muted-foreground">
            Seu login ainda não foi liberado para este módulo. Peça ao administrador do ERP para
            liberar a Marcenaria na aba Usuários.
          </p>
          <Button asChild variant="outline">
            <a href={ERP_URL}><Home className="mr-2 h-4 w-4" /> Voltar ao ERP</a>
          </Button>
        </div>
      </div>
    );
  }

  const navItems: NavItem[] = [
    { to: "/", label: "Controle", icon: Timer, primary: true },
    { to: "/dashboard", label: "Dashboard", icon: BarChart3, primary: true },
    { to: "/historico", label: "Histórico", icon: History, primary: true },
    { to: "/maquinas", label: "Máquinas e metas", icon: Settings2, primary: true },
  ];

  const isActive = (to: string, pathname: string) =>
    to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");

  const pageTitle = navItems.find((it) => isActive(it.to, location.pathname))?.label;

  return (
    <AppShell
      brand={{ logo, title: "Marcenaria", subtitle: papel ? PAPEL_LABEL[papel] : undefined }}
      navItems={navItems}
      pathname={location.pathname}
      isActive={isActive}
      pageTitle={pageTitle}
      user={user}
      erpUrl={ERP_URL}
    >
      <Outlet />
    </AppShell>
  );
}
