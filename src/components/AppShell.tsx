import { Link } from "@tanstack/react-router";
import { Home, MoreHorizontal, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

// ============================================================
// AppShell — casca única do ERP Solução Móveis (SMERP).
// Sidebar esquerda recolhível (shadcn) no desktop; no celular vira
// uma barra de abas fixa embaixo (app nativo) — os itens marcados
// `primary: true` aparecem como aba, o resto fica atrás de "Mais".
// Mantenha este arquivo IGUAL entre comprasolucao / hora-hora-fabrill / bip-solucao
// (Compras é a referência). Veja DESIGN-SYSTEM.md.
// ============================================================

export type NavItem = { to: string; label: string; icon: LucideIcon; primary?: boolean };

export type AppShellProps = {
  /** Marca exibida no topo da sidebar. */
  brand: { logo: string; title: string; subtitle?: string };
  /** Itens de navegação (mesma ordem em que aparecem na lateral). */
  navItems: NavItem[];
  /** Caminho atual da rota (cada app passa do seu router). */
  pathname: string;
  /** Matcher de item ativo. Padrão: igual ou prefixo de rota. */
  isActive?: (to: string, pathname: string) => boolean;
  /** Título mostrado no cabeçalho da página. */
  pageTitle?: string;
  /** Usuário logado (para exibir o e-mail no rodapé). */
  user?: { email?: string | null } | null;
  /** URL do hub ERP para o link "Voltar ao ERP". */
  erpUrl: string;
  /** Conteúdo extra à direita do cabeçalho (ex.: sino de notificações). */
  headerRight?: ReactNode;
  children: ReactNode;
};

const defaultIsActive = (to: string, pathname: string) =>
  pathname === to || pathname.startsWith(to + "/");

// Lê o estado salvo da sidebar para manter recolhida/expandida entre navegações.
function readSidebarDefaultOpen() {
  if (typeof document === "undefined") return true;
  const m = document.cookie.match(/(?:^|;\s*)sidebar_state=([^;]+)/);
  return m ? m[1] === "true" : true;
}

export function AppShell({
  brand,
  navItems,
  pathname,
  isActive = defaultIsActive,
  pageTitle,
  user,
  erpUrl,
  headerRight,
  children,
}: AppShellProps) {
  const isMobile = useIsMobile();
  const [maisOpen, setMaisOpen] = useState(false);
  const hasPrimaryFlags = navItems.some((i) => i.primary);
  const primaryItems = hasPrimaryFlags ? navItems.filter((i) => i.primary) : navItems.slice(0, 4);
  const secondaryItems = hasPrimaryFlags ? navItems.filter((i) => !i.primary) : navItems.slice(4);

  return (
    <SidebarProvider defaultOpen={readSidebarDefaultOpen()}>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-1 py-1">
            <img
              src={brand.logo}
              alt={brand.title}
              className="h-9 w-9 shrink-0 rounded-md bg-white object-contain"
            />
            <div className="grid flex-1 leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-semibold">{brand.title}</span>
              {brand.subtitle && (
                <span className="truncate text-xs text-muted-foreground">{brand.subtitle}</span>
              )}
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const active = isActive(item.to, pathname);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link to={item.to}>
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          {user?.email && (
            <p className="truncate px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              {user.email}
            </p>
          )}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Voltar ao ERP">
                <a href={erpUrl}>
                  <Home />
                  <span>Voltar ao ERP</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-4">
          <SidebarTrigger className="hidden h-8 w-8 md:flex" />
          <Separator orientation="vertical" className="mr-1 hidden h-5 md:block" />
          <div className="flex items-center gap-2 md:hidden">
            <img src={brand.logo} alt={brand.title} className="h-7 w-7 shrink-0 rounded-md bg-white object-contain" />
          </div>
          <h1 className="truncate text-sm font-semibold">{pageTitle ?? brand.title}</h1>
          <div className="ml-auto flex items-center gap-1">
            {headerRight}
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1">
          <div className="mx-auto w-full max-w-7xl p-4 pb-24 md:p-8">{children}</div>
        </main>

        {isMobile && (
          <nav
            className="fixed inset-x-0 bottom-0 z-20 flex items-stretch border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {primaryItems.map((item) => {
              const active = isActive(item.to, pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="max-w-full truncate px-1">{item.label}</span>
                </Link>
              );
            })}

            {secondaryItems.length > 0 && (
              <Sheet open={maisOpen} onOpenChange={setMaisOpen}>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground"
                  >
                    <MoreHorizontal className="h-5 w-5" />
                    <span>Mais</span>
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="rounded-t-2xl">
                  <SheetHeader>
                    <SheetTitle>Mais opções</SheetTitle>
                  </SheetHeader>
                  <div className="grid grid-cols-3 gap-3 py-4">
                    {secondaryItems.map((item) => {
                      const active = isActive(item.to, pathname);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setMaisOpen(false)}
                          className={cn(
                            "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center text-xs font-medium",
                            active ? "border-primary text-primary" : "text-foreground",
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                  <div className="border-t pt-3">
                    {user?.email && (
                      <p className="truncate px-1 pb-2 text-xs text-muted-foreground">{user.email}</p>
                    )}
                    <a
                      href={erpUrl}
                      className="flex items-center gap-2 rounded-lg p-2 text-sm text-foreground hover:bg-accent"
                    >
                      <Home className="h-4 w-4" />
                      Voltar ao ERP
                    </a>
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </nav>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
