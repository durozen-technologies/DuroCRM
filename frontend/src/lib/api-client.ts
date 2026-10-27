import { clearAccessToken, getAccessToken } from "./auth";

export function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const configuredUrl = process.env.NEXT_PUBLIC_API_URL;
    // If explicitly pointed to an external non-localhost URL (e.g. https://api.crm.durozen.in/api)
    if (configuredUrl && !configuredUrl.includes("localhost") && !configuredUrl.includes("127.0.0.1")) {
      return configuredUrl.replace(/\/$/, "");
    }
    // In browser on production domain (e.g. crm.durozen.in), always use relative "/api"
    if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      return "/api";
    }
    return (configuredUrl || "/api").replace(/\/$/, "");
  }
  return (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api").replace(/\/$/, "");
}

export const API_DATA_CHANGED_EVENT = "durozen:data-changed";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiClientResponse(path: string, init: RequestInit = {}) {
  const token = getAccessToken();
  const response = await fetch(`${getApiUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const responseText = await response.text();
    let message = responseText;
    let tokenExpired = false;
    try {
      const body: unknown = JSON.parse(responseText);
      if (body && typeof body === "object") {
        if ("code" in body) tokenExpired = body.code === "TOKEN_EXPIRED";
        if ("message" in body) {
          const detail = body.message;
          message = Array.isArray(detail)
            ? detail.join(", ")
            : String(detail);
        }
      }
    } catch {
      message = responseText;
    }
    if (
      response.status === 401 &&
      path !== "/auth/login" &&
      path !== "/auth/logout" &&
      typeof window !== "undefined"
    ) {
      if (tokenExpired) {
        window.sessionStorage.setItem("durozen_token_expired", "true");
      }
      clearAccessToken();
      window.location.assign("/login");
    }
    throw new ApiError(message || "The request could not be completed.", response.status);
  }
  const method = (init.method ?? "GET").toUpperCase();
  if (
    typeof window !== "undefined" &&
    !["GET", "HEAD", "OPTIONS"].includes(method)
  ) {
    window.dispatchEvent(new Event(API_DATA_CHANGED_EVENT));
  }
  return response;
}

export async function apiClient<T>(path: string, init: RequestInit = {}) {
  const response = await apiClientResponse(path, init);
  return response.json() as Promise<T>;
}

export async function apiClientNullable<T>(
  path: string,
  init: RequestInit = {},
): Promise<T | null> {
  const response = await apiClientResponse(path, init);
  const body = await response.text();
  return body ? (JSON.parse(body) as T) : null;
}

export async function logoutAndRedirect(): Promise<void> {
  let logoutFailed = false;
  try {
    await apiClient<{ message: string }>("/auth/logout", { method: "POST" });
  } catch {
    logoutFailed = true;
  } finally {
    clearAccessToken();
    if (logoutFailed && typeof window !== "undefined") {
      window.sessionStorage.setItem(
        "durozen_logout_warning",
        "The local session was cleared, but the server could not confirm token revocation.",
      );
    }
    if (typeof window !== "undefined") window.location.assign("/login");
  }
}
