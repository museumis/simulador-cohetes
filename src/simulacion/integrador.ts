/** Derivada de un sistema autónomo: escribe dy/dt en `dy` a partir de `y`. */
export type FuncionDerivada = (y: Float64Array, dy: Float64Array) => void;

/** Paso RK4 sin reservar memoria en cada llamada. */
export interface IntegradorRK4 {
  /**
   * Avanza un paso `h` desde `y`. `dy0` es la derivada en `y` (k1), ya calculada por quien
   * llama para reutilizar la del final del paso anterior. El resultado se escribe en `salida`,
   * que no puede ser `y` ni `dy0`.
   */
  paso(f: FuncionDerivada, y: Float64Array, dy0: Float64Array, h: number, salida: Float64Array): void;
}

/** Crea un integrador RK4 clásico para un estado de `n` componentes. */
export function crearIntegradorRK4(n: number): IntegradorRK4 {
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
  };
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
