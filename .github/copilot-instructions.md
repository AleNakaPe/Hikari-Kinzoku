# Workspace Guidance

- Mantén la interfaz y los mensajes de usuario en español.
- Usa Angular 19 y TypeScript; conserva el diseño existente inspirado en Sakai NG y los componentes PrimeNG.
- Los datos del dominio se persisten localmente con Dexie en IndexedDB. No agregues una API o servicios externos sin una petición explícita.
- Los cambios de inventario y proyecto deben conservar las reglas transaccionales de `src/app/data/hikari-database.service.ts`.
- Ejecuta `npm run build` y las pruebas afectadas después de cambios funcionales.