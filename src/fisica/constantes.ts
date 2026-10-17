// Constantes físicas del simulador, todas en unidades SI.

/** Gravedad estándar (m/s²). Valor exacto por definición: 3.ª CGPM (1901), ISO 80000-3. */
export const G0 = 9.80665;

/** Radio medio de la Tierra (m). Radio medio volumétrico, IUGG. */
export const RADIO_TIERRA = 6_371_000;

/** Parámetro gravitacional terrestre μ = G·M (m³/s²). WGS 84 / IERS Conventions (2010). */
export const MU_TIERRA = 3.986004418e14;

/** Densidad del aire al nivel del mar (kg/m³). US Standard Atmosphere 1976. */
export const DENSIDAD_NIVEL_MAR = 1.225;

/** Presión al nivel del mar (Pa). US Standard Atmosphere 1976. */
export const PRESION_NIVEL_MAR = 101_325;

/** Temperatura al nivel del mar (K). US Standard Atmosphere 1976. */
export const TEMPERATURA_NIVEL_MAR = 288.15;

/** Gradiente térmico de la troposfera (K/m). US Standard Atmosphere 1976. */
export const GRADIENTE_TERMICO = 0.0065;

/** Altitud de la tropopausa (m). US Standard Atmosphere 1976. */
export const ALTITUD_TROPOPAUSA = 11_000;

/** Temperatura de la tropopausa (K): 288,15 − 0,0065 · 11 000. US Standard Atmosphere 1976. */
export const TEMPERATURA_TROPOPAUSA = 216.65;

/** Altura de escala del modelo atmosférico exponencial (m). Aproximación habitual para la baja atmósfera. */
export const ALTURA_ESCALA = 8_500;

/** Índice adiabático del aire seco (adimensional). */
export const GAMMA_AIRE = 1.4;

/** Constante específica del aire seco (J/(kg·K)): R* / M0 = 8314,32 / 28,9644. US Standard Atmosphere 1976. */
export const R_AIRE = 287.05;
