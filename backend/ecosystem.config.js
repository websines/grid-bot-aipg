module.exports = {
  apps: [{
    name: 'bot_backend',
    script: 'uvicorn',
    args: 'app.main:app --host 0.0.0.0 --port 8000',
    interpreter: 'python3',
    env: {
      NODE_ENV: 'production',
      PYTHONPATH: '.'
    }
  }]
};
