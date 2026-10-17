import { calcularDerivados } from '../analisis/derivados';
import { copiarCohete, MODELOS } from '../modelos';
import { buscarCampo, CAMPOS_ETAPA, copiarEntrada, type Entrada } from '../simulacion/campos';
import { OPCIONES_POR_DEFECTO } from '../simulacion/simular';
import type { MetodoIntegracion } from '../simulacion/tipos';
import { METODOS, validarCohete, validarOpciones, type ErrorValidacion } from '../simulacion/validacion';
import { formatearNumero } from '../util/formato';
import { NOMBRES_METODO, textoConUnidad, type SistemaUnidades } from './magnitudes';

/** Retardo entre la última edición y el recálculo (ms). */
const RETARDO_RECALCULO = 250;

export interface Parametros {
  entrada(): Entrada;
  /** Sustituye toda la entrada (desde la URL o un JSON), la valida y la envía si es válida. */
  cargar(entrada: Entrada): void;
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
  alCambiar: (entrada: Entrada) => void,
): Parametros {
  let entradaActual: Entrada = { cohete: copiarCohete(MODELOS[0]!.cohete), opciones: { ...OPCIONES_POR_DEFECTO } };
  let sistema: SistemaUnidades = 'si';
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  contenedor.replaceChildren();
  const titulo = document.createElement('div');
  titulo.className = 'panel-titulo';
  titulo.textContent = 'PARÁMETROS';

  const selector = document.createElement('select');
  selector.title = 'Modelo predefinido';
  // La opción vacía queda elegida cuando la entrada viene de una URL o de un JSON.
  const personalizado = new Option('(cargado)', '');
  personalizado.hidden = true;
  selector.append(personalizado, ...MODELOS.map((m) => new Option(m.cohete.nombre, m.id)));
  selector.value = MODELOS[0]!.id;
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
  configuracion.textContent = 'modelo 1D vertical · atmósfera exponencial · integrador de paso fijo';

  const selectorMetodo = document.createElement('select');
  selectorMetodo.title = 'Método de integración';
  selectorMetodo.dataset.campo = 'metodo';
  selectorMetodo.append(...METODOS.map((m) => new Option(NOMBRES_METODO[m], m)));

  contenedor.append(titulo, filaModelo, configuracion, tablaEntrada, errores, errorSimulacion, tituloDerivados, tablaDerivados);

  const entradas: HTMLInputElement[] = [];

  function construirEntrada(): void {
    const { cohete, opciones } = entradaActual;
    tablaEntrada.replaceChildren();
    entradas.length = 0;
    const cab = tablaEntrada.createTHead();
    filaTabla(cab, ['', 'etapa 1', 'etapa 2', 'unidad'], false);
    const cuerpo = tablaEntrada.createTBody();
    for (const c of CAMPOS_ETAPA) {
      const e0 = entrada(`etapas[0].${c.clave}`, cohete.etapas[0][c.clave], `etapa 1: ${c.nombre} [${c.unidad || '—'}]`);
      const e1 = entrada(`etapas[1].${c.clave}`, cohete.etapas[1][c.clave], `etapa 2: ${c.nombre} [${c.unidad || '—'}]`);
      entradas.push(e0, e1);
      filaTabla(cuerpo, [c.nombre, e0, e1, c.unidad || '—'], false);
    }
    const carga = entrada('masaCargaUtil', cohete.masaCargaUtil, 'carga útil [kg]');
    const pausa = entrada('pausaSeparacion', cohete.pausaSeparacion, 'pausa entre etapas [s]');
    const dt = entrada('dt', opciones.dt, 'paso de integración [s]');
    entradas.push(carga, pausa, dt);
    filaTabla(cuerpo, ['carga útil', carga, '', 'kg'], false);
    filaTabla(cuerpo, ['pausa entre etapas', pausa, '', 's'], false);
    filaTabla(cuerpo, ['método de integración', selectorMetodo, '', ''], false);
    filaTabla(cuerpo, ['paso de integración dt', dt, '', 's'], false);
    selectorMetodo.value = opciones.metodo;
    for (const e of entradas) e.addEventListener('input', () => alEditar(e));
  }

  function aplicar(campo: string, valor: number): void {
    entradaActual = buscarCampo(campo).escribir(entradaActual, valor);
  }

  function validar(): ErrorValidacion[] {
    return [...validarCohete(entradaActual.cohete), ...validarOpciones(entradaActual.opciones)];
  }

  function pintarErrores(lista: ErrorValidacion[]): void {
    const porCampo = new Map(lista.map((e) => [e.campo, e]));
    for (const e of [...entradas, selectorMetodo]) {
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
    const d = calcularDerivados(entradaActual.cohete);
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
    const enviar = (): void => alCambiar(copiarEntrada(entradaActual));
    if (conRetardo) temporizador = setTimeout(enviar, RETARDO_RECALCULO);
    else enviar();
  }

  selector.addEventListener('change', () => {
    const modelo = MODELOS.find((m) => m.id === selector.value);
    if (!modelo) return;
    entradaActual = { ...entradaActual, cohete: copiarCohete(modelo.cohete) };
    construirEntrada();
    revisar(false);
  });

  selectorMetodo.addEventListener('change', () => {
    entradaActual = { ...entradaActual, opciones: { ...entradaActual.opciones, metodo: selectorMetodo.value as MetodoIntegracion } };
    revisar(false);
  });

  construirEntrada();
  pintarErrores([]);
  pintarDerivados(validar().length === 0);

  return {
    entrada: () => copiarEntrada(entradaActual),
    cargar(nueva) {
      entradaActual = copiarEntrada(nueva);
      const modelo = MODELOS.find((m) => m.cohete.nombre === nueva.cohete.nombre);
      selector.value = modelo ? modelo.id : '';
      construirEntrada();
      revisar(false);
    },
    setSistema(nuevo) {
      sistema = nuevo;
      pintarDerivados(validar().length === 0);
    },
    mostrarError(mensaje) {
      errorSimulacion.textContent = mensaje ?? '';
    },
  };
}
