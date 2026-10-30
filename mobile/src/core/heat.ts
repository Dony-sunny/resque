import type { ImpactData, ReliefDemandData } from './types';

/** Heat overlay: [lat, lon, weight 0..1] points; rings mark points that must stay visibly distinct (unverified reports). */
export interface WebHeat { points: [number, number, number][]; gradient?: Record<string, string>; rings?: [number, number][]; radius?: number }

/** Heat input from the permitted points; unverified precise reports get a dashed ring so they are never mistaken for confirmed ones.
 * Returns null when the server reports insufficient data, so no heatmap is invented. */
export function impactHeat(data: ImpactData | undefined, verifiedOnly = false): WebHeat | null {
  if (!data || data.insufficient) return null;
  const points = data.points.filter(p => !verifiedOnly || p.verified);
  return {
    points: points.map(p => [p.latitude, p.longitude, Math.max(0.05, Math.min(1, p.weight))] as [number, number, number]),
    rings: points.filter(p => !p.aggregated && !p.verified).map(p => [p.latitude, p.longitude] as [number, number]),
    radius: data.mode === 'aggregated' ? 38 : 30,
  };
}

/** Relief Demand uses its own purple scale so it is never confused with disaster intensity. */
export function demandHeat(data: ReliefDemandData | undefined): WebHeat | null {
  if (!data?.points.length) return null;
  return { points: data.points.map(p => [p.latitude, p.longitude, Math.max(0.1, p.weight)] as [number, number, number]), radius: 36, gradient: { '0.2': '#DDD6FE', '0.5': '#A78BFA', '0.8': '#7C3AED', '1': '#4C1D95' } };
}
