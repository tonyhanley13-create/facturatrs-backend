/**
 * rnc-validator.service.ts
 *
 * Valida RNCs/Cédulas contra el padrón público de la DGII.
 *
 * NOTA 2025: La API pública `api.digital.gob.do/v3/contribuyentes` fue deprecada
 * por el OGTIC y ya no está operativa. La DGII recomienda usar el archivo de descarga
 * masiva actualizado diariamente. Por esta razón, este validador:
 *
 *   1. Valida el formato (9 dígitos = RNC, 11 dígitos = Cédula).
 *   2. Rechaza strings vacíos o con longitud incorrecta.
 *   3. Para evitar bloquear transmisiones válidas, devuelve INDETERMINADO
 *      cuando no se puede verificar en línea.
 *
 * Para integrar un proveedor externo (ej. dgiiapicloud.com, consultarnc.com.do)
 * descomenta el bloque de llamada HTTP y coloca tu API key en .env.
 */

import axios from 'axios';

// Cache en memoria: { rnc → { valid, name, timestamp } }
const rncCache = new Map<string, { valid: boolean; name: string; status: string; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

export interface RncValidationResult {
  valid: boolean;
  rnc: string;
  name: string;
  status?: string; // 'ACTIVO' | 'SUSPENDIDO' | 'NO_ENCONTRADO' | 'INDETERMINADO' | 'EXENTO_VALIDACION'
  error?: string;
}

/**
 * Limpia el RNC eliminando guiones y espacios.
 */
export function normalizeRnc(rnc: string): string {
  return rnc.replace(/[-\s]/g, '').trim();
}

/**
 * Valida localmente el formato de un RNC o Cédula Dominicana.
 * - RNC empresarial: 9 dígitos
 * - Cédula personal: 11 dígitos
 */
function validateFormat(normalized: string): { valid: boolean; type: 'RNC' | 'CEDULA' | 'INVALIDO' } {
  if (!/^\d+$/.test(normalized)) return { valid: false, type: 'INVALIDO' };
  if (normalized.length === 9) return { valid: true, type: 'RNC' };
  if (normalized.length === 11) return { valid: true, type: 'CEDULA' };
  return { valid: false, type: 'INVALIDO' };
}

/**
 * Valida un RNC o Cédula.
 *
 * Actualmente retorna INDETERMINADO cuando no se puede verificar en línea
 * (la API pública de la DGII fue deprecada). Esto evita bloquear transmisiones
 * legítimas por indisponibilidad del servicio externo.
 */
export async function validateRnc(rnc: string): Promise<RncValidationResult> {
  const normalized = normalizeRnc(rnc);

  if (!normalized) {
    return { valid: false, rnc: normalized, name: '', status: 'NO_ENCONTRADO', error: 'RNC/Cédula vacío' };
  }

  // Consumidor final — RNC especial siempre válido
  if (normalized === '00000000000' || normalized === '000000000') {
    return { valid: true, rnc: normalized, name: 'CONSUMIDOR FINAL', status: 'ACTIVO' };
  }

  // Validación de formato local
  const fmt = validateFormat(normalized);
  if (!fmt.valid) {
    return {
      valid: false,
      rnc: normalized,
      name: '',
      status: 'NO_ENCONTRADO',
      error: `Formato inválido: debe ser un RNC de 9 dígitos o una Cédula de 11 dígitos (recibido: ${normalized.length} dígitos)`,
    };
  }

  // Revisar cache
  const cached = rncCache.get(normalized);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { valid: cached.valid, rnc: normalized, name: cached.name, status: cached.status };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INTEGRACIÓN CON API DE TERCEROS (opcional)
  //
  // Si deseas validación en tiempo real, integra aquí con un proveedor externo.
  // Ejemplo con dgiiapicloud.com:
  //
  // try {
  //   const apiKey = process.env.DGII_API_KEY;
  //   const url = `https://api.dgiiapicloud.com/v1/rnc/${normalized}`;
  //   const resp = await axios.get(url, {
  //     timeout: 6000,
  //     headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
  //   });
  //   const data = resp.data;
  //   const nombre = data.nombre || data.razon_social || '';
  //   const isActive = (data.estado || '').toUpperCase() === 'ACTIVO';
  //   rncCache.set(normalized, { valid: isActive, name: nombre, status: data.estado, timestamp: Date.now() });
  //   return { valid: isActive, rnc: normalized, name: nombre, status: data.estado };
  // } catch (_) { /* fall through to INDETERMINADO */ }
  // ─────────────────────────────────────────────────────────────────────────

  // Sin API disponible: el formato es válido, retornamos INDETERMINADO.
  // La transmisión NO se bloquea por indisponibilidad del servicio de validación.
  console.info(`[RNC Validator] Formato válido (${fmt.type}) para ${normalized}. Sin validación en línea disponible.`);
  return {
    valid: true,
    rnc: normalized,
    name: '',
    status: 'INDETERMINADO',
    error: 'Validación en línea no disponible — el formato es correcto',
  };
}

/**
 * Valida el RNC del comprador para tipos de e-CF que lo requieren:
 * E31 (Crédito Fiscal), E41 (Gastos Menores), E43 (Regímenes Especiales),
 * E44 (Gubernamental), E45 (Exportación Especial), E47 (Exportación).
 */
export async function validateRncForEcfType(rnc: string, ecfType: number): Promise<RncValidationResult> {
  // Tipos que requieren RNC/Cédula del comprador
  const typesRequiringValidation = [31, 33, 34, 41, 43, 44, 45, 46, 47];

  if (!typesRequiringValidation.includes(ecfType)) {
    // E32 (Consumidor Final) no requiere RNC válido — exento de validación
    return { valid: true, rnc, name: '', status: 'EXENTO_VALIDACION' };
  }

  return validateRnc(rnc);
}

/**
 * Limpia el cache de validaciones (útil para testing).
 */
export function clearRncCache(): void {
  rncCache.clear();
}
