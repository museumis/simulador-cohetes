import { calcularDerivados } from '../analisis/derivados';
import { copiarCohete, MODELOS } from '../modelos';
import { OPCIONES_POR_DEFECTO } from '../simulacion/simular';
import type { Cohete, Etapa, OpcionesSimulacion } from '../simulacion/tipos';
import { validarCohete, validarOpciones, type ErrorValidacion } from '../simulacion/validacion';
import { formatearNumero } from '../util/formato';
import { textoConUnidad, type SistemaUnidades } from './magnitudes';

/** Retardo entre la última edición y el recálculo (ms). */
const RETARDO_RECALCULO = 250;

const CAMPOS_ETAPA: readonly { clave: keyof Etapa; nombre: string; unidad: string }[] = [
  { clave: 'masaSeca', nombre: 'masa seca', unidad: 'kg' },
  { clave: 'masaPropelente', nombre: 'masa de propelente', unidad: 'kg' },
  { clave: 'empujeVacio', nombre: 'empuje en vacío', unidad: 'N' },
  { clave: 'ispNivelMar', nombre: 'Isp a nivel del mar', unidad: 's' },
  { clave: 'ispVacio', nombre: 'Isp en vacío', unidad: 's' },
  { clave: 'diametro', nombre: 'diámetro', unidad: 'm' },
  { clave: 'longitud', nombre: 'longitud', unidad: 'm' },
  { clave: 'cd', nombre: 'Cd', unidad: '—' },
];

export interface Parametros {
  cohete(): Cohete;
  opciones(): Partial<OpcionesSimulacion>;
  setSistema(sistema: SistemaUnidades): void;
  /** Muestra un error de la simulación (o lo borra con null). */
  mostrarError(mensaje: string | null): void;
}

/** Interpreta un número escrito a mano; admite coma decimal. Vacío o ilegible da NaN. */
function leerNumero(texto: string): number {
  const limpio = texto.trim().replace(',', '.').replace(/[\s ]/g, '');
  return limpio === '' ? Number.NaN : Number(limpio);
}

function entrada(campo: string, valor: number, titulo: string): HTMLInputElement {
  const e = document.createElement('input');
  e.type = 'text';
  e.inputMode = 'decimal';
  e.spellcheck = false;
  e.dataset.campo = campo;
  e.value = String(valor);
  e.title = titulo;
  e.setAttribute('aria-label', titulo);
  return e;
}

function filaTabla(tabla: HTMLTableElement | HTMLTableSectionElement, celdas: (string | Node)[], claseNumero = true): HTMLTableRowElement {
  const tr = tabla.insertRow();
  celdas.forEach((c, i) => {
    const td = tr.insertCell();
    if (typeof c === 'string') td.textContent = c;
    else td.append(c);
    if (i > 0 && claseNumero) td.className = 'numero';
  });
  return tr;
}

/**
 * Panel lateral con todos los datos de entrada: validación campo a campo, valores derivados
 * y recálculo con un retardo corto tras cada cambio válido.
 */
export function crearParametros(
  contenedor: HTMLElement,
  alCambiar: (cohete: Cohete, opciones: Partial<OpcionesSimulacion>) => void,
): Parametros {
  let cohete = copiarCohete(MODELOS[0]!.cohete);
  let opciones: Partial<OpcionesSimulacion> = { dt: OPCIONES_POR_DEFECTO.dt };
  let sistema: SistemaUnidades = 'si';
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  contenedor.replaceChildren();
  const titulo = document.createElement('div');
  titulo.className = 'panel-titulo';
  titulo.textContent = 'PARÁMETROS';

  const selector = document.createElement('select');
  selector.title = 'Modelo predefinido';
  selector.append(...MODELOS.map((m) => new Option(m.cohete.nombre, m.id)));
  const filaModelo = document.createElement('label');
  filaModelo.className = 'fila-modelo';
  filaModelo.append('cohete ', selector);

  const tablaEntrada = document.createElement('table');
  tablaEntrada.className = 'tabla-parametros';
  const errores = document.createElement('ul');
  errores.className = 'errores';
  const errorSimulacion = document.createElement('div');
  errorSimulacion.className = 'errores';
  const tablaDerivados = document.createElement('table');
  tablaDerivados.className = 'tabla-parametros';
  const tituloDerivados = document.createElement('div');
  tituloDerivados.className = 'panel-titulo';
  tituloDerivados.textContent = 'VALORES DERIVADOS';
  const configuracion = document.createElement('div');
  configuracion.className = 'nota';
  configuracion.textContent = 'modelo 1D vertical · atmósfera exponencial · integrador RK4 de paso fijo';

  contenedor.append(titulo, filaModelo, configuracion, tablaEntrada, errores, errorSimulacion, tituloDerivados, tablaDerivados);

  const entradas: HTMLInputElement[] = [];

  function construirEntrada(): void {
    tablaEntrada.replaceChildren();
    entradas.length = 0;
    const cab = tablaEntrada.createTHead();
    filaTabla(cab, ['', 'etapa 1', 'etapa 2', 'unidad'], false);
    const cuerpo = tablaEntrada.createTBody();
    for (const c of CAMPOS_ETAPA) {
      const e0 = entrada(`etapas[0].${c.clave}`, cohete.etapas[0][c.clave], `etapa 1: ${c.nombre} [${c.unidad}]`);
      const e1 = entrada(`etapas[1].${c.clave}`, cohete.etapas[1][c.clave], `etapa 2: ${c.nombre} [${c.unidad}]`);
      entradas.push(e0, e1);
      filaTabla(cuerpo, [c.nombre, e0, e1, c.unidad], false);
    }
    const carga = entrada('masaCargaUtil', cohete.masaCargaUtil, 'carga útil [kg]');
    const pausa = entrada('pausaSeparacion', cohete.pausaSeparacion, 'pausa entre etapas [s]');
    const dt = entrada('dt', opciones.dt ?? OPCIONES_POR_DEFECTO.dt, 'paso de integración [s]');
    entradas.push(carga, pausa, dt);
    filaTabla(cuerpo, ['carga útil', carga, '', 'kg'], false);
    filaTabla(cuerpo, ['pausa entre etapas', pausa, '', 's'], false);
    filaTabla(cuerpo, ['paso de integración dt', dt, '', 's'], false);
    for (const e of entradas) e.addEventListener('input', () => alEditar(e));
  }

  function aplicar(campo: string, valor: number): void {
    const etapa = /^etapas\[(\d)\]\.(\w+)$/.exec(campo);
    if (etapa) {
      const i = Number(etapa[1]) as 0 | 1;
      cohete.etapas[i] = { ...cohete.etapas[i], [etapa[2]!]: valor };
    } else if (campo === 'masaCargaUtil' || campo === 'pausaSeparacion') {
      cohete = { ...cohete, [campo]: valor };
    } else if (campo === 'dt') {
      opciones = { ...opciones, dt: valor };
    }
  }

  function validar(): ErrorValidacion[] {
    return [...validarCohete(cohete), ...validarOpciones({ ...OPCIONES_POR_DEFECTO, ...opciones })];
  }

  function pintarErrores(lista: ErrorValidacion[]): void {
    const porCampo = new Map(lista.map((e) => [e.campo, e]));
    for (const e of entradas) {
      const error = porCampo.get(e.dataset.campo ?? '');
      e.classList.toggle('invalido', error !== undefined);
      e.setAttribute('aria-invalid', String(error !== undefined));
    }
    errores.replaceChildren(
      ...lista.map((e) => {
        const li = document.createElement('li');
        li.textContent = e.mensaje;
        return li;
      }),
    );
  }

  function pintarDerivados(valido: boolean): void {
    tablaDerivados.replaceChildren();
    if (!valido) {
      filaTabla(tablaDerivados, ['Corregir los datos marcados para ver los valores derivados.'], false);
      return;
    }
    const d = calcularDerivados(cohete);
    const masa = (kg: number): string => textoConUnidad(kg, 'kg', 6, sistema);
    const cuerpo = tablaDerivados.createTBody();
    filaTabla(cuerpo, ['masa al despegue', masa(d.masaDespegue), '']);
    filaTabla(cuerpo, ['fracción de carga útil', formatearNumero(d.fraccionCargaUtil, 4), '']);
    filaTabla(cuerpo, ['', 'etapa 1', 'etapa 2'], false);
    const [a, b] = d.etapas;
    filaTabla(cuerpo, ['masa inicial', masa(a.masaInicial), masa(b.masaInicial)]);
    filaTabla(cuerpo, ['masa final', masa(a.masaFinal), masa(b.masaFinal)]);
    filaTabla(cuerpo, ['caudal ṁ', `${formatearNumero(a.caudal, 4)} kg/s`, `${formatearNumero(b.caudal, 4)} kg/s`]);
    filaTabla(cuerpo, ['tiempo de combustión', `${formatearNumero(a.tiempoCombustion, 4)} s`, `${formatearNumero(b.tiempoCombustion, 4)} s`]);
    const twr = filaTabla(cuerpo, ['TWR inicial', formatearNumero(a.twrInicial, 3), formatearNumero(b.twrInicial, 3)]);
    twr.title = 'Al encenderse, con la gravedad en la superficie: etapa 1 con empuje a nivel del mar, etapa 2 con empuje en vacío';
    filaTabla(cuerpo, ['Δv ideal', `${formatearNumero(a.deltaVIdeal, 5)} m/s`, `${formatearNumero(b.deltaVIdeal, 5)} m/s`]);
    filaTabla(cuerpo, ['Δv ideal total', `${formatearNumero(d.deltaVIdeal, 5)} m/s`, '']);
  }

  function alEditar(e: HTMLInputElement): void {
    aplicar(e.dataset.campo ?? '', leerNumero(e.value));
    revisar(true);
  }

  /** Valida, pinta y, si todo es válido, programa el recálculo. */
  function revisar(conRetardo: boolean): void {
    const lista = validar();
    pintarErrores(lista);
    pintarDerivados(lista.length === 0);
    clearTimeout(temporizador);
    if (lista.length > 0) return;
    const enviar = (): void => alCambiar(copiarCohete(cohete), { ...opciones });
    if (conRetardo) temporizador = setTimeout(enviar, RETARDO_RECALCULO);
    else enviar();
  }

  selector.addEventListener('change', () => {
    const modelo = MODELOS.find((m) => m.id === selector.value);
    if (!modelo) return;
    cohete = copiarCohete(modelo.cohete);
    construirEntrada();
    revisar(false);
  });

  construirEntrada();
  pintarErrores([]);
  pintarDerivados(validar().length === 0);

  return {
    cohete: () => copiarCohete(cohete),
    opciones: () => ({ ...opciones }),
    setSistema(nuevo) {
      sistema = nuevo;
      pintarDerivados(validar().length === 0);
    },
    mostrarError(mensaje) {
      errorSimulacion.textContent = mensaje ?? '';
    },
  };
}
