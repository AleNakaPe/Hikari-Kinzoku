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

## Aplicación de escritorio para Windows

La versión de escritorio empaqueta la interfaz Angular dentro de Electron y guarda los datos en un archivo SQLite local, fuera del almacenamiento del navegador. El instalador crea accesos directos en el escritorio y en el menú Inicio; al abrirlos se inicia la aplicación sin arrancar un servidor web.

Para ejecutar la versión de escritorio durante el desarrollo:

```bash
npm run desktop
```

Para generar el instalador de Windows x64:

```bash
npm run package:windows
```

El instalador se crea en `release/Hikari Kinzoku Setup 0.0.0.exe`. Este comando compila Angular con una base relativa (`./`) para que sus scripts y estilos carguen correctamente desde el paquete local de Electron. SQLite se guarda en el directorio de datos de usuario de Electron (`app.getPath('userData')/hikari-control.sqlite`) y permanece aunque se cierre o actualice la aplicación.

La versión web y la versión de escritorio usan almacenamientos separados (IndexedDB y SQLite respectivamente); no se sincronizan ni importan entre sí automáticamente. La aplicación de escritorio se inicializa con datos de ejemplo.

## Funcionalidades

- **Resumen:** indicadores operativos y gráficas de inventario, proyectos y caja.
- **Inventario:** materiales, existencias, entradas de compra y alertas de stock bajo.
- **Presupuestos:** crear, consultar, editar y eliminar presupuestos. La eliminación solicita confirmación. Cada presupuesto puede imprimirse como una nota con folio, cliente, fecha, descripción e importe; desde el diálogo de impresión del navegador se puede guardar como PDF.
- **Proyectos:** registrar proyectos con materiales y mano de obra, consultar costos y margen, y filtrar por texto o mes. Al finalizar un proyecto se solicita confirmación antes de registrar su precio de venta como ingreso en caja.
- **Caja:** consultar ingresos y egresos, incluido el saldo acumulado. Las compras y los cierres de proyecto generan sus movimientos correspondientes.

## Datos y reglas

En la versión web, los registros se almacenan en IndexedDB mediante Dexie, dentro del perfil del navegador. En la versión de escritorio, se almacenan en el archivo SQLite del perfil de Electron. Ninguna versión envía los datos a un servidor. Una instalación nueva carga datos de ejemplo para mostrar el dashboard; pueden modificarse desde las pantallas.

- Stock actual = stock inicial + entradas − salidas.
- Registrar un proyecto descuenta sus materiales en una transacción y rechaza existencias insuficientes.
- El costo de materiales usa el costo unitario vigente al crear el proyecto.
- Registrar una compra aumenta existencias, actualiza el costo promedio y genera un egreso de caja.
- Finalizar un proyecto genera un ingreso de caja por su precio de venta.
- Margen = precio de venta − costo de materiales − mano de obra.
- El saldo de caja se calcula como ingresos menos egresos.

Los datos son propios del navegador o de la instalación local. No existe sincronización ni respaldo automático. Los registros que ya estaban en Chrome o Edge no se importan automáticamente al instalar la versión de escritorio.

## Verificación

```bash
npm run build
npm test -- --watch=false --browsers=ChromeHeadless
npm run test:desktop
```