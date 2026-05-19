module.exports = {
  apps: [{
    name: 'goldpilot-backend',
    script: './dist/app.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    env: {
      NODE_ENV: 'development',
      PORT: 3005
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3005
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true
  }]
};
