# FacturaTRS RD - Backend Node.js

Este es el servidor backend rediseñado para **FacturaTRS RD**, escrito en **Node.js**, **TypeScript** y **Express.js**, utilizando **Prisma ORM** para conectar con **SQL Server**.

## 🛠️ Requisitos Previos

1. **Node.js** (versión 18 o superior)
2. **SQL Server** local o remoto funcionando en el puerto 1433 (o el puerto configurado).

## 🚀 Instalación y Configuración

1. **Instalar Dependencias**
   ```bash
   npm install
   ```

2. **Configurar el Entorno**
   Copia el archivo `.env.example` a un nuevo archivo `.env`:
   ```bash
   cp .env.example .env
   ```
   Abre el archivo `.env` y actualiza la variable `DATABASE_URL` con tus credenciales de SQL Server y `ALANUBE_TOKEN` con tu clave del Sandbox.

3. **Generar Cliente Prisma**
   Ejecuta el siguiente comando para compilar el esquema de base de datos en tipos TypeScript:
   ```bash
   npx prisma generate
   ```

4. **Crear las Tablas en SQL Server**
   Puedes empujar el esquema de Prisma directamente a tu base de datos SQL Server:
   ```bash
   npx prisma db push
   ```
   *(Alternativamente, puedes ejecutar el script SQL Server completo disponible en `/Desktop/TonyCom2/sql_server_schema.sql` en tu SSMS o CLI).*

## 🏃 Ejecución en Desarrollo

Para arrancar el servidor en modo de desarrollo con recarga automática:
```bash
npm run dev
```

El servidor estará escuchando por defecto en el puerto `8000`:
* Base URL: `http://localhost:8000`
* Salud de API: `http://localhost:8000/health`
