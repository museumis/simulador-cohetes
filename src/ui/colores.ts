/** Colores del tema actual, leídos de las variables CSS, para lo que se dibuja en canvas. */
export interface Colores {
  texto: string;
  tenue: string;
  rejilla: string;
  acento: string;
  fuente: string;
}

export function leerColores(): Colores {
  const estilo = getComputedStyle(document.documentElement);
  const v = (nombre: string): string => estilo.getPropertyValue(nombre).trim();
  return {
    texto: v('--texto'),
    tenue: v('--texto-tenue'),
    rejilla: v('--rejilla'),
    acento: v('--acento'),
    fuente: `11px ${getComputedStyle(document.body).fontFamily}`,
  };
}
