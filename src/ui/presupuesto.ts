import { finAscenso, presupuestoDeltaV, type PresupuestoDeltaV } from '../analisis/presupuesto';
import type { Muestra, ResultadoSimulacion } from '../simulacion/tipos';
import { formatearNumero, partirPorPunto } from '../util/formato';

/** Cifras significativas de los términos del presupuesto (m/s). */
const CIFRAS = 6;

export interface PanelPresupuesto {
  cargar(resultado: ResultadoSimulacion): void;
  actualizar(muestra: Muestra): void;
}

interface Fila {
  entera: HTMLElement;
  fraccion: HTMLElement;
  extra: HTMLElement;
}

const TERMINOS: readonly { etiqueta: string; valor: (p: PresupuestoDeltaV) => number; porcentaje: boolean; titulo: string }[] = [
  { etiqueta: 'ideal (vacío)', valor: (p) => p.ideal, porcentaje: false, titulo: '∫ F_vacío / m dt' },
  { etiqueta: '− gravedad', valor: (p) => p.gravedad, porcentaje: true, titulo: '∫ g dt (en la plataforma, ∫ F/m dt)' },
  { etiqueta: '− arrastre', valor: (p) => p.arrastre, porcentaje: true, titulo: '∫ D / m dt' },
  { etiqueta: '− contrapresión', valor: (p) => p.contrapresion, porcentaje: true, titulo: '∫ (F_vacío − F) / m dt' },
  { etiqueta: '− dirección', valor: (p) => p.direccion, porcentaje: true, titulo: '∫ F/m · (1 − cos α) dt; 0 en 1D' },
  { etiqueta: '= resultante', valor: (p) => p.resultante, porcentaje: true, titulo: 'ideal menos todas las pérdidas' },
  { etiqueta: '|v| − |v0|', valor: (p) => p.real, porcentaje: false, titulo: 'velocidad ganada según la simulación' },
];

function celda(fila: HTMLTableRowElement, clase: string, texto = ''): HTMLTableCellElement {
  const c = fila.insertCell();
  c.className = clase;
  c.textContent = texto;
  return c;
}

/**
 * Presupuesto de Δv acumulado hasta el instante actual: Δv ideal, cada pérdida con su
 * porcentaje del ideal y la diferencia con la velocidad real como comprobación de cierre.
 */
export function crearPresupuesto(contenedor: HTMLElement): PanelPresupuesto {
  contenedor.replaceChildren();
  const cabecera = document.createElement('div');
  cabecera.className = 'panel-titulo';
  const titulo = document.createElement('span');
  titulo.textContent = 'PRESUPUESTO Δv';
  const unidades = document.createElement('span');
  unidades.textContent = '[m/s]   % ideal';
  cabecera.append(titulo, unidades);

  const tabla = document.createElement('table');
  tabla.className = 'tabla-valores';
  const filas: Fila[] = TERMINOS.map((t) => {
    const tr = tabla.insertRow();
    tr.title = t.titulo;
    celda(tr, 'simbolo', t.etiqueta);
    return { entera: celda(tr, 'entera'), fraccion: celda(tr, 'fraccion'), extra: celda(tr, 'extra') };
  });
  const filaCierre = tabla.insertRow();
  filaCierre.title = '(|v| − |v0|) − resultante: error numérico de la identidad de FISICA.md';
  celda(filaCierre, 'simbolo', 'cierre Δ');
  const cierre = { entera: celda(filaCierre, 'entera'), fraccion: celda(filaCierre, 'fraccion'), extra: celda(filaCierre, 'extra') };

  contenedor.append(cabecera, tabla);

  let v0 = 0;
  let tFinAscenso = Infinity;

  function escribir(f: Fila, valor: number): void {
    const [entera, fraccion] = partirPorPunto(formatearNumero(valor, CIFRAS));
    f.entera.textContent = entera;
    f.fraccion.textContent = fraccion;
  }

  return {
    cargar(resultado) {
      v0 = resultado.muestras[0]!.velocidad;
      tFinAscenso = finAscenso(resultado.muestras);
    },
    actualizar(muestra) {
      const p = presupuestoDeltaV(muestra, v0, tFinAscenso);
      TERMINOS.forEach((t, i) => {
        const f = filas[i]!;
        const valor = t.valor(p);
        escribir(f, valor);
        f.extra.textContent = t.porcentaje && p.ideal > 0 ? `${formatearNumero((100 * valor) / p.ideal, 3)} %` : '';
      });
      if (p.aplicable) {
        // El cierre es un error numérico: basta con 2 cifras.
        const [entera, fraccion] = partirPorPunto(formatearNumero(p.cierre, 2));
        cierre.entera.textContent = entera;
        cierre.fraccion.textContent = fraccion;
        cierre.extra.textContent = p.ideal > 0 ? `rel. ${formatearNumero(Math.abs(p.cierre) / p.ideal, 2)}` : '';
      } else {
        cierre.entera.textContent = '—';
        cierre.fraccion.textContent = '';
        cierre.extra.textContent = 'no aplicable en el descenso';
      }
    },
  };
}
