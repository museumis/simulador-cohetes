# Simulador de cohetes

Simulador técnico de ascenso de un cohete de dos etapas. Integra numéricamente el vuelo en el navegador (empuje dependiente de la presión, gravedad variable, atmósfera, arrastre, separación de etapas) y lo presenta como telemetría, gráficas sincronizadas y un esquema a escala, con presupuesto de Δv y diagnóstico del error numérico.

Sin elementos decorativos: todo lo que aparece en pantalla es un dato, una gráfica o un esquema.

Funciona entero en el navegador, sin servidor, y se publica en GitHub Pages:
`https://museumis.github.io/simulador-cohetes/`

> **Estado:** en planificación. Ver [ROADMAP.md](ROADMAP.md).

## Qué hará

- Parámetros de cada etapa (masas, empuje, Isp a nivel del mar y en vacío, diámetro, Cd) o modelos predefinidos con la fuente de cada dato.
- Telemetría completa en cada instante: h, v, a, m, F, ṁ, Isp, TWR, ρ, p, T, Mach, q.
- Gráficas apiladas con eje de tiempo común, cursor sincronizado, marcas de eventos y escala logarítmica.
- Eventos con instante exacto: despegue, Mach 1, Max-Q, fines de combustión, separación, apogeo.
- Presupuesto de Δv: ideal menos pérdidas por gravedad, arrastre, contrapresión y dirección, con comprobación de cierre.
- Diagnóstico numérico: método, dt, pasos, deriva de energía y error estimado por Richardson.
- Exportación a CSV, JSON y SVG; parámetros en la URL para reproducir una simulación exacta.
- Comparación de simulaciones y barridos de parámetros.
- Trayectoria 2D con giro gravitatorio, elementos orbitales y, más adelante, modelos de alta fidelidad (US Standard 1976, Cd(Mach), rotación terrestre).

## Tecnología

- [Vite](https://vitejs.dev/) + TypeScript, sin framework de interfaz.
- Canvas 2D para el esquema a escala.
- uPlot para las gráficas.
- Vitest para los tests.
- GitHub Actions + GitHub Pages para el despliegue.

## Desarrollo

Requiere Node.js 22.12 o superior (lo exigen Vite 8 y Vitest 5).

```bash
npm install
npm run dev        # servidor de desarrollo
npm test           # tests
npm run build      # build de producción en dist/
```

## Documentación

- [ROADMAP.md](ROADMAP.md): fases y tareas.
- [docs/FISICA.md](docs/FISICA.md): modelo físico, ecuaciones, unidades y validación.
- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md): estructura del código y flujo de datos.
- [docs/INTERFAZ.md](docs/INTERFAZ.md): paneles, gráficas, exportación y teclado.
- [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md): publicación en GitHub Pages.

## Origen

Nace a partir del microservicio Java `CalculoTrayectorias` (Spring Boot), que calculaba el Δv de un cohete de dos etapas. La física se porta aquí ya corregida; los errores encontrados están en [docs/FISICA.md](docs/FISICA.md#errores-corregidos-del-proyecto-java).
