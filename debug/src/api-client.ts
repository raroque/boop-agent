import { useCallback } from "react";
import { useAuthToken } from "@convex-dev/auth/react";

export function useApiClient() {
  const token = useAuthToken();

  return useCallback(
    async (input: string, init: RequestInit = {}): Promise<Response> => {
      const headers = new Headers(init.headers);
      if (token) headers.set("authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    },
    [token],
  );
}
