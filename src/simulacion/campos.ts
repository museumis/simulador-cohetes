import type { Cohete, Etapa, OpcionesSimulacion } from './tipos';

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

/** Campos de una etapa, en el orden de la tabla de parámetros. */
export const CAMPOS_ETAPA: readonly { clave: keyof Etapa; nombre: string; unidad: string }[] = [
  { clave: 'masaSeca', nombre: 'masa seca', unidad: 'kg' },
  { clave: 'masaPropelente', nombre: 'masa de propelente', unidad: 'kg' },
  { clave: 'empujeVacio', nombre: 'empuje en vacío', unidad: 'N' },
  { clave: 'ispNivelMar', nombre: 'Isp a nivel del mar', unidad: 's' },
  { clave: 'ispVacio', nombre: 'Isp en vacío', unidad: 's' },
  { clave: 'diametro', nombre: 'diámetro', unidad: 'm' },
  { clave: 'longitud', nombre: 'longitud', unidad: 'm' },
  { clave: 'cd', nombre: 'Cd', unidad: '' },
];

function campoEtapa(i: 0 | 1, c: (typeof CAMPOS_ETAPA)[number]): CampoEntrada {
  return {
    ruta: `etapas[${i}].${c.clave}`,
    clave: `e${i + 1}.${c.clave}`,
    nombre: `etapa ${i + 1}: ${c.nombre}`,
    unidad: c.unidad,
    leer: (e) => e.cohete.etapas[i][c.clave],
    escribir(e, valor) {
      const etapas: Cohete['etapas'] = [{ ...e.cohete.etapas[0] }, { ...e.cohete.etapas[1] }];
      etapas[i] = { ...etapas[i], [c.clave]: valor };
      return { ...e, cohete: { ...e.cohete, etapas } };
    },
  };
}

function campoCohete(clave: 'masaCargaUtil' | 'pausaSeparacion', nombre: string, unidad: string): CampoEntrada {
  return {
    ruta: clave,
    clave,
    nombre,
    unidad,
    leer: (e) => e.cohete[clave],
    escribir: (e, valor) => ({ ...e, cohete: { ...e.cohete, [clave]: valor } }),
  };
}

/** Todos los datos numéricos de la entrada: las dos etapas, el cohete y el paso de integración. */
export const CAMPOS_ENTRADA: readonly CampoEntrada[] = [
  ...CAMPOS_ETAPA.map((c) => campoEtapa(0, c)),
  ...CAMPOS_ETAPA.map((c) => campoEtapa(1, c)),
  campoCohete('masaCargaUtil', 'carga útil', 'kg'),
  campoCohete('pausaSeparacion', 'pausa entre etapas', 's'),
  {
    ruta: 'dt',
    clave: 'dt',
    nombre: 'paso de integración dt',
    unidad: 's',
    leer: (e) => e.opciones.dt,
    escribir: (e, valor) => ({ ...e, opciones: { ...e.opciones, dt: valor } }),
  },
];

export function buscarCampo(ruta: string): CampoEntrada {
  const c = CAMPOS_ENTRADA.find((x) => x.ruta === ruta);
  if (!c) throw new RangeError(`Campo de entrada desconocido: ${ruta}`);
  return c;
}

/** Copia profunda de una entrada. */
export function copiarEntrada(e: Entrada): Entrada {
  const { cohete, opciones } = e;
  return {
    cohete: { ...cohete, etapas: [{ ...cohete.etapas[0] }, { ...cohete.etapas[1] }] },
    opciones: { ...opciones },
  };
}
