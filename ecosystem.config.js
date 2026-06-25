module.exports = {
  apps: [{
    name: 'factura-backend',
    script: 'dist/app.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
    },
    log_file: 'backend-pm2.log',
    error_file: 'backend-pm2-error.log',
    out_file: 'backend-pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    max_restarts: 10,
    restart_delay: 3000,
    autorestart: true,
  }],
};
