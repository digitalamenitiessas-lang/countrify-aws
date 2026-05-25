export const metadata = {
  title: 'Términos y Condiciones — Countrify',
}

export default function TerminosPage() {
  return (
    <>
      <h1>Términos y Condiciones</h1>
      <p className="text-sm text-muted-foreground">
        Última actualización: 2026-05-25 ·{' '}
        <span className="font-medium text-amber-700 dark:text-amber-400">
          Borrador inicial — pendiente de revisión legal
        </span>
      </p>

      <h2>1. Aceptación</h2>
      <p>
        Al utilizar Countrify (en adelante, “la Plataforma”), operada por Digital
        Amenities S.A.S. (CUIT [PLACEHOLDER], con domicilio en [PLACEHOLDER]),
        usted acepta estos Términos. Si no está de acuerdo, no use la Plataforma.
      </p>

      <h2>2. Descripción del servicio</h2>
      <p>
        Countrify es un software de beneficios y gestión para countries y barrios
        cerrados. Provee funcionalidades de promociones de comercios afiliados,
        canje de cupones, comunicación con vecinos, expedientes, liquidación de
        expensas y panel administrativo para la administración del country.
      </p>

      <h2>3. Cuentas de usuario</h2>
      <ul>
        <li>
          El alta de usuarios la realiza el administrador del country o el equipo
          de Countrify en su nombre.
        </li>
        <li>
          El usuario es responsable de mantener segura su contraseña y de toda
          actividad realizada desde su cuenta.
        </li>
        <li>
          Está prohibido compartir credenciales o usar la cuenta de un tercero.
        </li>
      </ul>

      <h2>4. Uso aceptable</h2>
      <p>El usuario se compromete a no:</p>
      <ul>
        <li>Subir contenido ilegal, ofensivo o que infrinja derechos de terceros.</li>
        <li>Intentar acceder a datos de otros usuarios o countries.</li>
        <li>Realizar ingeniería inversa o automatizar accesos sin autorización.</li>
        <li>Usar la Plataforma para enviar comunicaciones no solicitadas (spam).</li>
      </ul>

      <h2>5. Datos del country</h2>
      <p>
        El country o su administración mantiene la titularidad de los datos
        cargados en la Plataforma (gastos, liquidaciones, expedientes, etc.).
        Countrify procesa esos datos para prestar el servicio según lo descrito
        en la <a href="/legal/privacidad">Política de Privacidad</a>.
      </p>

      <h2>6. Disponibilidad y soporte</h2>
      <p>
        Countrify se compromete a un uptime razonable pero no garantiza
        disponibilidad del 100%. El soporte se brinda por correo electrónico a{' '}
        <a href="mailto:digitalamenitiessas@gmail.com">digitalamenitiessas@gmail.com</a>{' '}
        en días hábiles.
      </p>

      <h2>7. Limitación de responsabilidad</h2>
      <p>
        Countrify no es responsable de: (a) decisiones administrativas o
        financieras tomadas por el country en base a información de la
        Plataforma; (b) pérdida de datos por causas ajenas (caso fortuito,
        fuerza mayor, fallas de proveedores cloud); (c) usos no autorizados de
        cuentas por compartir credenciales; (d) condiciones, calidad o
        cumplimiento de las promociones publicadas por comercios afiliados.
      </p>

      <h2>8. Modificaciones</h2>
      <p>
        Estos Términos pueden actualizarse. Las modificaciones se notifican por
        mail a los usuarios activos al menos 15 días antes de su entrada en
        vigencia. El uso continuado de la Plataforma implica aceptación.
      </p>

      <h2>9. Jurisdicción</h2>
      <p>
        Estos Términos se rigen por las leyes de la República Argentina. Las
        partes se someten a los tribunales ordinarios de [PLACEHOLDER:
        jurisdicción a definir con tu abogado].
      </p>

      <h2>10. Contacto</h2>
      <p>
        Para consultas sobre estos Términos:{' '}
        <a href="mailto:digitalamenitiessas@gmail.com">digitalamenitiessas@gmail.com</a>.
      </p>
    </>
  )
}
