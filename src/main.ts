import './estilos/base.css';
import { crearEsquema } from './render/esquema';
import { Reproductor } from './reproduccion/reproductor';
import { simular } from './simulacion/simular';
import type { Cohete, OpcionesSimulacion, ResultadoSimulacion } from './simulacion/tipos';
import { ErrorEntrada } from './simulacion/validacion';
import { crearListaEventos } from './ui/eventos';
import { crearGraficas } from './ui/graficas';
import { crearLineaTiempo } from './ui/linea-tiempo';
import type { SistemaUnidades } from './ui/magnitudes';
import { crearParametros } from './ui/parametros';
import { crearTelemetria } from './ui/telemetria';
import { instalarTeclado } from './ui/teclado';
import { formatearFijo, formatearNumero } from './util/formato';

/** Mayor salto de reloj real que se aplica de una vez (s): evita saltos al volver a la pestaña. */
const DT_REAL_MAXIMO = 0.1;

function elemento<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Falta el elemento #${id}`);
  return e as T;
}

type Tema = 'oscuro' | 'claro';

const raiz = document.documentElement;
const botonTema = elemento<HTMLButtonElement>('boton-tema');
const botonUnidades = elemento<HTMLButtonElement>('boton-unidades');
const botonParametros = elemento<HTMLButtonElement>('boton-parametros');
const panelParametros = elemento('panel-parametros');
const resumen = elemento('resumen-configuracion');
const diagnostico = elemento('panel-diagnostico');

let sistema: SistemaUnidades = 'si';
let tema: Tema = matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'oscuro';
let cohete: Cohete;

const telemetria = crearTelemetria(elemento('panel-telemetria'));
const graficas = crearGraficas(elemento('panel-graficas'), (t) => reproductor.irA(t));
const esquema = crearEsquema(elemento<HTMLCanvasElement>('lienzo-esquema'));
const eventos = crearListaEventos(elemento('panel-eventos'), (t) => reproductor.irA(t));
const parametros = crearParametros(panelParametros, (c, o) => calcular(c, o));

/** Simula; si la entrada no es válida, informa y devuelve null. */
function intentarSimular(c: Cohete, o: Partial<OpcionesSimulacion>): ResultadoSimulacion | null {
  try {
    const r = simular(c, o);
    parametros.mostrarError(null);
    return r;
  } catch (error) {
    if (error instanceof ErrorEntrada) {
      parametros.mostrarError(error.message);
      return null;
    }
    throw error;
  }
}

function pintarCabecera(r: ResultadoSimulacion): void {
  resumen.textContent =
    `COHETE: ${cohete.nombre}   MODELO: 1D   ATM: exp   INT: RK4 dt = ${formatearNumero(r.diagnostico.dt, 4)} s`;
  const d = r.diagnostico;
  const partes = [
    `${formatearFijo(d.pasos, 0)} pasos`,
    `${formatearNumero(d.tiempoCalculoMs, 3)} ms`,
    `${formatearFijo(r.muestras.length, 0)} muestras`,
    `deriva E ${formatearNumero(d.derivaEnergia, 2)}`,
  ];
  if (!r.despega) partes.unshift('NO DESPEGA: el empuje de la etapa 1 no supera el peso');
  diagnostico.textContent = `DIAGNÓSTICO: ${partes.join(' · ')}`;
}

/** Reparte un resultado nuevo entre todas las vistas. El reproductor va el último: su aviso las redibuja. */
function cargarResultado(r: ResultadoSimulacion): void {
  pintarCabecera(r);
  graficas.cargar(r);
  esquema.cargar(cohete, r);
  eventos.cargar(r.eventos);
}

/** Recalcula tras un cambio de parámetros. Solo se llama después del arranque. */
function calcular(c: Cohete, o: Partial<OpcionesSimulacion>): void {
  const r = intentarSimular(c, o);
  if (!r) return;
  cohete = c;
  cargarResultado(r);
  // El reproductor necesita la duración nueva antes de colocar las marcas de la línea de tiempo.
  reproductor.cargar(r);
  lineaTiempo.cargar(r.eventos);
}

cohete = parametros.cohete();
const inicial = intentarSimular(cohete, parametros.opciones());
if (!inicial) throw new Error('El modelo inicial no es válido');
const reproductor = new Reproductor(inicial);
const lineaTiempo = crearLineaTiempo(elemento('panel-reproductor'), reproductor);

reproductor.suscribir((cambio) => {
  telemetria.actualizar(cambio.estado);
  graficas.cursor(cambio.t);
  esquema.dibujar(cambio.estado);
  eventos.actualizar(cambio.t);
  lineaTiempo.actualizar(cambio);
});

function aplicarTema(): void {
  raiz.dataset.theme = tema === 'claro' ? 'light' : 'dark';
  botonTema.textContent = `tema: ${tema}`;
  graficas.refrescarTema();
  esquema.refrescarTema();
}

function aplicarSistema(): void {
  botonUnidades.textContent = sistema === 'si' ? 'unidades: SI' : 'unidades: km · t · kN';
  telemetria.setSistema(sistema);
  graficas.setSistema(sistema);
  eventos.setSistema(sistema);
  parametros.setSistema(sistema);
  esquema.setUnidades(sistema);
  reproductor.irA(reproductor.t);
}

function alternarParametros(): void {
  const abrir = panelParametros.hidden;
  panelParametros.hidden = !abrir;
  botonParametros.setAttribute('aria-expanded', String(abrir));
}

botonTema.addEventListener('click', () => {
  tema = tema === 'oscuro' ? 'claro' : 'oscuro';
  aplicarTema();
  reproductor.irA(reproductor.t);
});
botonUnidades.addEventListener('click', () => {
  sistema = sistema === 'si' ? 'practico' : 'si';
  aplicarSistema();
});
botonParametros.addEventListener('click', alternarParametros);
instalarTeclado(reproductor, alternarParametros);

raiz.dataset.theme = tema === 'claro' ? 'light' : 'dark';
botonTema.textContent = `tema: ${tema}`;
botonParametros.setAttribute('aria-expanded', 'true');
cargarResultado(inicial);
lineaTiempo.cargar(inicial.eventos);
aplicarSistema();

let instanteAnterior = performance.now();
function fotograma(ahora: number): void {
  reproductor.avanzar(Math.min((ahora - instanteAnterior) / 1000, DT_REAL_MAXIMO));
  instanteAnterior = ahora;
  requestAnimationFrame(fotograma);
}
requestAnimationFrame(fotograma);
