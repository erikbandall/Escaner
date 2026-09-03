# Vista previa (demo sin servidor)

`preview.html` es una versión **autocontenida** de la app: el mismo
HTML/CSS/JS que `public/`, pero con una capa de datos en JavaScript que
reemplaza la API real (Express + SQLite) y persiste todo en el
`localStorage` del navegador en vez de un servidor.

Sirve para:
- Abrir el archivo directo con doble clic (o `file://`) y ver la app
  funcionando sin instalar Node ni nada.
- Desplegarlo en un hosting estático (Netlify, GitHub Pages, Vercel, etc.)
  como demo pública de un clic, sin backend.

## Limitaciones frente a la app real

- Los datos se guardan **solo en el navegador de cada persona** — no hay
  base de datos compartida entre dispositivos ni usuarios.
- Trae datos de ejemplo precargados (herramientas, técnicos, líneas,
  programaciones). Hay un botón "Reiniciar demo" para volver a ese estado.
- No reemplaza a la app real (`public/` + `server.js`); es solo para
  mostrar/probar la interfaz.

## Mantenerlo al día

Este archivo se genera combinando `public/index.html`, `public/css/style.css`
y `public/js/app.js` con una capa de datos local equivalente a `routes/*.js`.
Si cambias la app real, este archivo puede quedar desactualizado hasta que
se regenere a mano.
