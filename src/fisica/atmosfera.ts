import {
  ALTITUD_TROPOPAUSA,
  ALTURA_ESCALA,
  DENSIDAD_NIVEL_MAR,
  GAMMA_AIRE,
  GRADIENTE_TERMICO,
  PRESION_NIVEL_MAR,
  R_AIRE,
  TEMPERATURA_NIVEL_MAR,
  TEMPERATURA_TROPOPAUSA,
} from './constantes';
import { ALTITUDES_CAPAS_1976, datosAtmosfera1976 } from './estandar1976';

/** Modelo atmosférico: exponencial simplificado o US Standard Atmosphere 1976. */
export type TipoAtmosfera = 'exponencial' | 'estandar1976';

/** Estado de la atmósfera en una altitud. */
export interface DatosAtmosfera {
  densidad: number;         // kg/m³
  presion: number;          // Pa
  derivadaDensidad: number; // kg/m⁴, dρ/dh
  temperatura: number;      // K
  velocidadSonido: number;  // m/s
}

/** Calcula el estado de la atmósfera en una altitud (m) y lo escribe en `salida`. */
export type FuncionAtmosfera = (altitud: number, salida: DatosAtmosfera) => DatosAtmosfera;

/** Objeto vacío para `salida`. */
export function crearDatosAtmosfera(): DatosAtmosfera {
  return { densidad: 0, presion: 0, derivadaDensidad: 0, temperatura: 0, velocidadSonido: 0 };
}

/**
 * Modelo exponencial con una sola exponencial para ρ y p, y la temperatura de la atmósfera
 * estándar simplificada, para el bucle de integración.
 * Escribe en `salida` para no reservar memoria en cada llamada.
 * @param altitud (m)
 */
export function datosAtmosfera(altitud: number, salida: DatosAtmosfera): DatosAtmosfera {
  const factor = Math.exp(-altitud / ALTURA_ESCALA);
  salida.densidad = DENSIDAD_NIVEL_MAR * factor;
  salida.presion = PRESION_NIVEL_MAR * factor;
  salida.derivadaDensidad = -salida.densidad / ALTURA_ESCALA;
  salida.temperatura = temperatura(altitud);
  salida.velocidadSonido = velocidadSonido(altitud);
  return salida;
}

/** Función del modelo atmosférico elegido. */
export function funcionAtmosfera(tipo: TipoAtmosfera): FuncionAtmosfera {
  return tipo === 'estandar1976' ? datosAtmosfera1976 : datosAtmosfera;
}

/**
 * Densidad del aire, modelo exponencial: ρ(h) = ρ0 · e^(−h/H).
 * @param altitud (m)
 * @returns densidad (kg/m³)
 */
export function densidad(altitud: number): number {
  return DENSIDAD_NIVEL_MAR * Math.exp(-altitud / ALTURA_ESCALA);
}

/**
 * Derivada de la densidad respecto a la altitud: dρ/dh = −ρ(h) / H.
 * La usa la detección de Max-Q (dq/dt = 0).
 * @param altitud (m)
 * @returns dρ/dh (kg/m⁴)
 */
export function derivadaDensidad(altitud: number): number {
  return -densidad(altitud) / ALTURA_ESCALA;
}

/**
 * Presión del aire, modelo exponencial: p(h) = p0 · e^(−h/H).
 * @param altitud (m)
 * @returns presión (Pa)
 */
export function presion(altitud: number): number {
  return PRESION_NIVEL_MAR * Math.exp(-altitud / ALTURA_ESCALA);
}

/**
 * Temperatura, atmósfera estándar simplificada: gradiente lineal hasta la tropopausa
 * y constante por encima. Solo se usa para la velocidad del sonido.
 * @param altitud (m)
 * @returns temperatura (K)
 */
export function temperatura(altitud: number): number {
  return altitud < ALTITUD_TROPOPAUSA
    ? TEMPERATURA_NIVEL_MAR - GRADIENTE_TERMICO * altitud
    : TEMPERATURA_TROPOPAUSA;
}

/**
 * Velocidad del sonido: a(h) = √(γ · R_aire · T(h)).
 * @param altitud (m)
 * @returns velocidad del sonido (m/s)
 */
export function velocidadSonido(altitud: number): number {
  return Math.sqrt(GAMMA_AIRE * R_AIRE * temperatura(altitud));
}

/**
 * Número de Mach: |v| / a(h).
 * @param velocidad (m/s)
 * @param altitud (m)
 */
export function numeroMach(velocidad: number, altitud: number): number {
  return Math.abs(velocidad) / velocidadSonido(altitud);
}

/**
 * Altitudes (m) en las que el modelo tiene una esquina: cambia la pendiente de la temperatura (y
 * con ella la velocidad del sonido) y, en la US Standard Atmosphere 1976, la de dρ/dh.
 */
export function altitudesCapas(tipo: TipoAtmosfera): readonly number[] {
  return tipo === 'estandar1976' ? ALTITUDES_CAPAS_1976 : [ALTITUD_TROPOPAUSA];
}
