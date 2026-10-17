import { G0, PRESION_NIVEL_MAR } from './constantes';

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
