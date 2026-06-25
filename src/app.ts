import express from 'express';
import cors from 'cors';
import { PORT } from './config';

// Importar rutas
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import clientsRoutes from './routes/clients.routes';
import alanubeRoutes from './routes/alanube.routes';
import gaeRoutes from './routes/gae.routes';
import dgiiRoutes from './routes/dgii.routes';
import commercialRoutes from './routes/commercial.routes';
import invoicesRoutes from './routes/invoices.routes';
import superRoutes from './routes/super.routes';
import dgiiReceptionRoutes from './routes/dgii-reception.routes';
import dgiiContingencyRoutes from './routes/dgii-contingency.routes';
import certificacionRoutes from './routes/certificacion.routes';
import storageRoutes from './routes/storage.routes';

const app = express();

// Configuración de CORS - Permitimos localhost para desarrollo y clientes de Flutter
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:8080', // Puerto típico de Flutter web
  'http://127.0.0.1:8080',
];

app.use(cors({
  origin: true, // Permitir todos los orígenes en desarrollo para facilitar pruebas locales y dispositivos
  credentials: true,
}));

app.use(express.json());

// Logging middleware para diagnóstico
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Registro de Rutas
app.use('/auth', authRoutes);
app.use('/users', usersRoutes);
app.use('/clients', clientsRoutes);
// Rutas de Alanube
app.use('/alanube', alanubeRoutes);
// Rutas de GAE
app.use('/gae', gaeRoutes);
// Rutas de DGII
app.use('/dgii', dgiiRoutes);
// Rutas comerciales extendidas
app.use('/api/commercial', commercialRoutes);
// Rutas de facturas estándar (retrocompatibilidad)
app.use('/invoices', invoicesRoutes);
// Rutas de super administrador
app.use('/auth/super', superRoutes);
app.use('/dgii/reception', dgiiReceptionRoutes);
app.use('/dgii/contingency', dgiiContingencyRoutes);
// Rutas de Certificación
app.use('/certificacion', certificacionRoutes);
// Rutas de Storage
app.use('/storage', storageRoutes);

// Endpoint de Salud
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'FacturaTRS RD API (Node.js) funcionando correctamente',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Endpoint principal
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>FacturaTRS RD - API Node.js</title>
        <style>
            body { font-family: sans-serif; background: #f1f5f9; padding: 50px; text-align: center; color: #334155; }
            .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
            h1 { color: #1e40af; }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>FacturaTRS RD</h1>
            <p>API REST Backend en Node.js, Express y SQL Server</p>
            <p>Estado: ✅ FUNCIONANDO</p>
            <p><a href="/health">Verificar Salud</a></p>
        </div>
    </body>
    </html>
  `);
});

// Manejo de errores global
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Error no manejado:', err.stack);
  res.status(500).json({ detail: 'Ocurrió un error interno en el servidor' });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor Express iniciado en el puerto ${PORT}`);
});

export default app;
