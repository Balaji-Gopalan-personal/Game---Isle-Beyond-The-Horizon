// Stable identity for edges/roads
export function edgeId(v1: string | number, v2: string | number): string {
  const s1 = String(v1);
  const s2 = String(v2);
  return (s1 < s2) ? `${s1}__${s2}` : `${s2}__${s1}`;
}