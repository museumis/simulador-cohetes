# Despliegue en GitHub Pages

La web se publica en `https://<usuario>.github.io/simulador-cohetes/` con GitHub Actions: cada push a `main` ejecuta los tests, compila y publica.

## Configuración (una sola vez)

1. Crear el repositorio `simulador-cohetes` en GitHub y subir el código.
2. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. En `vite.config.ts`, la ruta base tiene que coincidir con el nombre del repositorio:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/simulador-cohetes/',
});
```

## Workflow

`.github/workflows/desplegar.yml`:

```yaml
name: Desplegar en GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test -- --run
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Si un test falla, no se publica.

## Probar el build en local

```bash
npm run build
npm run preview
```

## Problemas habituales

- **Página en blanco y errores 404 en los archivos JS/CSS:** `base` en `vite.config.ts` no coincide con el nombre del repositorio.
- **El workflow falla en el paso de despliegue:** comprobar que Pages está configurado con la fuente "GitHub Actions".
- **Rutas de recursos rotas:** importar imágenes y sonidos desde el código (`import url from './sonido.mp3'`) o ponerlos en `public/`, nunca con rutas absolutas que empiecen por `/`.
