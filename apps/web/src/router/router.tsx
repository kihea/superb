// A router small enough to read in one sitting, rather than a dependency.
// v0 needs three things -- the current path, a way to change it, and links
// that do not reload the page -- and the History API gives all three in
// under a hundred lines. Nothing here is clever; when the app needs nested
// layouts or data loading, replace it wholesale.
//
// The hooks and the path matcher live in ./context, so this file exports
// components only.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { RouterContext, useNavigate } from "./context";

// The app stands alone at "/" but is served from a subpath (superb.works/
// read/) inside the assembled deploy -- vite.config.ts's own BASE constant,
// read back here the same way store.ts reads it. Routes stay written and
// matched in app-space ("/shelf"); the base is stripped on the way in and
// put back on the way out, so this is the only file that knows about it.
const BASE = import.meta.env.BASE_URL || "/";

function stripBase(pathname: string): string {
  if (BASE === "/") return pathname || "/";
  if (pathname === BASE || pathname + "/" === BASE) return "/";
  if (pathname.startsWith(BASE)) return "/" + pathname.slice(BASE.length);
  return pathname || "/";
}

function withBase(to: string): string {
  return BASE === "/" ? to : BASE.replace(/\/$/, "") + to;
}

function currentPath(): string {
  return stripBase(window.location.pathname || "/");
}

export function Router({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    function onPop() {
      setPath(currentPath());
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    if (to === currentPath()) return;
    if (options?.replace) window.history.replaceState(null, "", withBase(to));
    else window.history.pushState(null, "", withBase(to));
    setPath(to);
    window.scrollTo(0, 0);
  }, []);

  const value = useMemo(() => ({ path, navigate }), [path, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function Link({
  to,
  className,
  children,
  onClick,
  "aria-label": ariaLabel,
}: {
  to: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  /** Forwarded explicitly. A link whose visible text is "···" needs one,
      and dropping it silently is how the Settings link ended up with no
      accessible name at all. */
  "aria-label"?: string;
}) {
  const navigate = useNavigate();
  return (
    <a
      href={withBase(to)}
      className={className}
      aria-label={ariaLabel}
      onClick={(e) => {
        // Let a modified click open a new tab, the way any link should.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onClick?.();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
