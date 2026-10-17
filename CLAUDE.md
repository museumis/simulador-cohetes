# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Simulador técnico de ascenso de un cohete de dos etapas, en Vite + TypeScript, sin backend, publicado en GitHub Pages. Es una herramienta de ingeniería: **nada decorativo** (ni ilustraciones, partículas, sonido, efectos ni colores salvo un acento); todo lo que se muestra es un dato con unidad, una gráfica o un esquema a escala. Ver `docs/INTERFAZ.md`. Todo está en **español**: documentación, código (identificadores y comentarios) e interfaz.

El plan y el estado están en `ROADMAP.md`. Antes de implementar algo de física, leer `docs/FISICA.md`: ahí están las ecuaciones, las constantes, la secuencia de vuelo y los tests de validación que hay que cumplir.

## Comandos

```bash
npm run dev                          # servidor de desarrollo
npm test                             # Vitest en modo watch
npm test -- --run                    # una sola pasada (la usa CI)
npx vitest run tests/fisica/gravedad.test.ts   # un archivo
npx vitest run -t "nombre del test"            # un test concreto
npm run build                        # build de producción en dist/
npm run preview                      # sirve dist/ en local
```

## Arquitectura

Detalle en `docs/ARQUITECTURA.md`. Lo esencial:

- **Calcular primero, reproducir después.** `simular(cohete)` calcula el vuelo completo y devuelve `{ muestras, eventos }`. El reproductor avanza un reloj e interpola entre muestras; render, panel y gráficas solo leen ese estado.
- **Dependencias en un solo sentido:** `ui`/`render` → `reproduccion` → `simulacion` → `fisica`; `analisis` → `simulacion`.
- `src/fisica/`, `src/simulacion/` y `src/analisis/` son puros: sin DOM, Canvas ni `window`. Se prueban con Vitest sin navegador.

## Convenciones

- **Unidades SI internamente** (m, s, kg, N, Pa). Convertir a km, t, kN, etc. solo en `ui/`. Las propiedades de los tipos llevan comentada su unidad.
- La velocidad de expulsión es siempre `Isp · g0` con `g0 = 9.80665`, nunca con la gravedad local. `docs/FISICA.md` lista los errores del proyecto Java original que no deben repetirse.
- Los tests numéricos comparan con tolerancia (`toBeCloseTo` o error relativo), nunca con igualdad exacta.
- `base` en `vite.config.ts` debe ser `/simulador-cohetes/` para que funcione en GitHub Pages.

## Proyecto de origen

`../CalculoTrayectorias` es el microservicio Spring Boot original. Solo sirve de referencia; no se desarrolla más.
