/**
 * Área frontal de un cuerpo de sección circular: A = π · (d/2)².
 * @param diametro (m)
 * @returns área (m²)
 */
export function areaFrontal(diametro: number): number {
  const radio = diametro / 2;
  return Math.PI * radio * radio;
}

/**
 * Presión dinámica: q = ½ · ρ · v².
 * @param densidad (kg/m³)
 * @param velocidad (m/s)
 * @returns presión dinámica (Pa)
 */
export function presionDinamica(densidad: number, velocidad: number): number {
  return 0.5 * densidad * velocidad * velocidad;
}

/**
 * Derivada temporal de la presión dinámica: dq/dt = ½ · (dρ/dh) · v³ + ρ · v · a,
 * usando dh/dt = v. Se anula en Max-Q.
 * @param densidad ρ (kg/m³)
 * @param derivadaDensidad dρ/dh (kg/m⁴)
 * @param velocidad v (m/s)
 * @param aceleracion a = dv/dt (m/s²)
 * @returns dq/dt (Pa/s)
 */
export function derivadaPresionDinamica(
  densidad: number,
  derivadaDensidad: number,
  velocidad: number,
  aceleracion: number,
): number {
  return 0.5 * derivadaDensidad * velocidad * velocidad * velocidad + densidad * velocidad * aceleracion;
}

/**
 * Módulo de la fuerza de arrastre: D = q · cd · A. Su sentido es opuesto a la velocidad.
 * @param presionDinamica q (Pa)
 * @param cd coeficiente de arrastre (adimensional)
 * @param area área frontal (m²)
 * @returns fuerza (N)
 */
export function fuerzaArrastre(presionDinamica: number, cd: number, area: number): number {
  return presionDinamica * cd * area;
}
