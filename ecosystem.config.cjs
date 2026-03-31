module.exports = {
  apps: [
    {
      name: 'acs-backend',
      cwd: './backend',
      script: 'npm',
      args: 'start',
      interpreter: 'none',
      env: {
        NODE_ENV: 'development',
      },
      autorestart: true,
      watch: false,
      max_restarts: 10,
      exp_backoff_restart_delay: 100,
    },
    {
      name: 'acs-frontend-dev',
      cwd: './frontend',
      script: 'npm',
      args: 'run dev -- --host 0.0.0.0 --port 5173',
      interpreter: 'none',
      env: {
        NODE_ENV: 'development',
      },
      autorestart: true,
      watch: false,
      max_restarts: 10,
      exp_backoff_restart_delay: 100,
    },
  ],
};
