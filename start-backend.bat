@echo off
title FacturaTRS Backend - PM2
echo ============================================
echo  FacturaTRS RD - Backend con PM2
echo ============================================
echo.

cd /d "%~dp0"

if "%1"=="stop" goto stop
if "%1"=="restart" goto restart
if "%1"=="logs" goto logs
if "%1"=="monitor" goto monitor
if "%1"=="status" goto status

:start
echo [INFO] Iniciando backend con PM2...
pm2 start ecosystem.config.js
echo.
echo [OK] Backend iniciado! Para ver logs: %~nx0 logs
echo [OK] Para ver monitoreo: %~nx0 monitor
goto end

:stop
echo [INFO] Deteniendo backend...
pm2 stop factura-backend
goto end

:restart
echo [INFO] Reiniciando backend...
pm2 restart factura-backend
goto end

:logs
pm2 logs factura-backend --lines 30
goto end

:monitor
pm2 monit
goto end

:status
echo.
echo [INFO] Estado de PM2:
pm2 status
echo.
echo [INFO] Puerto 8000:
netstat -ano | findstr ":8000"
goto end

:end
echo.
echo ============================================
