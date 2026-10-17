/**
 * Raíz de `g` en [a, b] por regula falsi con la modificación de Illinois.
 * Requiere que g(a) y g(b) tengan signos opuestos (o que alguno sea 0).
 * @param ga g(a), ya calculado
 * @param gb g(b), ya calculado
 * @param tolerancia anchura del intervalo a partir de la cual se para
 */
export function buscarRaiz(
  g: (x: number) => number,
  a: number,
  b: number,
  ga: number,
  gb: number,
  tolerancia: number,
): number {
  if (ga === 0) return a;
  if (gb === 0) return b;
  let lado = 0;
  let c = a;
  for (let i = 0; i < 200 && Math.abs(b - a) > tolerancia; i++) {
    c = (a * gb - b * ga) / (gb - ga);
    // Por redondeo la secante puede caer fuera del intervalo: se biseca.
    if (!(c > Math.min(a, b) && c < Math.max(a, b))) c = (a + b) / 2;
    const gc = g(c);
    if (gc === 0) return c;
    if (gc * gb > 0) {
      b = c;
      gb = gc;
      if (lado === -1) ga /= 2;
      lado = -1;
    } else {
      a = c;
      ga = gc;
      if (lado === 1) gb /= 2;
      lado = 1;
    }
  }
  return c;
}
