module.exports = {
  apps: [
    {
      name: "kpi-app",
      script: "./.next_fresh/standalone/server.js",
      node_args: "--env-file=.env.local",
      cwd: __dirname,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        PORT: 3000,
        NODE_ENV: "production",
      },
    },
    {
      name: "kpi-tunnel",
      script: "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
      args: "tunnel --config ./cloudflared/config.yml run",
      cwd: __dirname,
      autorestart: true,
      watch: false,
    },
  ],
};
