import type { Muestra, ResultadoSimulacion } from '../simulacion/tipos';

/** Una columna del CSV: cabecera con su unidad SI y valor de cada muestra. */
interface Columna {
  cabecera: string;
  valor: (m: Muestra) => number | string;
}

const COLUMNAS: readonly Columna[] = [
  { cabecera: 't [s]', valor: (m) => m.t },
  { cabecera: 'altitud [m]', valor: (m) => m.altitud },
  { cabecera: 'velocidad [m/s]', valor: (m) => m.velocidad },
  { cabecera: 'aceleracion [m/s²]', valor: (m) => m.aceleracion },
  { cabecera: 'x [m]', valor: (m) => m.x },
  { cabecera: 'y [m]', valor: (m) => m.y },
  { cabecera: 'alcance [m]', valor: (m) => m.alcance },
  { cabecera: 'velocidadVertical [m/s]', valor: (m) => m.velocidadVertical },
  { cabecera: 'velocidadHorizontal [m/s]', valor: (m) => m.velocidadHorizontal },
  { cabecera: 'anguloTrayectoria [rad]', valor: (m) => m.anguloTrayectoria },
  { cabecera: 'anguloEmpuje [rad]', valor: (m) => m.anguloEmpuje },
  { cabecera: 'anguloAtaque [rad]', valor: (m) => m.anguloAtaque },
  { cabecera: 'anguloTrayectoriaAire [rad]', valor: (m) => m.anguloTrayectoriaAire },
  { cabecera: 'velocidadAire [m/s]', valor: (m) => m.velocidadAire },
  { cabecera: 'masa [kg]', valor: (m) => m.masa },
  { cabecera: 'empuje [N]', valor: (m) => m.empuje },
  { cabecera: 'caudal [kg/s]', valor: (m) => m.caudal },
  { cabecera: 'regulacion [1]', valor: (m) => m.regulacion },
  { cabecera: 'isp [s]', valor: (m) => m.isp },
  { cabecera: 'twr [1]', valor: (m) => m.twr },
  { cabecera: 'etapa', valor: (m) => m.etapa },
  { cabecera: 'motorEncendido', valor: (m) => (m.motorEncendido ? 1 : 0) },
  { cabecera: 'densidad [kg/m³]', valor: (m) => m.densidad },
  { cabecera: 'presion [Pa]', valor: (m) => m.presion },
  { cabecera: 'temperatura [K]', valor: (m) => m.temperatura },
  { cabecera: 'velocidadSonido [m/s]', valor: (m) => m.velocidadSonido },
  { cabecera: 'presionDinamica [Pa]', valor: (m) => m.presionDinamica },
  { cabecera: 'mach [1]', valor: (m) => m.mach },
  { cabecera: 'arrastre [N]', valor: (m) => m.arrastre },
  { cabecera: 'cd [1]', valor: (m) => m.cd },
  { cabecera: 'gravedad [m/s²]', valor: (m) => m.gravedad },
  { cabecera: 'deltaVIdeal [m/s]', valor: (m) => m.deltaVIdeal },
  { cabecera: 'perdidaGravedad [m/s]', valor: (m) => m.perdidas.gravedad },
  { cabecera: 'perdidaArrastre [m/s]', valor: (m) => m.perdidas.arrastre },
  { cabecera: 'perdidaContrapresion [m/s]', valor: (m) => m.perdidas.contrapresion },
  { cabecera: 'perdidaDireccion [m/s]', valor: (m) => m.perdidas.direccion },
  { cabecera: 'energiaOrbital [J/kg]', valor: (m) => m.orbita.energia },
  { cabecera: 'momentoAngular [m²/s]', valor: (m) => m.orbita.momentoAngular },
  { cabecera: 'semiejeMayor [m]', valor: (m) => m.orbita.semiejeMayor },
  { cabecera: 'excentricidad [1]', valor: (m) => m.orbita.excentricidad },
  { cabecera: 'altitudPerigeo [m]', valor: (m) => m.orbita.altitudPerigeo },
  { cabecera: 'altitudApogeo [m]', valor: (m) => m.orbita.altitudApogeo },
];

/**
 * CSV con todas las muestras y todas las variables, en SI y con la precisión completa de
 * double (el texto se vuelve a leer como el mismo número). Separador coma, punto decimal y
 * fin de línea CRLF (RFC 4180). La última columna indica los eventos de las muestras exactas.
 */
export function exportarCSV(resultado: ResultadoSimulacion): string {
  const eventos = new Map<Muestra, string>();
  for (const e of resultado.eventos) {
    const previo = eventos.get(e.estado);
    eventos.set(e.estado, previo ? `${previo} ${e.tipo}` : e.tipo);
  }
  const lineas = [[...COLUMNAS.map((c) => c.cabecera), 'evento'].join(',')];
  for (const m of resultado.muestras) {
    lineas.push([...COLUMNAS.map((c) => String(c.valor(m))), eventos.get(m) ?? ''].join(','));
  }
  return `${lineas.join('\r\n')}\r\n`;
}
