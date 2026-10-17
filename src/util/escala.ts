/**
 * Mayor valor redondo (1, 2 o 5 × 10ⁿ) que no supera `maximo`. Sirve para las barras de escala.
 * @param maximo valor positivo
 */
export function valorRedondo(maximo: number): number {
  if (!(maximo > 0) || !Number.isFinite(maximo)) throw new RangeError(`Valor no válido: ${maximo}`);
  const potencia = 10 ** Math.floor(Math.log10(maximo));
  // El margen relativo evita que 5 × 10ⁿ calculado con error de redondeo baje a 2 × 10ⁿ.
  const mantisa = maximo / potencia + 1e-9;
  const base = mantisa >= 5 ? 5 : mantisa >= 2 ? 2 : 1;
  return base * potencia;
}
