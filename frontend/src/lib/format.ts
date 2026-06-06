export const fmt = (n: number, d = 2) =>
  n?.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }) ?? "—";

export const fmtInt = (n: number) =>
  n?.toLocaleString("en-IN", { maximumFractionDigits: 0 }) ?? "—";

export const signColor = (n: number) => (n >= 0 ? "text-up" : "text-down");
export const arrow = (n: number) => (n >= 0 ? "▲" : "▼");

export function useAsync<T>() {
  // tiny helper type marker (no-op)
  return null as unknown as T;
}
