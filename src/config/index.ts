import dotenv from 'dotenv';
import path from 'path';

// Cargar variables desde el archivo .env en la raíz del proyecto
dotenv.config({ path: path.join(__dirname, '../../.env') });

export const PORT = Number(process.env.PORT) || 8000;
export const DATABASE_URL = process.env.DATABASE_URL || '';
export const SECRET_KEY = process.env.SECRET_KEY || 'desarrollo_clave_secreta_local_para_node';
export const ALANUBE_API_URL = process.env.ALANUBE_API_URL || 'https://sandbox.alanube.co/dom/v1/';
export const ALANUBE_TOKEN = process.env.ALANUBE_TOKEN || '';
export const ALANUBE_COMPANY_ID = 'c6b67743-886d-415b-abe0-72e7db165051';
export const GAE_API_URL = process.env.GAE_API_URL || 'https://fe.gaedigital.com/SignatureServices/api/';
export const GAE_API_KEY = process.env.GAE_API_KEY || '';
export const CLEAR_ALL_SECRET = process.env.CLEAR_ALL_SECRET || 'Kibalion2ClearAll';

export const STORAGE_PATH = process.env.STORAGE_PATH || '';
export const CLOUD_STORAGE_ENABLED = process.env.CLOUD_STORAGE_ENABLED === 'true';
export const B2_ENDPOINT = process.env.B2_ENDPOINT || '';
export const B2_REGION = process.env.B2_REGION || 'us-west-004';
export const B2_ACCESS_KEY = process.env.B2_ACCESS_KEY || '';
export const B2_SECRET_KEY = process.env.B2_SECRET_KEY || '';
export const B2_BUCKET = process.env.B2_BUCKET || '';

console.log('🔌 Configuración cargada:');
console.log(`   Puerto: ${PORT}`);
console.log(`   Database URL: ${DATABASE_URL ? '✅ Configurada' : '❌ No configurada'}`);
console.log(`   Token Alanube: ${ALANUBE_TOKEN ? '✅ Configurado' : '❌ No configurado'}`);
console.log(`   GAE API Key: ${GAE_API_KEY ? '✅ Configurado' : '❌ No configurado'}`);
console.log(`   Cloud Storage: ${CLOUD_STORAGE_ENABLED ? '✅ Habilitado' : '❌ Deshabilitado'}`);
