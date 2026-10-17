import { areaFrontal, derivadaPresionDinamica, fuerzaArrastre, presionDinamica } from '../fisica/arrastre';
import { datosAtmosfera, numeroMach, temperatura, type DatosAtmosfera } from '../fisica/atmosfera';
import { MU_TIERRA, RADIO_TIERRA } from '../fisica/constantes';
import { gravedad } from '../fisica/gravedad';
import { masaInicial, masasCombustion } from '../fisica/masas';
import { caudalMasico, ispSegunPresion, tiempoCombustion, velocidadExpulsion } from '../fisica/motor';
import { crearIntegradorRK4, interpolarHermite, type FuncionDerivada } from './integrador';
import { buscarRaiz } from './raiz';
import type { Cohete, Etapa, Evento, Muestra, OpcionesSimulacion, ResultadoSimulacion, TipoEvento } from './tipos';
import { DURACION_MAXIMA, ErrorEntrada, validarCohete, validarOpciones } from './validacion';

// Índices del vector de estado.
const H = 0;        // altitud (m)
const V = 1;        // velocidad (m/s)
const M = 2;        // masa (kg)
const DV_IDEAL = 3; // Δv ideal acumulada (m/s)
const P_GRAV = 4;   // pérdida por gravedad acumulada (m/s)
const P_ARR = 5;    // pérdida por arrastre acumulada (m/s)
const P_CONTRA = 6; // pérdida por contrapresión acumulada (m/s)
const TRABAJO = 7;  // trabajo específico de empuje y arrastre (J/kg), para la deriva de energía
const N = 8;

/** Periodo de muestreo de la salida (s): 20 Hz. */
const PERIODO_MUESTREO = 0.05;

/** Anchura del intervalo con la que se da por localizado un evento dentro del paso (s). */
const TOLERANCIA_EVENTO = 1e-12;

export const OPCIONES_POR_DEFECTO: Readonly<OpcionesSimulacion> = {
  dt: 0.01,
  duracionMaxima: DURACION_MAXIMA,
  altitudInicial: 0,
  velocidadInicial: 0,
  gravedad: true,
  arrastre: true,
  contrapresion: true,
};

type Fase = 'plataforma' | 'combustion1' | 'pausa' | 'combustion2' | 'balistico';

/** Configuración constante entre dos discontinuidades del vuelo. */
interface Tramo {
  fase: Fase;
  etapa: 1 | 2;         // etapa inferior acoplada
  motor: Etapa | null;  // etapa con el motor encendido
  caudal: number;       // kg/s
  area: number;         // m², de la etapa inferior acoplada
  cd: number;
}

/** Fuerzas y condiciones en un instante. */
interface Fuerzas {
  empuje: number;          // N
  empujeVacio: number;     // N
  isp: number;             // s
  gravedad: number;        // m/s², la aplicada
  densidad: number;        // kg/m³
  presion: number;         // Pa
  presionDinamica: number; // Pa
  arrastre: number;        // N, módulo
  aceleracion: number;     // m/s²
}

/** Candidato a un evento de máximo (apogeo, Max-Q): se queda el de mayor valor. */
interface Candidato {
  t: number;
  y: Float64Array;
  tramo: Tramo;
  valor: number;
}

function crearTramo(fase: Fase, etapa: 1 | 2, acoplada: Etapa, motor: Etapa | null): Tramo {
  return {
    fase,
    etapa,
    motor,
    caudal: motor ? caudalMasico(motor) : 0,
    area: areaFrontal(acoplada.diametro),
    cd: acoplada.cd,
  };
}

/**
 * Simula el vuelo vertical completo de un cohete de dos etapas.
 * Integra con RK4 de paso fijo; los pasos se acortan para terminar justo en el despegue y
 * en cada fin de combustión, y los demás eventos se localizan dentro del paso buscando la
 * raíz sobre el propio paso RK4.
 * @throws {ErrorEntrada} si algún dato está fuera de rango
 */
export function simular(cohete: Cohete, opciones: Partial<OpcionesSimulacion> = {}): ResultadoSimulacion {
  const o: OpcionesSimulacion = { ...OPCIONES_POR_DEFECTO, ...opciones };
  const errores = [...validarCohete(cohete), ...validarOpciones(o)];
  if (errores.length > 0) throw new ErrorEntrada(errores);

  const inicio = performance.now();
  const vuelo = new Vuelo(cohete, o);
  vuelo.ejecutar();
  const resultado = vuelo.resultado();
  resultado.diagnostico.tiempoCalculoMs = performance.now() - inicio;
  return resultado;
}

/**
 * Intercala las muestras de los eventos entre las de 20 Hz, ambas ya ordenadas por t.
 * Con el mismo t va primero la de 20 Hz, que se toma del tramo anterior a la discontinuidad.
 */
function mezclar(periodicas: Muestra[], eventos: Evento[]): Muestra[] {
  const resultado: Muestra[] = new Array(periodicas.length + eventos.length);
  let i = 0;
  let j = 0;
  for (let k = 0; k < resultado.length; k++) {
    const e = eventos[j];
    const p = periodicas[i];
    resultado[k] = e && (!p || e.estado.t < p.t) ? eventos[j++]!.estado : periodicas[i++]!;
  }
  return resultado;
}

class Vuelo {
  private readonly cohete: Cohete;
  private readonly opciones: OpcionesSimulacion;
  private readonly rk4 = crearIntegradorRK4(N);
  private readonly derivada: FuncionDerivada = (y, dy) => this.evaluarDerivada(y, dy);

  // Estado al principio (y, dy) y al final (y1, dy1) del paso en curso.
  private t = 0;
  private y = new Float64Array(N);
  private dy = new Float64Array(N);
  private y1 = new Float64Array(N);
  private dy1 = new Float64Array(N);
  // Estado en un instante intermedio del paso (eventos y muestras).
  private readonly yAux = new Float64Array(N);
  private readonly dyAux = new Float64Array(N);

  private tramo!: Tramo;
  private readonly atmosfera: DatosAtmosfera = { densidad: 0, presion: 0, derivadaDensidad: 0 };
  private readonly f: Fuerzas = {
    empuje: 0,
    empujeVacio: 0,
    isp: 0,
    gravedad: 0,
    densidad: 0,
    presion: 0,
    presionDinamica: 0,
    arrastre: 0,
    aceleracion: 0,
  };
  private despegado = false;
  private mach1Visto = false;
  private apogeo: Candidato | null = null;
  private maxQ: Candidato | null = null;
  private siguienteMuestra = 1;
  private dqInicio = 0; // dq/dt al principio del paso, la del final del anterior
  private pasos = 0;
  private energiaInicial = 0;
  private derivaEnergiaMaxima = 0;

  private readonly muestras: Muestra[] = []; // las de 20 Hz, en orden
  private readonly eventos: Evento[] = [];

  constructor(cohete: Cohete, opciones: OpcionesSimulacion) {
    this.cohete = cohete;
    this.opciones = opciones;
  }

  /** Recorre la secuencia de vuelo de FISICA.md hasta el impacto o el límite de duración. */
  ejecutar(): void {
    const { cohete, opciones } = this;
    const [e1, e2] = cohete.etapas;
    const [masas1, masas2] = masasCombustion(cohete.etapas, cohete.masaCargaUtil);
    const finCombustion1 = tiempoCombustion(e1, e1.masaPropelente);
    const encendido2 = finCombustion1 + cohete.pausaSeparacion;
    const finCombustion2 = encendido2 + tiempoCombustion(e2, e2.masaPropelente);

    const plataforma = crearTramo('plataforma', 1, e1, e1);
    const combustion1 = crearTramo('combustion1', 1, e1, e1);
    const pausa = crearTramo('pausa', 2, e2, null);
    const combustion2 = crearTramo('combustion2', 2, e2, e2);
    const balistico = crearTramo('balistico', 2, e2, null);

    this.y[H] = opciones.altitudInicial;
    this.y[V] = opciones.velocidadInicial;
    this.y[M] = masaInicial(cohete.etapas, cohete.masaCargaUtil);
    this.energiaInicial = this.energia(this.y);

    if (opciones.altitudInicial === 0 && opciones.velocidadInicial === 0) {
      const despegue = this.instanteDespegue(plataforma);
      this.iniciar(plataforma);
      if (despegue >= finCombustion1) {
        // F ≤ m·g durante toda la combustión de la etapa 1: no despega.
        if (this.integrarHasta(finCombustion1)) return;
        this.y[M] = masas1.final;
        this.registrarEvento('finCombustion1');
        return;
      }
      if (this.integrarHasta(despegue)) return;
      this.despegado = true;
      this.cambiarTramo(combustion1);
      this.registrarEvento('despegue');
    } else {
      this.despegado = true;
      this.iniciar(combustion1);
    }

    if (this.integrarHasta(finCombustion1)) return;
    this.y[M] = masas1.final; // elimina el redondeo acumulado
    this.registrarEvento('finCombustion1');
    this.cambiarTramo(pausa, e1.masaSeca);
    this.registrarEvento('separacion');

    if (this.integrarHasta(encendido2)) return;
    this.cambiarTramo(combustion2);
    this.registrarEvento('encendido2');

    if (this.integrarHasta(finCombustion2)) return;
    this.y[M] = masas2.final;
    this.registrarEvento('finCombustion2');
    this.cambiarTramo(balistico);

    this.integrarHasta(Infinity);
  }

  resultado(): ResultadoSimulacion {
    for (const [tipo, c] of [['apogeo', this.apogeo], ['maxQ', this.maxQ]] as const) {
      if (c) this.registrarEvento(tipo, c.t, c.y, c.tramo);
    }
    // Orden estable: en una discontinuidad se conserva el orden antes → después.
    this.eventos.sort((a, b) => a.t - b.t);
    // Si el vuelo se corta por duracionMaxima, la última muestra es el estado final.
    const ultimoInstante = Math.max(this.muestras.at(-1)!.t, this.eventos.at(-1)?.t ?? 0);
    if (this.t > ultimoInstante) this.muestras.push(this.crearMuestra(this.t, this.y, this.tramo));
    const muestras = mezclar(this.muestras, this.eventos);

    let apogeo = -Infinity;
    let velocidadMaxima = 0;
    for (const m of muestras) {
      apogeo = Math.max(apogeo, m.altitud);
      velocidadMaxima = Math.max(velocidadMaxima, Math.abs(m.velocidad));
    }
    const escalaEnergia = Math.max(Math.abs(this.energiaInicial), 0.5 * velocidadMaxima * velocidadMaxima);
    const ultima = muestras[muestras.length - 1]!;

    return {
      muestras,
      eventos: this.eventos,
      despega: this.despegado,
      resumen: {
        apogeo,
        velocidadMaxima,
        maxQ: this.maxQ?.valor ?? 0,
        deltaVIdeal: ultima.deltaVIdeal,
      },
      diagnostico: {
        metodo: 'rk4',
        dt: this.opciones.dt,
        pasos: this.pasos,
        tiempoCalculoMs: 0,
        derivaEnergia: escalaEnergia > 0 ? this.derivaEnergiaMaxima / escalaEnergia : 0,
      },
    };
  }

  /** Primer instante con F > m·g en la plataforma: m(t) = m0 − ṁ·t baja hasta F/g. */
  private instanteDespegue(plataforma: Tramo): number {
    const f = this.fuerzas(plataforma, 0, 0, this.y[M]!);
    if (f.gravedad === 0) return 0;
    const masaDespegue = f.empuje / f.gravedad;
    return Math.max(0, (this.y[M]! - masaDespegue) / plataforma.caudal);
  }

  /** Calcula las fuerzas en `this.f`, que se reutiliza para no reservar memoria en cada evaluación. */
  private fuerzas(tramo: Tramo, h: number, v: number, m: number): Fuerzas {
    const o = this.opciones;
    const f = this.f;
    const { densidad: rho, presion: p } = datosAtmosfera(h, this.atmosfera);
    let empuje = 0;
    let empujeVacio = 0;
    let isp = 0;
    if (tramo.motor) {
      isp = o.contrapresion ? ispSegunPresion(tramo.motor, p) : tramo.motor.ispVacio;
      empuje = tramo.caudal * velocidadExpulsion(isp);
      empujeVacio = tramo.caudal * velocidadExpulsion(tramo.motor.ispVacio);
    }
    const g = o.gravedad ? gravedad(h) : 0;
    const q = presionDinamica(rho, v);
    const arrastre = o.arrastre ? fuerzaArrastre(q, tramo.cd, tramo.area) : 0;
    const aceleracion = tramo.fase === 'plataforma' ? 0 : (empuje - arrastre * Math.sign(v)) / m - g;
    f.empuje = empuje;
    f.empujeVacio = empujeVacio;
    f.isp = isp;
    f.gravedad = g;
    f.densidad = rho;
    f.presion = p;
    f.presionDinamica = q;
    f.arrastre = arrastre;
    f.aceleracion = aceleracion;
    return f;
  }

  private evaluarDerivada(y: Float64Array, dy: Float64Array): void {
    const tramo = this.tramo;
    const h = y[H]!;
    const v = y[V]!;
    const m = y[M]!;
    const f = this.fuerzas(tramo, h, v, m);
    const enPlataforma = tramo.fase === 'plataforma';
    dy[H] = enPlataforma ? 0 : v;
    dy[V] = f.aceleracion;
    dy[M] = -tramo.caudal;
    dy[DV_IDEAL] = f.empujeVacio / m;
    dy[P_CONTRA] = (f.empujeVacio - f.empuje) / m;
    // En la plataforma la reacción del suelo N anula lo que el empuje no levanta:
    // g − N/m = F/m se cuenta como pérdida por gravedad y el presupuesto sigue cerrando.
    dy[P_GRAV] = enPlataforma ? f.empuje / m : f.gravedad;
    dy[P_ARR] = f.arrastre / m;
    dy[TRABAJO] = enPlataforma ? 0 : ((f.empuje - f.arrastre * Math.sign(v)) * v) / m;
  }

  /** dq/dt en un estado, con la aceleración de su derivada. */
  private derivadaQ(y: Float64Array, dy: Float64Array): number {
    const atm = datosAtmosfera(y[H]!, this.atmosfera);
    return derivadaPresionDinamica(atm.densidad, atm.derivadaDensidad, y[V]!, dy[V]!);
  }

  private presionDinamicaEn(y: Float64Array): number {
    return presionDinamica(datosAtmosfera(y[H]!, this.atmosfera).densidad, y[V]!);
  }

  /**
   * Energía mecánica específica menos el trabajo de empuje y arrastre: ε = v²/2 − μ/r − W.
   * Es constante en la solución exacta; su deriva mide el error numérico.
   */
  private energia(y: Float64Array): number {
    const v = y[V]!;
    const potencial = this.opciones.gravedad ? -MU_TIERRA / (RADIO_TIERRA + y[H]!) : 0;
    return 0.5 * v * v + potencial - y[TRABAJO]!;
  }

  private iniciar(tramo: Tramo): void {
    this.tramo = tramo;
    this.derivada(this.y, this.dy);
    this.dqInicio = this.derivadaQ(this.y, this.dy);
    this.muestras.push(this.crearMuestra(0, this.y, tramo));
  }

  /**
   * Cambia de tramo en el instante actual, soltando `masaSoltada` (kg).
   * Si dq/dt pasa de positiva a negativa justo aquí (p. ej. al apagarse el motor),
   * el Max-Q puede estar en este instante.
   */
  private cambiarTramo(nuevo: Tramo, masaSoltada = 0): void {
    const dqAntes = this.dqInicio;
    this.y[M] = this.y[M]! - masaSoltada;
    this.tramo = nuevo;
    this.derivada(this.y, this.dy);
    const dqDespues = this.derivadaQ(this.y, this.dy);
    this.dqInicio = dqDespues;
    if (this.despegado && this.y[V]! > 0 && dqAntes > 0 && dqDespues <= 0) {
      this.maxQ = this.proponer(this.maxQ, this.t, this.y, this.presionDinamicaEn(this.y));
    }
  }

  /**
   * Integra con el tramo actual hasta `tFin`, o hasta el impacto o el límite de duración.
   * @returns true si el vuelo ha terminado
   */
  private integrarHasta(tFin: number): boolean {
    const { dt, duracionMaxima } = this.opciones;
    const objetivo = Math.min(tFin, duracionMaxima);
    const inicio = this.t;
    for (let k = 1; this.t < objetivo; k++) {
      // Paso fijo contado desde el inicio del tramo; el último se ajusta para acabar en `objetivo`.
      let t1 = inicio + k * dt;
      if (t1 > objetivo - 1e-9 * dt) t1 = objetivo;
      let h = t1 - this.t;
      this.rk4.paso(this.derivada, this.y, this.dy, h, this.y1);
      this.derivada(this.y1, this.dy1);
      this.pasos++;

      let impacto = false;
      if (this.despegado && this.y1[H]! <= 0) {
        h = this.localizar(h, (y) => y[H]!, this.y[H]!, this.y1[H]!);
        t1 = this.t + h;
        this.y1.set(this.yAux);
        this.dy1.set(this.dyAux);
        impacto = true;
      }

      this.detectarEventos(h);
      this.muestrear(h, t1);
      this.avanzar(t1);
      if (impacto) {
        this.registrarEvento('impacto');
        return true;
      }
    }
    return tFin > duracionMaxima;
  }

  /** Busca dentro del paso [t, t + h] los eventos sin instante conocido de antemano. */
  private detectarEventos(h: number): void {
    const { y, y1, dy1 } = this;
    const dq0 = this.dqInicio;
    const dq1 = this.derivadaQ(y1, dy1);
    this.dqInicio = dq1;
    if (!this.despegado) return;

    if (!this.mach1Visto) {
      const g0 = numeroMach(y[V]!, y[H]!) - 1;
      const g1 = numeroMach(y1[V]!, y1[H]!) - 1;
      if (g0 < 0 && g1 >= 0) {
        const tau = this.localizar(h, (ya) => numeroMach(ya[V]!, ya[H]!) - 1, g0, g1);
        this.mach1Visto = true;
        this.registrarEvento('mach1', this.t + tau, this.yAux);
      }
    }

    if (y[V]! > 0 && y1[V]! <= 0) {
      const tau = this.localizar(h, (ya) => ya[V]!, y[V]!, y1[V]!);
      this.apogeo = this.proponer(this.apogeo, this.t + tau, this.yAux, this.yAux[H]!);
    }

    if (y[V]! > 0 && dq0 > 0 && dq1 <= 0) {
      const tau = this.localizar(h, (ya, dya) => this.derivadaQ(ya, dya), dq0, dq1);
      if (this.yAux[V]! > 0) {
        this.maxQ = this.proponer(this.maxQ, this.t + tau, this.yAux, this.presionDinamicaEn(this.yAux));
      }
    }
  }

  /**
   * Localiza dentro del paso actual el instante en que `funcion` se anula, evaluando el
   * propio paso RK4 acortado. Deja en yAux y dyAux el estado en ese instante.
   * @returns tiempo desde el inicio del paso (s)
   */
  private localizar(
    h: number,
    funcion: (y: Float64Array, dy: Float64Array) => number,
    g0: number,
    g1: number,
  ): number {
    const evaluar = (tau: number): number => {
      this.rk4.paso(this.derivada, this.y, this.dy, tau, this.yAux);
      this.derivada(this.yAux, this.dyAux);
      return funcion(this.yAux, this.dyAux);
    };
    const tau = buscarRaiz(evaluar, 0, h, g0, g1, TOLERANCIA_EVENTO);
    evaluar(tau);
    return tau;
  }

  private proponer(actual: Candidato | null, t: number, y: Float64Array, valor: number): Candidato {
    if (actual && actual.valor >= valor) return actual;
    return { t, y: y.slice(), tramo: this.tramo, valor };
  }

  /** Añade las muestras de 20 Hz que caen en (t, t1], interpolando dentro del paso. */
  private muestrear(h: number, t1: number): void {
    for (let tm = this.siguienteMuestra * PERIODO_MUESTREO; tm <= t1; tm = ++this.siguienteMuestra * PERIODO_MUESTREO) {
      interpolarHermite(this.y, this.dy, this.y1, this.dy1, h, (tm - this.t) / h, this.yAux);
      this.muestras.push(this.crearMuestra(tm, this.yAux, this.tramo));
    }
  }

  private avanzar(t1: number): void {
    const y = this.y;
    this.y = this.y1;
    this.y1 = y;
    const dy = this.dy;
    this.dy = this.dy1;
    this.dy1 = dy;
    this.t = t1;
    const deriva = Math.abs(this.energia(this.y) - this.energiaInicial);
    if (deriva > this.derivaEnergiaMaxima) this.derivaEnergiaMaxima = deriva;
  }

  private registrarEvento(tipo: TipoEvento, t: number = this.t, y: Float64Array = this.y, tramo: Tramo = this.tramo): void {
    const estado = this.crearMuestra(t, y, tramo);
    this.eventos.push({ tipo, t, estado });
  }

  private crearMuestra(t: number, y: Float64Array, tramo: Tramo): Muestra {
    const h = y[H]!;
    const v = y[V]!;
    const m = y[M]!;
    const f = this.fuerzas(tramo, h, v, m);
    return {
      t,
      altitud: h,
      velocidad: v,
      aceleracion: f.aceleracion,
      masa: m,
      empuje: f.empuje,
      caudal: tramo.caudal,
      isp: f.isp,
      // Con la gravedad local, para que el despegue sea exactamente TWR = 1.
      twr: f.empuje / (m * gravedad(h)),
      etapa: tramo.etapa,
      motorEncendido: tramo.motor !== null,
      densidad: f.densidad,
      presion: f.presion,
      temperatura: temperatura(h),
      presionDinamica: f.presionDinamica,
      mach: numeroMach(v, h),
      arrastre: f.arrastre,
      gravedad: f.gravedad,
      perdidas: {
        gravedad: y[P_GRAV]!,
        arrastre: y[P_ARR]!,
        contrapresion: y[P_CONTRA]!,
        direccion: 0,
      },
      deltaVIdeal: y[DV_IDEAL]!,
    };
  }
}
