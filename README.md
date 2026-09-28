# Sistema Hikari Kinzoku

Aplicación local de control interno para inventario, proyectos, flujo de caja y seguimiento operativo. Interfaz Angular 19 con PrimeNG, tema visual inspirado en Sakai NG y gráficas Chart.js.

## Requisitos

- Node.js 20.11 o posterior
- npm

## Desarrollo

```bash
npm install
npm start
```

Abre `http://localhost:4200`. La aplicación se ejecuta en el navegador y no requiere API ni conexión a internet después de instalar las dependencias.

## Datos y reglas

Los registros se almacenan localmente en IndexedDB mediante Dexie, en el perfil del navegador/dispositivo. No se envían a un servidor. Al primer inicio se cargan datos de ejemplo para mostrar el dashboard; pueden modificarse desde las pantallas.

- Stock actual = stock inicial + entradas − salidas.
- Registrar un proyecto descuenta sus materiales en una transacción y rechaza existencias insuficientes.
- El costo de materiales usa el costo unitario vigente al crear el proyecto.
- Registrar una compra aumenta existencias, actualiza el costo promedio y genera un egreso de caja.
- Finalizar un proyecto genera un ingreso de caja por su precio de venta.
- Margen = precio de venta − costo de materiales − mano de obra.
- El saldo de caja se calcula como ingresos menos egresos.

Los datos son propios del navegador local. No existe sincronización ni respaldo automático; al limpiar los datos del sitio se eliminarán los registros.

## Verificación

```bash
npm run build
npm test -- --watch=false --browsers=ChromeHeadless
```