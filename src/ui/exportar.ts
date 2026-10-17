/** Descarga un texto como archivo. */
export function descargar(nombre: string, texto: string, tipo: string): void {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  // Tras el clic el navegador ya tiene su copia.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Nombre de archivo a partir del nombre del cohete: "Falcon 9 Block 5" → "falcon-9-block-5". */
export function nombreArchivo(nombre: string): string {
  const base = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base || 'simulacion';
}

export interface AccionesExportar {
  csv(): void;
  json(): void;
  svg(): void;
  /** Copia la URL con los parámetros; devuelve el texto que se ha copiado. */
  enlace(): Promise<string>;
  cargarJSON(texto: string): void;
}

export interface BarraExportar {
  alternar(): void;
  /** Muestra un aviso breve junto a los botones (resultado de copiar, error al cargar…). */
  avisar(texto: string): void;
}

function boton(texto: string, titulo: string, alPulsar: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = texto;
  b.title = titulo;
  b.addEventListener('click', alPulsar);
  return b;
}

/** Barra de exportación bajo la cabecera, que se abre y cierra con el botón o con E. */
export function crearBarraExportar(contenedor: HTMLElement, botonAbrir: HTMLButtonElement, acciones: AccionesExportar): BarraExportar {
  contenedor.replaceChildren();
  contenedor.hidden = true;
  const selectorArchivo = document.createElement('input');
  selectorArchivo.type = 'file';
  selectorArchivo.accept = '.json,application/json';
  selectorArchivo.hidden = true;
  const aviso = document.createElement('span');
  aviso.className = 'nota';
  aviso.setAttribute('role', 'status');

  contenedor.append(
    boton('CSV', 'Todas las muestras y variables, en SI, con unidades en la cabecera', acciones.csv),
    boton('JSON', 'Entrada, configuración del modelo, resumen, diagnóstico y eventos', acciones.json),
    boton('SVG', 'Las gráficas tal como se ven: magnitudes, escalas, zoom y referencia', acciones.svg),
    boton('copiar enlace', 'URL con todos los parámetros, para reproducir esta simulación exacta', () => {
      acciones.enlace().then(
        () => avisar('enlace copiado'),
        () => avisar('no se ha podido copiar: el enlace está en la barra de direcciones'),
      );
    }),
    boton('cargar JSON…', 'Cargar la entrada de un JSON exportado', () => selectorArchivo.click()),
    selectorArchivo,
    aviso,
  );

  selectorArchivo.addEventListener('change', () => {
    const archivo = selectorArchivo.files?.[0];
    selectorArchivo.value = '';
    if (!archivo) return;
    archivo.text().then(acciones.cargarJSON, (e: unknown) => avisar(`no se ha podido leer: ${String(e)}`));
  });

  let temporizador: ReturnType<typeof setTimeout> | undefined;
  function avisar(texto: string): void {
    aviso.textContent = texto;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => (aviso.textContent = ''), 6000);
  }

  function alternar(): void {
    contenedor.hidden = !contenedor.hidden;
    botonAbrir.setAttribute('aria-expanded', String(!contenedor.hidden));
  }
  botonAbrir.setAttribute('aria-expanded', 'false');
  botonAbrir.addEventListener('click', alternar);

  return { alternar, avisar };
}
