import { VELOCIDADES, type Reproductor } from '../reproduccion/reproductor';

/** Atajos de teclado de docs/INTERFAZ.md. No actúan mientras se escribe en un campo. */
export function instalarTeclado(reproductor: Reproductor, alternarParametros: () => void): void {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const destino = e.target as HTMLElement | null;
    if (destino?.closest('input, select, textarea')) return;
    let atendida = true;
    switch (e.key) {
      case ' ':
        // Un botón con el foco ya reacciona al espacio por su cuenta.
        if (destino?.closest('button')) return;
        reproductor.alternar();
        break;
      case 'ArrowLeft':
        if (e.shiftKey) reproductor.saltarEvento(-1);
        else reproductor.pasoMuestra(-1);
        break;
      case 'ArrowRight':
        if (e.shiftKey) reproductor.saltarEvento(1);
        else reproductor.pasoMuestra(1);
        break;
      case 'Home':
        reproductor.reiniciar();
        break;
      case 'p':
      case 'P':
        alternarParametros();
        break;
      default: {
        const indice = Number(e.key) - 1;
        const velocidad = Number.isInteger(indice) ? VELOCIDADES[indice] : undefined;
        if (velocidad !== undefined) reproductor.setVelocidad(velocidad);
        else atendida = false;
      }
    }
    if (atendida) e.preventDefault();
  });
}
