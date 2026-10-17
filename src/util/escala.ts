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

/** Menor valor redondo (1, 2 o 5 × 10ⁿ) que no es menor que `minimo`. */
export function pasoRedondo(minimo: number): number {
  if (!(minimo > 0) || !Number.isFinite(minimo)) throw new RangeError(`Valor no válido: ${minimo}`);
  const potencia = 10 ** Math.floor(Math.log10(minimo));
  const mantisa = minimo / potencia - 1e-9;
  const base = mantisa <= 1 ? 1 : mantisa <= 2 ? 2 : mantisa <= 5 ? 5 : 10;
  return base * potencia;
}

/**
 * Marcas de un eje lineal en múltiplos de un paso redondo, dentro de [min, max].
 * @param objetivo número aproximado de intervalos deseado
 */
export function marcasLineales(min: number, max: number, objetivo = 5): number[] {
  if (!(max > min)) return [min];
  const paso = pasoRedondo((max - min) / objetivo);
  const marcas: number[] = [];
  for (let k = Math.ceil(min / paso - 1e-9); k * paso <= max + 1e-9 * paso; k++) {
    // Sin el error de redondeo de k · paso (0.30000000000000004).
    marcas.push(Number((k * paso).toPrecision(12)));
  }
  return marcas;
}
