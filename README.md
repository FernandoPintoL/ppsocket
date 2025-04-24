# Chat en Tiempo Real - Guía de Producción

Esta guía proporciona instrucciones para configurar y desplegar esta aplicación de chat en tiempo real en un entorno de producción.

## Requisitos

- Node.js (versión 14 o superior)
- npm (versión 6 o superior)
- Un servidor con acceso a Internet

## Nota Importante sobre los Archivos del Servidor

Este proyecto contiene dos archivos de servidor:
- `server.js`: El archivo principal que contiene toda la funcionalidad completa (salas, formularios, etc.)
- `index.js`: Un archivo de servidor alternativo con funcionalidad básica

Para producción, se recomienda usar `server.js` ya que contiene la implementación completa. El script de inicio en `package.json` ya está configurado para usar este archivo.

## Configuración para Producción

### 1. Configuración de Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```
PORT=80
NODE_ENV=production
CORS_ORIGIN=https://tudominio.com,https://www.tudominio.com
```

Ajusta estas variables según tus necesidades:
- `PORT`: El puerto en el que se ejecutará el servidor (80 para HTTP, 443 para HTTPS)
- `NODE_ENV`: Debe ser "production" para habilitar optimizaciones de producción
- `CORS_ORIGIN`: Lista de dominios permitidos para conectarse al servidor, separados por comas

### 2. Instalación de Dependencias

```bash
npm install
```

### 3. Configuración de HTTPS (Recomendado)

Para producción, se recomienda usar HTTPS. Puedes configurarlo de dos maneras:

#### Opción 1: Usando un proxy inverso (Recomendado)

Configura un servidor web como Nginx o Apache como proxy inverso:

**Ejemplo de configuración de Nginx:**

```nginx
server {
    listen 80;
    server_name tudominio.com www.tudominio.com;

    # Redireccionar HTTP a HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name tudominio.com www.tudominio.com;

    ssl_certificate /ruta/a/tu/certificado.crt;
    ssl_certificate_key /ruta/a/tu/clave_privada.key;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### Opción 2: HTTPS directo en Node.js

Modifica el archivo `server.js` para usar HTTPS directamente:

```javascript
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('/ruta/a/tu/clave_privada.key'),
  cert: fs.readFileSync('/ruta/a/tu/certificado.crt')
};

const server = https.createServer(options, app);
```

### 4. Ejecución en Producción

Para ejecutar la aplicación en producción, se recomienda usar un gestor de procesos como PM2:

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar la aplicación
pm2 start server.js --name "chat-app"

# Configurar inicio automático
pm2 startup
pm2 save
```

## Consideraciones de Seguridad

1. **CORS**: Configura `CORS_ORIGIN` con los dominios específicos que necesitan acceso.
2. **Rate Limiting**: Ya está configurado para limitar las solicitudes a la API.
3. **Helmet**: Ya está configurado para establecer cabeceras de seguridad.
4. **HTTPS**: Siempre usa HTTPS en producción.
5. **Actualizaciones**: Mantén todas las dependencias actualizadas regularmente.

## Opciones de Despliegue

### Servidor VPS/Dedicado

Sigue las instrucciones anteriores en tu servidor.

### Plataformas como Servicio (PaaS)

#### Heroku

1. Crea un archivo `Procfile` en la raíz:
   ```
   web: node server.js
   ```

2. Configura las variables de entorno en el panel de Heroku.

3. Despliega con Git:
   ```bash
   git push heroku main
   ```

#### Railway/Render/Fly.io

Estas plataformas detectan automáticamente aplicaciones Node.js. Configura las variables de entorno en su panel de control.

## Monitoreo y Logging

### Logging Básico

La aplicación ya registra eventos básicos en la consola. Para producción, considera usar un servicio de logging como:

- Winston + Papertrail
- Pino + Datadog
- Morgan + ELK Stack

### Monitoreo

Para monitorear la salud de la aplicación:

```bash
# Con PM2
pm2 monit
pm2 status

# Monitoreo avanzado
# Considera servicios como New Relic, Datadog o Sentry
```

## Escalabilidad

Para manejar más usuarios, considera:

1. **Escalado Vertical**: Aumenta los recursos del servidor.
2. **Escalado Horizontal**: Ejecuta múltiples instancias detrás de un balanceador de carga.
   - Para Socket.io, necesitarás un adaptador como Redis:
   ```javascript
   const { createAdapter } = require('@socket.io/redis-adapter');
   const { createClient } = require('redis');

   const pubClient = createClient({ url: "redis://localhost:6379" });
   const subClient = pubClient.duplicate();

   io.adapter(createAdapter(pubClient, subClient));
   ```

## Solución de Problemas

- **Error de conexión de Socket.io**: Verifica la configuración de CORS y los ajustes del proxy.
- **Problemas de rendimiento**: Activa el modo de producción de Node.js con `NODE_ENV=production`.
- **Errores de memoria**: Ajusta los límites de memoria de Node.js con `--max-old-space-size`.

## Contacto y Soporte

Para soporte, contacta al equipo de desarrollo.
