/** Derivada de un sistema autónomo: escribe dy/dt en `dy` a partir de `y`. */
export type FuncionDerivada = (y: Float64Array, dy: Float64Array) => void;

/** Métodos de integración disponibles. */
export type MetodoIntegracion = 'rk4' | 'eulerSimplectico' | 'dormandPrince';

/** Orden de convergencia global de cada método respecto al paso. */
export const ORDEN_METODO: Readonly<Record<MetodoIntegracion, number>> = {
  rk4: 4,
  eulerSimplectico: 1,
  dormandPrince: 5,
};

/** true si el método elige el paso según una tolerancia (dt es solo el paso inicial). */
export function esAdaptativo(metodo: MetodoIntegracion): boolean {
  return metodo === 'dormandPrince';
}

/** Un paso de integración, sin reservar memoria en cada llamada. */
export interface Integrador {
  /**
   * Avanza un paso `h` desde `y`. `dy0` es la derivada en `y` (k1), ya calculada por quien
   * llama para reutilizar la del final del paso anterior. El resultado se escribe en `salida`,
   * que no puede ser `y` ni `dy0`.
   */
  paso(f: FuncionDerivada, y: Float64Array, dy0: Float64Array, h: number, salida: Float64Array): void;
  /**
   * Solo en los métodos adaptativos: error estimado del último paso en norma RMS, relativo a la
   * tolerancia (≤ 1: se acepta). En los de paso fijo, 0.
   */
  error(): number;
}

/** Crea un integrador RK4 clásico para un estado de `n` componentes. */
export function crearIntegradorRK4(n: number): Integrador {
  const k2 = new Float64Array(n);
  const k3 = new Float64Array(n);
  const k4 = new Float64Array(n);
  const intermedio = new Float64Array(n);

  return {
    paso(f, y, k1, h, salida) {
      const mitad = h / 2;
      for (let i = 0; i < n; i++) intermedio[i] = y[i]! + mitad * k1[i]!;
      f(intermedio, k2);
      for (let i = 0; i < n; i++) intermedio[i] = y[i]! + mitad * k2[i]!;
      f(intermedio, k3);
      for (let i = 0; i < n; i++) intermedio[i] = y[i]! + h * k3[i]!;
      f(intermedio, k4);
      const sexto = h / 6;
      for (let i = 0; i < n; i++) {
        salida[i] = y[i]! + sexto * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!);
      }
    },
    error: () => 0,
  };
}

/**
 * Crea un integrador de Euler simpléctico (semiimplícito) de orden 1: todas las componentes
 * avanzan con la derivada al principio del paso salvo las posiciones, que usan las velocidades ya
 * actualizadas. Conserva una energía modificada en el vuelo balístico, al contrario que Euler
 * explícito; sirve para comparar con RK4.
 * @param posiciones índices de las componentes de la posición en el estado
 * @param velocidades índices de sus velocidades, en el mismo orden
 */
export function crearEulerSimplectico(n: number, posiciones: readonly number[], velocidades: readonly number[]): Integrador {
  return {
    paso(_f, y, dy0, h, salida) {
      for (let i = 0; i < n; i++) salida[i] = y[i]! + h * dy0[i]!;
      // En la plataforma la velocidad sigue siendo 0 y la posición no cambia.
      for (let k = 0; k < posiciones.length; k++) {
        const p = posiciones[k]!;
        salida[p] = y[p]! + h * salida[velocidades[k]!]!;
      }
    },
    error: () => 0,
  };
}

// Tablero de Butcher de Dormand y Prince (1980), «A family of embedded Runge-Kutta formulae».
const A21 = 1 / 5;
const A31 = 3 / 40, A32 = 9 / 40;
const A41 = 44 / 45, A42 = -56 / 15, A43 = 32 / 9;
const A51 = 19372 / 6561, A52 = -25360 / 2187, A53 = 64448 / 6561, A54 = -212 / 729;
const A61 = 9017 / 3168, A62 = -355 / 33, A63 = 46732 / 5247, A64 = 49 / 176, A65 = -5103 / 18656;
// Pesos de la solución de orden 5 (también la última fila de A: el método es FSAL).
const B1 = 35 / 384, B3 = 500 / 1113, B4 = 125 / 192, B5 = -2187 / 6784, B6 = 11 / 84;
// Diferencia entre los pesos de orden 5 y los de orden 4: estimación del error local.
const E1 = 71 / 57600, E3 = -71 / 16695, E4 = 71 / 1920, E5 = -17253 / 339200, E6 = 22 / 525, E7 = -1 / 40;

/**
 * Crea un integrador de Dormand–Prince 5(4): avanza con la solución de orden 5 y estima el error
 * local con la diferencia respecto a la de orden 4. La escala del error de cada componente es
 * tolerancia · (1 + max(|y0|, |y1|)): relativa en las magnitudes grandes y absoluta cerca de 0.
 */
export function crearDormandPrince(n: number, tolerancia: number): Integrador {
  const k2 = new Float64Array(n);
  const k3 = new Float64Array(n);
  const k4 = new Float64Array(n);
  const k5 = new Float64Array(n);
  const k6 = new Float64Array(n);
  const k7 = new Float64Array(n);
  const intermedio = new Float64Array(n);
  let ultimoError = 0;

  return {
    paso(f, y, k1, h, salida) {
      for (let i = 0; i < n; i++) intermedio[i] = y[i]! + h * A21 * k1[i]!;
      f(intermedio, k2);
      for (let i = 0; i < n; i++) intermedio[i] = y[i]! + h * (A31 * k1[i]! + A32 * k2[i]!);
      f(intermedio, k3);
      for (let i = 0; i < n; i++) intermedio[i] = y[i]! + h * (A41 * k1[i]! + A42 * k2[i]! + A43 * k3[i]!);
      f(intermedio, k4);
      for (let i = 0; i < n; i++) {
        intermedio[i] = y[i]! + h * (A51 * k1[i]! + A52 * k2[i]! + A53 * k3[i]! + A54 * k4[i]!);
      }
      f(intermedio, k5);
      for (let i = 0; i < n; i++) {
        intermedio[i] = y[i]! + h * (A61 * k1[i]! + A62 * k2[i]! + A63 * k3[i]! + A64 * k4[i]! + A65 * k5[i]!);
      }
      f(intermedio, k6);
      for (let i = 0; i < n; i++) {
        salida[i] = y[i]! + h * (B1 * k1[i]! + B3 * k3[i]! + B4 * k4[i]! + B5 * k5[i]! + B6 * k6[i]!);
      }
      f(salida, k7);
      let suma = 0;
      for (let i = 0; i < n; i++) {
        const e = h * (E1 * k1[i]! + E3 * k3[i]! + E4 * k4[i]! + E5 * k5[i]! + E6 * k6[i]! + E7 * k7[i]!);
        const escala = tolerancia * (1 + Math.max(Math.abs(y[i]!), Math.abs(salida[i]!)));
        suma += (e / escala) ** 2;
      }
      ultimoError = Math.sqrt(suma / n);
    },
    error: () => ultimoError,
  };
}

/** Crea el integrador de un método para un estado con posiciones y velocidades. */
export function crearIntegrador(
  metodo: MetodoIntegracion,
  n: number,
  posiciones: readonly number[],
  velocidades: readonly number[],
  tolerancia: number,
): Integrador {
  if (metodo === 'dormandPrince') return crearDormandPrince(n, tolerancia);
  return metodo === 'rk4' ? crearIntegradorRK4(n) : crearEulerSimplectico(n, posiciones, velocidades);
}

/**
 * Interpolación cúbica de Hermite dentro de un paso, con los valores y las derivadas en
 * los dos extremos. Error O(h⁴), del mismo orden que RK4. Reproduce exactamente las
 * componentes lineales (la masa) y las constantes.
 * @param h duración del paso (s)
 * @param theta fracción del paso, entre 0 y 1
 */
export function interpolarHermite(
  y0: Float64Array,
  dy0: Float64Array,
  y1: Float64Array,
  dy1: Float64Array,
  h: number,
  theta: number,
  salida: Float64Array,
): void {
  const t2 = theta * theta;
  const t3 = t2 * theta;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = (t3 - 2 * t2 + theta) * h;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = (t3 - t2) * h;
  for (let i = 0; i < salida.length; i++) {
    salida[i] = h00 * y0[i]! + h10 * dy0[i]! + h01 * y1[i]! + h11 * dy1[i]!;
  }
}
