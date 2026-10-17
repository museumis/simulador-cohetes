/**
 * Tabla de puntos (x, y) con x estrictamente creciente: Cd frente al Mach o nivel de empuje frente
 * al tiempo. Vacía significa que el dato no se usa (Cd constante, empuje nominal).
 */
export type Tabla = readonly (readonly [number, number])[];

/**
 * Índice del tramo de la tabla que contiene x: −1 antes del primer punto, i si
 * tabla[i][0] ≤ x < tabla[i + 1][0] y n − 1 a partir del último.
 */
export function tramoTabla(tabla: Tabla, x: number): number {
  let i = -1;
  while (i + 1 < tabla.length && tabla[i + 1]![0] <= x) i++;
  return i;
}

/**
 * Interpolación lineal en la tabla; fuera de ella, el valor del extremo más cercano.
 * @param tabla no vacía
 */
export function interpolarTabla(tabla: Tabla, x: number): number {
  const i = tramoTabla(tabla, x);
  if (i < 0) return tabla[0]![1];
  if (i >= tabla.length - 1) return tabla[i]![1];
  const [x0, y0] = tabla[i]!;
  const [x1, y1] = tabla[i + 1]!;
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

/**
 * Valor escalonado: el y del último punto con x ≤ x dado; antes del primero, `inicial`.
 */
export function escalonTabla(tabla: Tabla, x: number, inicial: number): number {
  const i = tramoTabla(tabla, x);
  return i < 0 ? inicial : tabla[i]![1];
}
