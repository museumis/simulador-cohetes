export interface Pestanas {
  /** Contenedor del contenido de una pestaña. */
  panel(id: string): HTMLElement;
  activar(id: string): void;
}

/**
 * Pestañas dentro de un panel: una fila de botones y un contenido visible a la vez.
 * Con el foco en la fila, ← y → cambian de pestaña (patrón de WAI-ARIA).
 */
export function crearPestanas(contenedor: HTMLElement, pestanas: readonly { id: string; titulo: string }[]): Pestanas {
  contenedor.replaceChildren();
  const fila = document.createElement('div');
  fila.className = 'pestanas';
  fila.setAttribute('role', 'tablist');
  const botones = new Map<string, HTMLButtonElement>();
  const paneles = new Map<string, HTMLElement>();

  for (const p of pestanas) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.id = `pestana-${p.id}`;
    boton.textContent = p.titulo;
    boton.setAttribute('role', 'tab');
    boton.setAttribute('aria-controls', `contenido-${p.id}`);
    boton.addEventListener('click', () => activar(p.id));
    fila.append(boton);
    botones.set(p.id, boton);

    const panel = document.createElement('div');
    panel.id = `contenido-${p.id}`;
    panel.className = 'pestana-contenido';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', boton.id);
    paneles.set(p.id, panel);
  }
  contenedor.append(fila, ...paneles.values());

  function activar(id: string): void {
    for (const [clave, boton] of botones) {
      const activa = clave === id;
      boton.setAttribute('aria-selected', String(activa));
      boton.tabIndex = activa ? 0 : -1;
      paneles.get(clave)!.hidden = !activa;
    }
  }

  fila.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const ids = pestanas.map((p) => p.id);
    const actual = ids.findIndex((id) => botones.get(id) === document.activeElement);
    if (actual < 0) return;
    const siguiente = ids[(actual + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length]!;
    activar(siguiente);
    botones.get(siguiente)!.focus();
    // Que el reproductor no reciba también la flecha.
    e.preventDefault();
    e.stopPropagation();
  });

  activar(pestanas[0]!.id);
  return {
    panel: (id) => {
      const p = paneles.get(id);
      if (!p) throw new RangeError(`Pestaña desconocida: ${id}`);
      return p;
    },
    activar,
  };
}
