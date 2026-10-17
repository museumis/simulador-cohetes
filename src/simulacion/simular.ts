import { areaFrontal, derivadaPresionDinamicaPlana, fuerzaArrastre, presionDinamica } from '../fisica/arrastre';
import { datosAtmosfera, numeroMach, temperatura, velocidadSonido, type DatosAtmosfera } from '../fisica/atmosfera';
import { MU_TIERRA, RADIO_TIERRA } from '../fisica/constantes';
import { gravedad } from '../fisica/gravedad';
import { masaInicial, masasCombustion } from '../fisica/masas';
import { caudalMasico, ispSegunPresion, tiempoCombustion, velocidadExpulsion } from '../fisica/motor';
import { elementosOrbitales, margenOrbita, type ElementosOrbitales } from '../fisica/orbita';
import { crearIntegrador, interpolarHermite, type FuncionDerivada, type Integrador } from './integrador';
import { buscarRaiz } from './raiz';
import type { Cohete, Etapa, Evento, Muestra, OpcionesSimulacion, ResultadoSimulacion, TipoEvento } from './tipos';
import { DURACION_MAXIMA, ErrorEntrada, validarCohete, validarOpciones } from './validacion';

// Índices del vector de estado. La posición tiene su origen en el centro de la Tierra y la
// plataforma está en (0, R); en 1D x y vx son siempre 0.
const X = 0;         // posición (m)
const Y = 1;         // posición (m)
const VX = 2;        // velocidad (m/s)
const VY = 3;        // velocidad (m/s)
const M = 4;         // masa (kg)
const DV_IDEAL = 5;  // Δv ideal acumulada (m/s)
const P_GRAV = 6;    // pérdida por gravedad acumulada (m/s)
const P_ARR = 7;     // pérdida por arrastre acumulada (m/s)
const P_CONTRA = 8;  // pérdida por contrapresión acumulada (m/s)
const P_DIR = 9;     // pérdida por dirección acumulada (m/s)
const ANGULO = 10;   // ángulo central recorrido desde la plataforma (rad), para el alcance
const TRABAJO = 11;  // trabajo específico de empuje y arrastre (J/kg), para la deriva de energía
const N = 12;

/** Periodo de muestreo de la salida (s): 20 Hz. */
const PERIODO_MUESTREO = 0.05;

/**
 * Vuelo orbital que se simula tras el fin de la combustión 2 si el cohete queda en órbita (s).
 * Basta para comprobar que los elementos se conservan; una vuelta completa son unos 550 000 pasos
 * más con dt = 0,01 s y queda para el integrador de paso adaptativo (fase 6).
 */
export const DURACION_ORBITAL = 600;

/** Anchura del intervalo con la que se da por localizado un evento dentro del paso (s). */
const TOLERANCIA_EVENTO = 1e-12;

export const OPCIONES_POR_DEFECTO: Readonly<OpcionesSimulacion> = {
  modelo: '1D',
  metodo: 'rk4',
  dt: 0.01,
  duracionMaxima: DURACION_MAXIMA,
  altitudInicial: 0,
  velocidadInicial: 0,
  gravedad: true,
  arrastre: true,
  contrapresion: true,
  detenerEnApogeo: false,
};

/** Maniobra de inclinación de un cohete que no la especifica (archivos anteriores al modelo 2D). */
export const MANIOBRA_POR_DEFECTO: Readonly<Pick<Cohete, 'velocidadManiobra' | 'anguloManiobra'>> = {
  velocidadManiobra: 60,
  anguloManiobra: 3,
};

type Fase = 'plataforma' | 'combustion1' | 'pausa' | 'combustion2' | 'balistico';

/**
 * Programa de inclinación (solo 2D, docs/FISICA.md § Modelo 2D): subida vertical, maniobra con el
 * empuje inclinado un ángulo fijo respecto a la vertical local y giro gravitatorio con el empuje
 * alineado con la velocidad. En 1D el programa es siempre 'vertical'.
 */
type Programa = 'vertical' | 'maniobra' | 'giro';

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
  radio: number;           // m, distancia al centro de la Tierra
  altitud: number;         // m
  rx: number;              // vertical local (unitario)
  ry: number;
  modulo: number;          // m/s, |v|
  ejeX: number;            // eje del cohete y dirección del empuje (unitario)
  ejeY: number;
  cosAtaque: number;       // coseno del ángulo entre el eje y la velocidad; 1 si v = 0
  empuje: number;          // N
  empujeVacio: number;     // N
  isp: number;             // s
  gravedad: number;        // m/s², la aplicada
  densidad: number;        // kg/m³
  presion: number;         // Pa
  presionDinamica: number; // Pa
  arrastre: number;        // N, módulo
  ax: number;              // m/s², aceleración
  ay: number;
}

/** Candidato a un evento de máximo (apogeo, Max-Q): se queda el de mayor valor. */
interface Candidato {
  t: number;
  y: Float64Array;
  tramo: Tramo;
  programa: Programa;
  valor: number;
}

const radio = (y: Float64Array): number => Math.sqrt(y[X]! * y[X]! + y[Y]! * y[Y]!);
const altitud = (y: Float64Array): number => radio(y) - RADIO_TIERRA;
const modulo = (y: Float64Array): number => Math.sqrt(y[VX]! * y[VX]! + y[VY]! * y[VY]!);
/** Componente radial de la velocidad, dh/dt. En 1D (x = 0) es exactamente vy. */
const velocidadVertical = (y: Float64Array): number => (y[X]! * y[VX]! + y[Y]! * y[VY]!) / radio(y);
const elementos = (y: Float64Array): ElementosOrbitales => elementosOrbitales(y[X]!, y[Y]!, y[VX]!, y[VY]!);

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
 * Simula el vuelo completo de un cohete de dos etapas, vertical (1D) o en el plano (2D).
 * Integra con paso fijo (RK4 o Euler simpléctico); los pasos se acortan para terminar justo en
 * el despegue, en cada fin de combustión y en cada cambio del programa de inclinación, y los
 * demás eventos se localizan dentro del paso buscando la raíz sobre el propio paso del integrador.
 * En 2D, si el cohete queda en órbita, la simulación termina DURACION_ORBITAL después del fin de
 * la combustión 2.
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
  private readonly es2D: boolean;
  private readonly integrador: Integrador;
  private readonly derivada: FuncionDerivada = (y, dy) => this.evaluarDerivada(y, dy);
  // Inclinación del empuje en la maniobra, respecto a la vertical local.
  private readonly senoManiobra: number;
  private readonly cosenoManiobra: number;

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
  private programa: Programa = 'vertical';
  private readonly atmosfera: DatosAtmosfera = { densidad: 0, presion: 0, derivadaDensidad: 0 };
  private readonly f: Fuerzas = {
    radio: 0,
    altitud: 0,
    rx: 0,
    ry: 0,
    modulo: 0,
    ejeX: 0,
    ejeY: 0,
    cosAtaque: 1,
    empuje: 0,
    empujeVacio: 0,
    isp: 0,
    gravedad: 0,
    densidad: 0,
    presion: 0,
    presionDinamica: 0,
    arrastre: 0,
    ax: 0,
    ay: 0,
  };
  private despegado = false;
  private mach1Visto = false;
  private orbitaVista = false;
  private apogeo: Candidato | null = null;
  private maxQ: Candidato | null = null;
  private siguienteMuestra = 1;
  private dqInicio = 0;      // dq/dt al principio del paso, la del final del anterior
  private margenInicio = 0;  // margenOrbita al principio del paso (2D)
  private pasos = 0;
  private energiaInicial = 0;
  private derivaEnergiaMaxima = 0;
  private terminado = false; // apogeo balístico con detenerEnApogeo

  private readonly muestras: Muestra[] = []; // las de 20 Hz, en orden
  private readonly eventos: Evento[] = [];

  constructor(cohete: Cohete, opciones: OpcionesSimulacion) {
    this.cohete = cohete;
    this.opciones = opciones;
    this.es2D = opciones.modelo === '2D';
    this.integrador = crearIntegrador(opciones.metodo, N, [X, Y], [VX, VY]);
    const theta = (cohete.anguloManiobra * Math.PI) / 180;
    this.senoManiobra = Math.sin(theta);
    this.cosenoManiobra = Math.cos(theta);
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

    // Velocidad inicial vertical: solo la usan los tests.
    this.y[Y] = RADIO_TIERRA + opciones.altitudInicial;
    this.y[VY] = opciones.velocidadInicial;
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
      if (this.es2D && Math.abs(opciones.velocidadInicial) >= cohete.velocidadManiobra) this.cambiarPrograma('maniobra');
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

    // En órbita el vuelo no termina en un impacto: se simula un tramo fijo de vuelo orbital.
    this.integrarHasta(this.es2D && margenOrbita(elementos(this.y)) > 0 ? this.t + DURACION_ORBITAL : Infinity);
  }

  resultado(): ResultadoSimulacion {
    for (const [tipo, c] of [['apogeo', this.apogeo], ['maxQ', this.maxQ]] as const) {
      if (c) this.registrarEvento(tipo, c.t, c.y, c.tramo, c.programa);
    }
    // Orden estable: en una discontinuidad se conserva el orden antes → después.
    this.eventos.sort((a, b) => a.t - b.t);
    // Si el vuelo se corta por duracionMaxima o en órbita, la última muestra es el estado final.
    const ultimoInstante = Math.max(this.muestras.at(-1)!.t, this.eventos.at(-1)?.t ?? 0);
    if (this.t > ultimoInstante) this.muestras.push(this.crearMuestra(this.t, this.y, this.tramo, this.programa));
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
        modelo: this.opciones.modelo,
        metodo: this.opciones.metodo,
        dt: this.opciones.dt,
        pasos: this.pasos,
        tiempoCalculoMs: 0,
        derivaEnergia: escalaEnergia > 0 ? this.derivaEnergiaMaxima / escalaEnergia : 0,
      },
    };
  }

  /** Primer instante con F > m·g en la plataforma: m(t) = m0 − ṁ·t baja hasta F/g. */
  private instanteDespegue(plataforma: Tramo): number {
    const f = this.fuerzas(plataforma, 'vertical', this.y);
    if (f.gravedad === 0) return 0;
    const masaDespegue = f.empuje / f.gravedad;
    return Math.max(0, (this.y[M]! - masaDespegue) / plataforma.caudal);
  }

  /** Calcula las fuerzas en `this.f`, que se reutiliza para no reservar memoria en cada evaluación. */
  private fuerzas(tramo: Tramo, programa: Programa, y: Float64Array): Fuerzas {
    const o = this.opciones;
    const f = this.f;
    const x = y[X]!;
    const yy = y[Y]!;
    const vx = y[VX]!;
    const vy = y[VY]!;
    const m = y[M]!;
    // En 1D x = 0, así que r = y, la vertical local es (0, 1) y todo queda en el eje y sin redondeo.
    const r = Math.sqrt(x * x + yy * yy);
    const h = r - RADIO_TIERRA;
    const rx = x / r;
    const ry = yy / r;
    const v = Math.sqrt(vx * vx + vy * vy);
    const ux = v > 0 ? vx / v : 0;
    const uy = v > 0 ? vy / v : 0;

    // Eje del cohete según el programa de inclinación. La horizontal local es (ry, −rx).
    let ejeX = rx;
    let ejeY = ry;
    let cosAtaque = v > 0 ? rx * ux + ry * uy : 1;
    if (programa === 'maniobra') {
      ejeX = this.cosenoManiobra * rx + this.senoManiobra * ry;
      ejeY = this.cosenoManiobra * ry - this.senoManiobra * rx;
      cosAtaque = v > 0 ? ejeX * ux + ejeY * uy : 1;
    } else if (programa === 'giro' && v > 0) {
      ejeX = ux;
      ejeY = uy;
      cosAtaque = 1;
    }

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
    const enPlataforma = tramo.fase === 'plataforma';
    // Empuje según el eje, arrastre opuesto a la velocidad y gravedad hacia el centro de la Tierra.
    f.ax = enPlataforma ? 0 : (empuje * ejeX - arrastre * ux) / m - g * rx;
    f.ay = enPlataforma ? 0 : (empuje * ejeY - arrastre * uy) / m - g * ry;
    f.radio = r;
    f.altitud = h;
    f.rx = rx;
    f.ry = ry;
    f.modulo = v;
    f.ejeX = ejeX;
    f.ejeY = ejeY;
    f.cosAtaque = cosAtaque;
    f.empuje = empuje;
    f.empujeVacio = empujeVacio;
    f.isp = isp;
    f.gravedad = g;
    f.densidad = rho;
    f.presion = p;
    f.presionDinamica = q;
    f.arrastre = arrastre;
    return f;
  }

  private evaluarDerivada(y: Float64Array, dy: Float64Array): void {
    const tramo = this.tramo;
    const vx = y[VX]!;
    const vy = y[VY]!;
    const m = y[M]!;
    const f = this.fuerzas(tramo, this.programa, y);
    const enPlataforma = tramo.fase === 'plataforma';
    dy[X] = enPlataforma ? 0 : vx;
    dy[Y] = enPlataforma ? 0 : vy;
    dy[VX] = f.ax;
    dy[VY] = f.ay;
    dy[M] = -tramo.caudal;
    dy[DV_IDEAL] = f.empujeVacio / m;
    dy[P_CONTRA] = (f.empujeVacio - f.empuje) / m;
    // En la plataforma la reacción del suelo N anula lo que el empuje no levanta:
    // g − N/m = F/m se cuenta como pérdida por gravedad y el presupuesto sigue cerrando.
    // En 2D la pérdida es g · sin γ; en 1D se toma sin γ = 1 (docs/FISICA.md § Pérdidas de Δv).
    const senoTrayectoria = f.modulo > 0 ? (f.rx * vx + f.ry * vy) / f.modulo : 1;
    dy[P_GRAV] = enPlataforma ? f.empuje / m : this.es2D ? f.gravedad * senoTrayectoria : f.gravedad;
    dy[P_ARR] = f.arrastre / m;
    dy[P_DIR] = this.es2D ? (f.empuje * (1 - f.cosAtaque)) / m : 0;
    dy[ANGULO] = enPlataforma ? 0 : (y[Y]! * vx - y[X]! * vy) / (f.radio * f.radio);
    dy[TRABAJO] = enPlataforma ? 0 : (f.empuje * (f.ejeX * vx + f.ejeY * vy) - f.arrastre * f.modulo) / m;
  }

  /** dq/dt en un estado, con la aceleración de su derivada. */
  private derivadaQ(y: Float64Array, dy: Float64Array): number {
    const atm = datosAtmosfera(altitud(y), this.atmosfera);
    const vx = y[VX]!;
    const vy = y[VY]!;
    return derivadaPresionDinamicaPlana(
      atm.densidad,
      atm.derivadaDensidad,
      velocidadVertical(y),
      vx * vx + vy * vy,
      vx * dy[VX]! + vy * dy[VY]!,
    );
  }

  private presionDinamicaEn(y: Float64Array): number {
    return presionDinamica(datosAtmosfera(altitud(y), this.atmosfera).densidad, modulo(y));
  }

  /**
   * Energía mecánica específica menos el trabajo de empuje y arrastre: ε = v²/2 − μ/r − W.
   * Es constante en la solución exacta; su deriva mide el error numérico.
   */
  private energia(y: Float64Array): number {
    const v = modulo(y);
    const potencial = this.opciones.gravedad ? -MU_TIERRA / radio(y) : 0;
    return 0.5 * v * v + potencial - y[TRABAJO]!;
  }

  /**
   * Función que se anula en el siguiente cambio del programa de inclinación, positiva antes;
   * null si no hay ninguno pendiente.
   */
  private funcionPrograma(): ((y: Float64Array) => number) | null {
    if (!this.es2D || !this.despegado) return null;
    if (this.programa === 'vertical') return (y) => this.cohete.velocidadManiobra - modulo(y);
    if (this.programa === 'maniobra') {
      // La maniobra termina cuando la velocidad tiene la inclinación del empuje: γ = 90° − θ.
      const objetivo = Math.atan2(this.cosenoManiobra, this.senoManiobra);
      return (y) => {
        const r = radio(y);
        const vr = (y[X]! * y[VX]! + y[Y]! * y[VY]!) / r;
        const vh = (y[Y]! * y[VX]! - y[X]! * y[VY]!) / r;
        return Math.atan2(vr, vh) - objetivo;
      };
    }
    return null;
  }

  private iniciar(tramo: Tramo): void {
    this.tramo = tramo;
    this.derivada(this.y, this.dy);
    this.dqInicio = this.derivadaQ(this.y, this.dy);
    if (this.es2D) this.margenInicio = margenOrbita(elementos(this.y));
    this.muestras.push(this.crearMuestra(0, this.y, tramo, this.programa));
  }

  /**
   * Cambia de tramo en el instante actual, soltando `masaSoltada` (kg).
   */
  private cambiarTramo(nuevo: Tramo, masaSoltada = 0): void {
    this.y[M] = this.y[M]! - masaSoltada;
    this.tramo = nuevo;
    this.trasDiscontinuidad();
  }

  /** Pasa a la siguiente fase del programa de inclinación en el instante actual y registra el evento. */
  private cambiarPrograma(nuevo: Programa): void {
    this.programa = nuevo;
    this.trasDiscontinuidad();
    this.registrarEvento(nuevo === 'maniobra' ? 'inicioManiobra' : 'finManiobra');
  }

  /**
   * Recalcula la derivada tras un cambio de las fuerzas en el instante actual.
   * Si dq/dt pasa de positiva a negativa justo aquí (p. ej. al apagarse el motor),
   * el Max-Q puede estar en este instante.
   */
  private trasDiscontinuidad(): void {
    const dqAntes = this.dqInicio;
    this.derivada(this.y, this.dy);
    const dqDespues = this.derivadaQ(this.y, this.dy);
    this.dqInicio = dqDespues;
    if (this.despegado && velocidadVertical(this.y) > 0 && dqAntes > 0 && dqDespues <= 0) {
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
      this.integrador.paso(this.derivada, this.y, this.dy, h, this.y1);
      this.derivada(this.y1, this.dy1);
      this.pasos++;

      // Discontinuidades dentro del paso: se acorta para terminar justo en la primera.
      let fin: 'impacto' | 'programa' | null = null;
      if (this.despegado && altitud(this.y1) <= 0) {
        h = this.acortar(h, altitud, altitud(this.y), altitud(this.y1));
        // La raíz deja un residuo del orden de 1e-9 m; el impacto es h = 0 por definición.
        const escala = RADIO_TIERRA / radio(this.y1);
        this.y1[X] = this.y1[X]! * escala;
        this.y1[Y] = this.es2D ? this.y1[Y]! * escala : RADIO_TIERRA;
        fin = 'impacto';
      }
      const programa = this.funcionPrograma();
      if (programa) {
        const g0 = programa(this.y);
        const g1 = programa(this.y1);
        if (g0 > 0 && g1 <= 0) {
          h = this.acortar(h, programa, g0, g1);
          fin = 'programa';
        }
      }
      if (fin) t1 = this.t + h;

      this.detectarEventos(h);
      this.muestrear(h, t1);
      this.avanzar(t1);
      if (fin === 'impacto') {
        this.registrarEvento('impacto');
        return true;
      }
      if (fin === 'programa') this.cambiarPrograma(this.programa === 'vertical' ? 'maniobra' : 'giro');
      if (this.terminado) return true;
    }
    return tFin > duracionMaxima;
  }

  /** Acorta el paso en curso hasta la raíz de `funcion` y deja ahí el estado final (y1, dy1). */
  private acortar(h: number, funcion: (y: Float64Array) => number, g0: number, g1: number): number {
    const tau = this.localizar(h, funcion, g0, g1);
    this.y1.set(this.yAux);
    this.dy1.set(this.dyAux);
    return tau;
  }

  /** Busca dentro del paso [t, t + h] los eventos sin instante conocido de antemano. */
  private detectarEventos(h: number): void {
    const { y, y1, dy1 } = this;
    const dq0 = this.dqInicio;
    const dq1 = this.derivadaQ(y1, dy1);
    this.dqInicio = dq1;
    let margen0 = 0;
    let margen1 = 0;
    if (this.es2D) {
      margen0 = this.margenInicio;
      margen1 = margenOrbita(elementos(y1));
      this.margenInicio = margen1;
    }
    if (!this.despegado) return;

    if (!this.mach1Visto) {
      const mach = (ya: Float64Array): number => numeroMach(modulo(ya), altitud(ya)) - 1;
      const g0 = mach(y);
      const g1 = mach(y1);
      if (g0 < 0 && g1 >= 0) {
        const tau = this.localizar(h, mach, g0, g1);
        this.mach1Visto = true;
        this.registrarEvento('mach1', this.t + tau, this.yAux);
      }
    }

    if (this.es2D && !this.orbitaVista && margen0 <= 0 && margen1 > 0) {
      const tau = this.localizar(h, (ya) => margenOrbita(elementos(ya)), margen0, margen1);
      this.orbitaVista = true;
      this.registrarEvento('orbita', this.t + tau, this.yAux);
    }

    const vr0 = velocidadVertical(y);
    const vr1 = velocidadVertical(y1);
    if (vr0 > 0 && vr1 <= 0) {
      const tau = this.localizar(h, velocidadVertical, vr0, vr1);
      // Igual que en el impacto: en 1D v = 0 por definición, sin el residuo de la raíz.
      if (!this.es2D) this.yAux[VY] = 0;
      this.apogeo = this.proponer(this.apogeo, this.t + tau, this.yAux, altitud(this.yAux));
      // Sin motor ya no puede haber otro apogeo más alto.
      if (this.opciones.detenerEnApogeo && this.tramo.fase === 'balistico') this.terminado = true;
    }

    if (vr0 > 0 && dq0 > 0 && dq1 <= 0) {
      const tau = this.localizar(h, (ya, dya) => this.derivadaQ(ya, dya), dq0, dq1);
      if (velocidadVertical(this.yAux) > 0) {
        this.maxQ = this.proponer(this.maxQ, this.t + tau, this.yAux, this.presionDinamicaEn(this.yAux));
      }
    }
  }

  /**
   * Localiza dentro del paso actual el instante en que `funcion` se anula, evaluando el
   * propio paso del integrador acortado. Deja en yAux y dyAux el estado en ese instante.
   * @returns tiempo desde el inicio del paso (s)
   */
  private localizar(
    h: number,
    funcion: (y: Float64Array, dy: Float64Array) => number,
    g0: number,
    g1: number,
  ): number {
    const evaluar = (tau: number): number => {
      this.integrador.paso(this.derivada, this.y, this.dy, tau, this.yAux);
      this.derivada(this.yAux, this.dyAux);
      return funcion(this.yAux, this.dyAux);
    };
    const tau = buscarRaiz(evaluar, 0, h, g0, g1, TOLERANCIA_EVENTO);
    evaluar(tau);
    return tau;
  }

  private proponer(actual: Candidato | null, t: number, y: Float64Array, valor: number): Candidato {
    if (actual && actual.valor >= valor) return actual;
    return { t, y: y.slice(), tramo: this.tramo, programa: this.programa, valor };
  }

  /** Añade las muestras de 20 Hz que caen en (t, t1], interpolando dentro del paso. */
  private muestrear(h: number, t1: number): void {
    for (let tm = this.siguienteMuestra * PERIODO_MUESTREO; tm <= t1; tm = ++this.siguienteMuestra * PERIODO_MUESTREO) {
      interpolarHermite(this.y, this.dy, this.y1, this.dy1, h, (tm - this.t) / h, this.yAux);
      this.muestras.push(this.crearMuestra(tm, this.yAux, this.tramo, this.programa));
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

  private registrarEvento(
    tipo: TipoEvento,
    t: number = this.t,
    y: Float64Array = this.y,
    tramo: Tramo = this.tramo,
    programa: Programa = this.programa,
  ): void {
    const estado = this.crearMuestra(t, y, tramo, programa);
    this.eventos.push({ tipo, t, estado });
  }

  private crearMuestra(t: number, y: Float64Array, tramo: Tramo, programa: Programa): Muestra {
    const vx = y[VX]!;
    const vy = y[VY]!;
    const m = y[M]!;
    const f = this.fuerzas(tramo, programa, y);
    const h = f.altitud;
    const v = f.modulo;
    const vr = f.rx * vx + f.ry * vy;
    const vh = f.ry * vx - f.rx * vy;
    const gamma = v > 0 ? Math.atan2(vr, vh) : Math.PI / 2;
    // En el giro gravitatorio el eje es la velocidad: α = 0 exacto, sin el redondeo de las dos atan2.
    const eje = programa === 'giro' && v > 0 ? gamma : Math.atan2(f.rx * f.ejeX + f.ry * f.ejeY, f.ry * f.ejeX - f.rx * f.ejeY);
    let ataque = eje - gamma;
    if (ataque > Math.PI) ataque -= 2 * Math.PI;
    else if (ataque <= -Math.PI) ataque += 2 * Math.PI;
    // En 2D la aceleración es d|v|/dt; con v = 0 fuera de la plataforma, |a|.
    const tangencial = v > 0 ? (f.ax * vx + f.ay * vy) / v : Math.hypot(f.ax, f.ay);
    return {
      t,
      altitud: h,
      velocidad: this.es2D ? v : vy,
      aceleracion: this.es2D ? tangencial : f.ay,
      x: y[X]!,
      y: y[Y]!,
      alcance: RADIO_TIERRA * y[ANGULO]!,
      velocidadVertical: vr,
      velocidadHorizontal: vh,
      anguloTrayectoria: gamma,
      anguloEmpuje: eje,
      anguloAtaque: ataque,
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
      velocidadSonido: velocidadSonido(h),
      presionDinamica: f.presionDinamica,
      mach: numeroMach(v, h),
      arrastre: f.arrastre,
      gravedad: f.gravedad,
      perdidas: {
        gravedad: y[P_GRAV]!,
        arrastre: y[P_ARR]!,
        contrapresion: y[P_CONTRA]!,
        direccion: y[P_DIR]!,
      },
      deltaVIdeal: y[DV_IDEAL]!,
      orbita: elementos(y),
    };
  }
}
