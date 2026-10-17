import { MU_TIERRA, RADIO_TIERRA } from './constantes';

/**
 * Gravedad a una altitud dada: g(h) = μ / (R + h)².
 * En la superficie vale μ/R² ≈ 9,8203 m/s², no g0: así el modelo es coherente con la
 * energía v²/2 − μ/r y con la gravedad vectorial del modelo 2D.
 * @param altitud altitud sobre la superficie (m)
 * @returns aceleración de la gravedad (m/s²)
 */
export function gravedad(altitud: number): number {
  const distancia = RADIO_TIERRA + altitud;
  return MU_TIERRA / (distancia * distancia);
}
