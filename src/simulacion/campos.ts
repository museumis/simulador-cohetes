import type { Cohete, Etapa, OpcionesSimulacion, Tabla } from './tipos';

/** Datos de entrada que se editan, se comparten en la URL y se pueden barrer. */
export interface Entrada {
  cohete: Cohete;
  opciones: OpcionesSimulacion;
}

/** Un dato numérico de la entrada, con la misma ruta que usa la validación. */
export interface CampoEntrada {
  ruta: string;   // p. ej. "etapas[0].masaSeca", la de ErrorValidacion.campo
  clave: string;  // nombre corto en la URL, p. ej. "e1.masaSeca"
  nombre: string;
  unidad: string; // SI; '' si es adimensional
  leer(e: Entrada): number;
  /** Devuelve una entrada nueva con el valor cambiado, sin modificar la original. */
  escribir(e: Entrada, valor: number): Entrada;
}

/** Datos numéricos de una etapa. */
type ClaveNumericaEtapa = Exclude<keyof Etapa, 'tablaCd' | 'regulacion'>;

/** Campos de una etapa, en el orden de la tabla de parámetros. */
export const CAMPOS_ETAPA: readonly { clave: ClaveNumericaEtapa; nombre: string; unidad: string }[] = [
  { clave: 'masaSeca', nombre: 'masa seca', unidad: 'kg' },
  { clave: 'masaPropelente', nombre: 'masa de propelente', unidad: 'kg' },
  { clave: 'empujeVacio', nombre: 'empuje en vacío', unidad: 'N' },
  { clave: 'ispNivelMar', nombre: 'Isp a nivel del mar', unidad: 's' },
  { clave: 'ispVacio', nombre: 'Isp en vacío', unidad: 's' },
  { clave: 'diametro', nombre: 'diámetro', unidad: 'm' },
  { clave: 'longitud', nombre: 'longitud', unidad: 'm' },
  { clave: 'cd', nombre: 'Cd', unidad: '' },
];

/** Copia de la entrada con un dato de una etapa cambiado. */
function conDatoEtapa(e: Entrada, i: 0 | 1, clave: keyof Etapa, valor: number | Tabla): Entrada {
  const etapas: Cohete['etapas'] = [{ ...e.cohete.etapas[0] }, { ...e.cohete.etapas[1] }];
  etapas[i] = { ...etapas[i], [clave]: valor };
  return { ...e, cohete: { ...e.cohete, etapas } };
}

function campoEtapa(i: 0 | 1, c: (typeof CAMPOS_ETAPA)[number]): CampoEntrada {
  return {
    ruta: `etapas[${i}].${c.clave}`,
    clave: `e${i + 1}.${c.clave}`,
    nombre: `etapa ${i + 1}: ${c.nombre}`,
    unidad: c.unidad,
    leer: (e) => e.cohete.etapas[i][c.clave],
    escribir: (e, valor) => conDatoEtapa(e, i, c.clave, valor),
  };
}

type ClaveCohete =
  | 'masaCargaUtil'
  | 'pausaSeparacion'
  | 'velocidadManiobra'
  | 'anguloManiobra'
  | 'aceleracionMaxima'
  | 'latitudLanzamiento'
  | 'azimutLanzamiento';

function campoCohete(clave: ClaveCohete, nombre: string, unidad: string): CampoEntrada {
  return {
    ruta: clave,
    clave,
    nombre,
    unidad,
    leer: (e) => e.cohete[clave],
    escribir: (e, valor) => ({ ...e, cohete: { ...e.cohete, [clave]: valor } }),
  };
}

/** Todos los datos numéricos de la entrada: las dos etapas, el cohete, la maniobra (2D) y el paso de integración. */
export const CAMPOS_ENTRADA: readonly CampoEntrada[] = [
  ...CAMPOS_ETAPA.map((c) => campoEtapa(0, c)),
  ...CAMPOS_ETAPA.map((c) => campoEtapa(1, c)),
  campoCohete('masaCargaUtil', 'carga útil', 'kg'),
  campoCohete('pausaSeparacion', 'pausa entre etapas', 's'),
  campoCohete('velocidadManiobra', 'velocidad de la maniobra', 'm/s'),
  campoCohete('anguloManiobra', 'ángulo de la maniobra', '°'),
  campoCohete('aceleracionMaxima', 'aceleración máxima (0: sin límite)', 'm/s²'),
  campoCohete('latitudLanzamiento', 'latitud de lanzamiento', '°'),
  campoCohete('azimutLanzamiento', 'azimut de lanzamiento', '°'),
  {
    ruta: 'dt',
    clave: 'dt',
    nombre: 'paso de integración dt',
    unidad: 's',
    leer: (e) => e.opciones.dt,
    escribir: (e, valor) => ({ ...e, opciones: { ...e.opciones, dt: valor } }),
  },
  {
    ruta: 'tolerancia',
    clave: 'tol',
    nombre: 'tolerancia del paso adaptativo',
    unidad: '',
    leer: (e) => e.opciones.tolerancia,
    escribir: (e, valor) => ({ ...e, opciones: { ...e.opciones, tolerancia: valor } }),
  },
];

/** Una tabla (x, y) de la entrada: Cd(Mach) o perfil de regulación de una etapa. */
export interface CampoTabla {
  ruta: string;   // la de ErrorValidacion.campo, p. ej. "etapas[0].tablaCd"
  clave: string;  // nombre corto en la URL
  nombre: string;
  columnas: readonly [string, string]; // nombre de x e y con su unidad
  leer(e: Entrada): Tabla;
  escribir(e: Entrada, tabla: Tabla): Entrada;
}

function campoTabla(i: 0 | 1, clave: 'tablaCd' | 'regulacion', nombre: string, columnas: readonly [string, string]): CampoTabla {
  return {
    ruta: `etapas[${i}].${clave}`,
    clave: `e${i + 1}.${clave}`,
    nombre: `etapa ${i + 1}: ${nombre}`,
    columnas,
    leer: (e) => e.cohete.etapas[i][clave],
    escribir: (e, tabla) => conDatoEtapa(e, i, clave, tabla),
  };
}

/** Tablas de las dos etapas. */
export const CAMPOS_TABLA: readonly CampoTabla[] = ([0, 1] as const).flatMap((i) => [
  campoTabla(i, 'tablaCd', 'Cd(Mach)', ['Mach', 'Cd']),
  campoTabla(i, 'regulacion', 'perfil de regulación', ['t [s]', 'nivel']),
]);

/**
 * Tabla como texto: puntos «x:y» separados por espacios, p. ej. «0:0.3 1.1:0.5».
 * Los números se escriben con String(), que da el double exacto.
 */
export function tablaATexto(tabla: Tabla): string {
  return tabla.map(([x, y]) => `${String(x)}:${String(y)}`).join(' ');
}

/**
 * Lee una tabla escrita como «x:y x:y …» (admite coma decimal y «;» como separador de puntos).
 * Un punto ilegible queda como NaN para que la validación lo señale. Vacío: tabla vacía.
 */
export function textoATabla(texto: string): Tabla {
  const puntos = texto.trim().split(/[\s;]+/).filter((p) => p !== '');
  return puntos.map((p): [number, number] => {
    const partes = p.split(':');
    const numero = (t: string | undefined): number =>
      t === undefined || t.trim() === '' ? Number.NaN : Number(t.trim().replace(',', '.'));
    return partes.length === 2 ? [numero(partes[0]), numero(partes[1])] : [Number.NaN, Number.NaN];
  });
}

/** true si las dos tablas tienen los mismos puntos. */
export function tablasIguales(a: Tabla, b: Tabla): boolean {
  return a.length === b.length && a.every(([x, y], i) => x === b[i]![0] && y === b[i]![1]);
}

export function buscarCampo(ruta: string): CampoEntrada {
  const c = CAMPOS_ENTRADA.find((x) => x.ruta === ruta);
  if (!c) throw new RangeError(`Campo de entrada desconocido: ${ruta}`);
  return c;
}

/** Copia profunda de una entrada. */
export function copiarEntrada(e: Entrada): Entrada {
  const { cohete, opciones } = e;
  return {
    cohete: { ...cohete, etapas: [copiarEtapa(cohete.etapas[0]), copiarEtapa(cohete.etapas[1])] },
    opciones: { ...opciones },
  };
}

/** Copia de una etapa, con sus tablas. */
export function copiarEtapa(e: Etapa): Etapa {
  return { ...e, tablaCd: e.tablaCd.map(([x, y]) => [x, y] as const), regulacion: e.regulacion.map(([x, y]) => [x, y] as const) };
}
