import { describe, expect, it } from 'vitest';
import { exportarCSV } from '../../src/exportacion/csv';
import { ErrorFormato, exportarJSON, leerJSON } from '../../src/exportacion/json';
import { graficasSVG } from '../../src/exportacion/svg';
import { codificarURL, decodificarURL } from '../../src/exportacion/url';
import { FALCON_9 } from '../../src/modelos/falcon9';
import type { Entrada } from '../../src/simulacion/campos';
import { MANIOBRA_POR_DEFECTO, OPCIONES_POR_DEFECTO, simular } from '../../src/simulacion/simular';
import { COHETE_PRUEBA } from '../simulacion/cohetes';

const entrada: Entrada = {
  cohete: COHETE_PRUEBA,
  opciones: { ...OPCIONES_POR_DEFECTO, dt: 0.02 },
};
const r = simular(entrada.cohete, entrada.opciones);

describe('CSV', () => {
  const csv = exportarCSV(r);
  const lineas = csv.trimEnd().split('\r\n');
  const cabecera = lineas[0]!.split(',');

  it('una fila por muestra con todas las variables y su unidad', () => {
    expect(lineas.length).toBe(r.muestras.length + 1);
    expect(cabecera[0]).toBe('t [s]');
    expect(cabecera).toContain('presionDinamica [Pa]');
    expect(cabecera).toContain('alcance [m]');
    expect(cabecera).toContain('altitudPerigeo [m]');
    expect(cabecera.at(-1)).toBe('evento');
    for (const l of lineas) expect(l.split(',').length).toBe(cabecera.length);
  });

  it('los números se leen de vuelta exactamente', () => {
    const k = 1234;
    const fila = lineas[k + 1]!.split(',');
    expect(Number(fila[cabecera.indexOf('altitud [m]')])).toBe(r.muestras[k]!.altitud);
    expect(Number(fila[cabecera.indexOf('perdidaArrastre [m/s]')])).toBe(r.muestras[k]!.perdidas.arrastre);
  });

  it('marca las muestras de los eventos', () => {
    const eventos = lineas.slice(1).map((l) => l.split(',').at(-1)).filter((e) => e !== '');
    expect(eventos).toEqual(r.eventos.map((e) => e.tipo));
  });
});

describe('JSON', () => {
  it('se vuelve a leer la misma entrada y reproduce la simulación', () => {
    const leida = leerJSON(exportarJSON(entrada, r));
    expect(leida).toEqual(entrada);
    expect(simular(leida.cohete, leida.opciones).resumen).toEqual(r.resumen);
  });

  it('incluye la configuración del modelo y los eventos', () => {
    const datos = JSON.parse(exportarJSON(entrada, r));
    expect(datos.modelo.dimension).toBe('1D');
    expect(datos.diagnostico.metodo).toBe('rk4');
    expect(datos.eventos.map((e: { tipo: string }) => e.tipo)).toEqual(r.eventos.map((e) => e.tipo));
  });

  it('rechaza archivos con otro formato', () => {
    expect(() => leerJSON('no es json')).toThrow(ErrorFormato);
    expect(() => leerJSON('{"formato":"otro","version":1}')).toThrow(/formato/);
    const sinEtapa = JSON.parse(exportarJSON(entrada, r));
    delete sinEtapa.cohete.etapas[1].ispVacio;
    expect(() => leerJSON(JSON.stringify(sinEtapa))).toThrow('cohete.etapas[1].ispVacio: se esperaba un número');
  });

  it('las opciones que faltan toman su valor por defecto', () => {
    const datos = JSON.parse(exportarJSON(entrada, r));
    delete datos.opciones;
    expect(leerJSON(JSON.stringify(datos)).opciones).toEqual(OPCIONES_POR_DEFECTO);
  });

  it('modelo 2D: ida y vuelta con la maniobra, y archivos anteriores sin ella', () => {
    const plana: Entrada = { cohete: FALCON_9, opciones: { ...OPCIONES_POR_DEFECTO, modelo: '2D', duracionMaxima: 300 } };
    const texto = exportarJSON(plana, simular(plana.cohete, plana.opciones));
    expect(JSON.parse(texto).modelo.dimension).toBe('2D');
    expect(leerJSON(texto)).toEqual(plana);
    const antiguo = JSON.parse(exportarJSON(entrada, r));
    delete antiguo.cohete.velocidadManiobra;
    delete antiguo.cohete.anguloManiobra;
    const leido = leerJSON(JSON.stringify(antiguo));
    expect([leido.cohete.velocidadManiobra, leido.cohete.anguloManiobra]).toEqual([
      MANIOBRA_POR_DEFECTO.velocidadManiobra,
      MANIOBRA_POR_DEFECTO.anguloManiobra,
    ]);
  });
});

describe('URL', () => {
  it('ida y vuelta exacta, también con decimales sin representación finita', () => {
    const rara: Entrada = {
      cohete: { ...FALCON_9, nombre: 'Prueba & ñ', masaCargaUtil: 0.1 + 0.2, anguloManiobra: 1 / 7 },
      opciones: { ...OPCIONES_POR_DEFECTO, modelo: '2D', metodo: 'eulerSimplectico', dt: 1 / 3 },
    };
    const leida = decodificarURL(`?${codificarURL(rara)}`, entrada);
    expect(leida).toEqual(rara);
  });

  it('sin parámetros no hay simulación, y los que faltan se toman de la base', () => {
    expect(decodificarURL('', entrada)).toBeNull();
    const parcial = decodificarURL('v=1&masaCargaUtil=500&e2.cd=abc', entrada)!;
    expect(parcial.cohete.masaCargaUtil).toBe(500);
    expect(parcial.cohete.etapas[1].cd).toBeNaN();
    expect(parcial.cohete.etapas[0]).toEqual(COHETE_PRUEBA.etapas[0]);
    expect(parcial.opciones.dt).toBe(0.02);
    // Un enlace anterior al modelo 2D no lleva ni el modelo ni la maniobra.
    expect(parcial.opciones.modelo).toBe('1D');
    expect(parcial.cohete.velocidadManiobra).toBe(COHETE_PRUEBA.velocidadManiobra);
  });
});

describe('SVG', () => {
  const xs = r.muestras.map((m) => m.t);
  const svg = graficasSVG(
    [
      { etiqueta: 'h [m]', series: [{ x: xs, y: r.muestras.map((m) => m.altitud), discontinua: false }], log: false },
      {
        etiqueta: 'ρ [kg/m³]',
        series: [{ x: xs, y: r.muestras.map((m) => m.densidad), discontinua: true }],
        log: true,
      },
    ],
    { titulo: 'Cohete <prueba>', etiquetaX: 't [s]', xMin: 0, xMax: xs.at(-1)!, eventos: r.eventos.map((e) => e.t) },
  );

  it('un documento SVG con las dos gráficas, sus ejes y los eventos', () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('Cohete &lt;prueba&gt;');
    expect(svg).toContain('>h [m]<');
    expect(svg).toContain('>t [s]<');
    expect(svg.match(/stroke-dasharray="2 3"/g)!.length).toBe(2 * r.eventos.length);
    expect(svg).toContain('stroke-dasharray="5 3"');
  });

  it('reduce los puntos sin pasar de unos pocos por píxel', () => {
    const puntos = [...svg.matchAll(/points="([^"]*)"/g)].map((m) => m[1]!.split(' ').length);
    expect(puntos.length).toBeGreaterThanOrEqual(2);
    for (const n of puntos) expect(n).toBeLessThanOrEqual(4 * 960);
    expect(xs.length).toBeGreaterThan(4 * 960);
  });

  it('en escala logarítmica rotula potencias de 10', () => {
    expect(svg).toMatch(/>1e-\d+</);
  });
});
