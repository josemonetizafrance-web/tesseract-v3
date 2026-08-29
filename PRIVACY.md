# Política de Privacidad — TESSERACT

Última actualización: 29 de agosto de 2026

Esta política explica qué información maneja la extensión de Chrome **TESSERACT** ("la extensión"), para qué se usa y qué derechos tienes. La extensión funciona únicamente en el sitio web talkytimes.com y su propósito es ayudarte a redactar y organizar mensajes mediante asistencia de IA, bajo tu control.

## 1. Datos que se guardan en tu dispositivo

La extensión utiliza `chrome.storage.local` para almacenar **de forma local, en tu propio dispositivo**, lo siguiente:

- Configuración del panel y preferencias (idioma de redacción, límites diarios, modo de envío).
- Lista negra de contactos y historial de contactos ya escritos.
- Estado de tu sesión con el servidor TESSERACT (token de sesión propio de primer nivel).

Estos datos residen en tu equipo y no se sincronizan con terceros. Puedes borrarlos en cualquier momento eliminando la extensión o desde los ajustes del navegador.

## 2. Datos que se envían a la red

La extensión realiza peticiones de red **solo cuando tú las activas**:

- **Servidor TESSERACT (`tesseract-v3-production.up.railway.app`)**: autenticación de tu cuenta y peticiones de redacción con IA. Para generar una sugerencia se envía el contexto de la conversación en curso (texto de mensajes y, en su caso, el nombre de usuario del contacto).
- **Proveedores de IA**: el servidor TESSERACT, que tú configuras, reenvía el contexto al modelo de IA que hayas elegido (por ejemplo, OpenRouter o Google Gemini) **únicamente** para producir las sugerencias de redacción. Tus claves de API de cada proveedor se guardan en ese servidor en tu cuenta y no se exponen en las respuestas.

La extensión **no** lee tu historial de navegación, **no** monitoriza clics, teclado o desplazamiento, y **no** accede a otras pestañas ni a otros servicios de citas. No se ejecuta en ningún dominio distinto de talkytimes.com.

## 3. Comunicaciones personales y contenido del sitio

Para prestar su función de redacción asistida, la extensión procesa el contenido de tus conversaciones y de la página que tienes abierta en talkytimes.com. Este contenido se transmite al servidor TESSERACT y a la IA configurada solo cuando solicitas una sugerencia, y no se utiliza para ningún otro fin.

## 4. Lo que NO hacemos

- No vendemos ni transferimos tus datos a terceros.
- No usamos tus datos con fines publicitarios ni de marketing.
- No utilizamos tus datos para determinar tu situación crediticia ni para ofrecer préstamos.
- No conservamos tu contenido más allá de lo necesario para responder a tu petición inmediata.

## 5. Seguridad

Las comunicaciones con el servidor TESSERACT y los proveedores de IA se realizan por HTTPS. El servidor guarda las claves de API de forma separada y cifrada dentro de tu cuenta.

## 6. Tus derechos

Puedes dejar de compartir el contenido de tus conversaciones simplemente no solicitando sugerencias de IA, o desinstalando la extensión. Para eliminar los datos guardados en tu cuenta de TESSERACT, contacta con nosotros mediante la dirección de soporte indicada en la página de la extensión.

## 7. Contacto

Si tienes preguntas sobre esta política, escríbenos a: ChevyAdmin@tesseract.com