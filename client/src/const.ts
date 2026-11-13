export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export type AuthProvider = "google" | "line";

export const startLogin = (provider: AuthProvider = "google") => {
  window.location.assign(`/api/auth/${provider}`);
};
