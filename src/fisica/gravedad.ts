import { G0, RADIO_TIERRA } from './constantes';

/**
 * Gravedad a una altitud dada: g(h) = g0 · (R / (R + h))².
 * @param altitud altitud sobre la superficie (m)
 * @returns aceleración de la gravedad (m/s²)
 */
export function gravedad(altitud: number): number {
  const cociente = RADIO_TIERRA / (RADIO_TIERRA + altitud);
  return G0 * cociente * cociente;
}
