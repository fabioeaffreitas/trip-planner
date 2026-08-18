import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const TOKEN_KEY = "trip_planner_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

/**
 * Redirects to /login if there's no token. Returns whether the check has
 * finished, so pages can avoid rendering protected content before the
 * redirect happens.
 */
export function useRequireAuth(): { ready: boolean } {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (getToken()) {
      setReady(true);
    } else {
      router.replace("/login");
    }
  }, [router]);

  return { ready };
}
