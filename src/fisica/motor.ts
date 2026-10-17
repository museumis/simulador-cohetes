import { G0, PRESION_NIVEL_MAR } from './constantes';
import { escalonTabla, type Tabla } from './tabla';

/** Datos del motor de una etapa que intervienen en el empuje. */
export interface Motor {
  empujeVacio: number; // N
  ispNivelMar: number; // s
  ispVacio: number;    // s
}

/**
 * Velocidad de expulsión efectiva u = Isp · g0.
 * Siempre con g0, nunca con la gravedad local.
 * @param isp impulso específico (s)
 * @returns velocidad de expulsión (m/s)
 */
export function velocidadExpulsion(isp: number): number {
  return isp * G0;
}

/**
 * Caudal másico, constante durante la combustión: ṁ = empujeVacio / (ispVacio · g0).
 * @returns caudal másico (kg/s)
 */
export function caudalMasico(motor: Motor): number {
  return motor.empujeVacio / velocidadExpulsion(motor.ispVacio);
}

/**
 * Isp según la presión exterior: Isp(p) = ispVacio − (ispVacio − ispNivelMar) · p / p0.
 * @param presion presión exterior (Pa)
 * @returns impulso específico (s)
 */
export function ispSegunPresion(motor: Motor, presion: number): number {
  return motor.ispVacio - (motor.ispVacio - motor.ispNivelMar) * presion / PRESION_NIVEL_MAR;
}

/**
 * Empuje según la presión exterior: F(p) = ṁ · g0 · Isp(p).
 * @param presion presión exterior (Pa)
 * @returns empuje (N)
 */
export function empujeSegunPresion(motor: Motor, presion: number): number {
  return caudalMasico(motor) * velocidadExpulsion(ispSegunPresion(motor, presion));
}

/**
 * Tiempo de combustión: t = masaPropelente / ṁ.
 * @param masaPropelente masa de propelente de la etapa (kg)
 * @returns tiempo de combustión (s)
 */
export function tiempoCombustion(motor: Motor, masaPropelente: number): number {
  return masaPropelente / caudalMasico(motor);
}

/**
 * Nivel de empuje (fracción del nominal) del perfil de regulación a `t` s del encendido: el del
 * último tramo que ha empezado; antes del primero, y sin perfil, 1. El caudal se escala con el
 * nivel y el Isp no cambia.
 * @param perfil puntos (t desde el encendido en s, nivel en (0, 1])
 */
export function nivelRegulacion(perfil: Tabla, t: number): number {
  return escalonTabla(perfil, t, 1);
}

/**
 * Tiempo de combustión con un perfil de regulación: se recorren sus tramos hasta agotar el
 * propelente. Sin límite de aceleración el caudal solo depende del tiempo.
 * @param masaPropelente (kg)
 * @returns tiempo de combustión (s)
 */
export function tiempoCombustionRegulada(motor: Motor, masaPropelente: number, perfil: Tabla): number {
  const caudal = caudalMasico(motor);
  // Instantes en que cambia el nivel, con el nivel que rige a partir de cada uno.
  const cambios: [number, number][] = [[0, nivelRegulacion(perfil, 0)]];
  for (const [t, nivel] of perfil) if (t > 0) cambios.push([t, nivel]);
  let restante = masaPropelente;
  for (let i = 0; i < cambios.length; i++) {
    const [inicio, nivel] = cambios[i]!;
    const fin = cambios[i + 1]?.[0] ?? Infinity;
    const consumo = caudal * nivel * (fin - inicio);
    if (consumo >= restante) return inicio + restante / (caudal * nivel);
    restante -= consumo;
  }
  return Infinity; // no se llega aquí: el último tramo no termina
}
