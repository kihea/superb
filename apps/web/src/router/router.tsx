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

function currentPath(): string {
  return window.location.pathname || "/";
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
    if (options?.replace) window.history.replaceState(null, "", to);
    else window.history.pushState(null, "", to);
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
}: {
  to: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <a
      href={to}
      className={className}
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
