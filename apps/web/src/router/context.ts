// The router's non-component half: the context, the two hooks that read it,
// and the path matcher. Split out from router.tsx so that file exports
// components only -- which is what Fast Refresh needs to hold a component's
// state across an edit.
import { createContext, useContext } from "react";

export interface RouterValue {
  path: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

export const RouterContext = createContext<RouterValue | null>(null);

function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (!value) throw new Error("useRouter outside a <Router>");
  return value;
}

export function usePath(): string {
  return useRouter().path;
}

export function useNavigate(): RouterValue["navigate"] {
  return useRouter().navigate;
}

/** `/book/:id` against `/book/meditations` -> `{ id: "meditations" }`, or
 *  null when the pattern does not describe this path at all. */
export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (const [i, part] of patternParts.entries()) {
    if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(pathParts[i]);
    else if (part !== pathParts[i]) return null;
  }
  return params;
}
