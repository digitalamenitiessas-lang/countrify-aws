export const metadata = {
  title: 'Política de Privacidad — Countrify',
}

export default function PrivacidadPage() {
  return (
    <>
      <h1>Política de Privacidad</h1>
      <p className="text-sm text-muted-foreground">
        Última actualización: 2026-05-25 ·{' '}
        <span className="font-medium text-amber-700 dark:text-amber-400">
          Borrador inicial — pendiente de revisión legal
        </span>
      </p>

      <p>
        Esta política describe cómo Digital Amenities S.A.S. (“nosotros”) trata
        los datos personales de los usuarios de Countrify (“la Plataforma”), en
        cumplimiento de la Ley 25.326 de Protección de Datos Personales de la
        República Argentina y normativa concordante.
      </p>

      <h2>1. Datos que recopilamos</h2>
      <ul>
        <li>
          <strong>Datos de cuenta:</strong> nombre, email, teléfono (opcional),
          rol (vecino, propietario, administrador del country, comercio
          afiliado, etc.).
        </li>
        <li>
          <strong>Datos del country:</strong> country o barrio cerrado, lote o
          unidad, vínculo (propietario / vecino principal / conviviente).
        </li>
        <li>
          <strong>Datos operativos:</strong> promociones canjeadas, liquidaciones
          de expensas, pagos registrados, expedientes y mensajes asociados,
          gastos. Cargados por el administrador del country o el propio usuario
          según corresponda.
        </li>
        <li>
          <strong>Datos técnicos:</strong> dirección IP, user agent, logs de
          acceso y de envío de mails (audit log).
        </li>
      </ul>

      <h2>2. Cómo usamos los datos</h2>
      <ul>
        <li>Prestar el servicio (mostrar promociones, canjear cupones, registrar pagos, etc.).</li>
        <li>
          Enviar comunicaciones transaccionales (bienvenida, restablecer
          contraseña, notificación de expedientes y liquidaciones).
        </li>
        <li>
          Cumplir obligaciones legales y atender reclamos administrativos o
          judiciales.
        </li>
        <li>
          Mejorar la Plataforma (analítica agregada, sin identificación
          individual).
        </li>
      </ul>
      <p>
        <strong>No</strong> usamos los datos para publicidad de terceros ni los
        comercializamos.
      </p>

      <h2>3. Base legal</h2>
      <p>
        El tratamiento se basa en (a) el consentimiento del usuario al
        registrarse o ser dado de alta por su administrador, (b) la necesidad
        de ejecutar el contrato de prestación de servicios, y (c) el
        cumplimiento de obligaciones legales.
      </p>

      <h2>4. Compartir datos con terceros</h2>
      <p>Compartimos datos únicamente con:</p>
      <ul>
        <li>
          <strong>Proveedores de infraestructura:</strong> Amazon Web Services
          (hosting, base de datos, envío de mails). Los datos pueden residir en
          servidores en Estados Unidos (región us-east-1). AWS adhiere a
          estándares de protección de datos compatibles con la normativa
          argentina.
        </li>
        <li>
          <strong>Administración del country:</strong> los administradores ven
          los datos de los vecinos del country que administran.
        </li>
        <li>
          <strong>Comercios afiliados:</strong> al canjear una promoción, el
          comercio ve tu nombre y la unidad/lote desde la cual canjeás, para
          registrar el canje.
        </li>
        <li>
          <strong>Autoridades:</strong> ante requerimiento legal fundado.
        </li>
      </ul>

      <h2>5. Retención</h2>
      <p>
        Conservamos los datos mientras tenés cuenta activa o mientras tu country
        mantiene contrato con Countrify. Los datos financieros se retienen al
        menos por el plazo que exige la normativa fiscal (10 años). Después
        podés solicitar su eliminación.
      </p>

      <h2>6. Tus derechos</h2>
      <p>Según Ley 25.326, podés ejercer los siguientes derechos:</p>
      <ul>
        <li><strong>Acceso:</strong> pedir copia de los datos que tenemos sobre vos.</li>
        <li><strong>Rectificación:</strong> corregir datos incorrectos.</li>
        <li><strong>Supresión:</strong> pedir borrado (cuando no haya obligación legal de retención).</li>
        <li><strong>Oposición:</strong> retirar consentimiento a comunicaciones no transaccionales.</li>
      </ul>
      <p>
        Para ejercerlos escribinos a{' '}
        <a href="mailto:digitalamenitiessas@gmail.com">digitalamenitiessas@gmail.com</a>{' '}
        identificándote. Respondemos en un plazo máximo de 10 días hábiles.
      </p>

      <h2>7. Seguridad</h2>
      <ul>
        <li>Conexiones siempre por HTTPS / TLS.</li>
        <li>Contraseñas guardadas con hashing en AWS Cognito (nunca en texto plano).</li>
        <li>Acceso a la base de datos restringido a redes privadas (RDS en VPC privada).</li>
        <li>Audit log de envíos de email y operaciones críticas.</li>
        <li>Rate limit en endpoints de autenticación para mitigar brute force.</li>
      </ul>

      <h2>8. Cookies</h2>
      <p>
        Usamos cookies estrictamente necesarias para el funcionamiento (sesión
        autenticada, preferencias de tema). Ver detalles en la{' '}
        <a href="/legal/cookies">Política de Cookies</a>.
      </p>

      <h2>9. Datos de menores</h2>
      <p>
        Countrify no está destinada a menores de 16 años. Si detectamos datos
        de menores sin autorización del responsable legal, los eliminamos.
      </p>

      <h2>10. Autoridad de control</h2>
      <p>
        En caso de incumplimiento, podés efectuar un reclamo ante la Agencia de
        Acceso a la Información Pública (
        <a
          href="https://www.argentina.gob.ar/aaip/datospersonales"
          target="_blank"
          rel="noreferrer noopener"
        >
          AAIP
        </a>
        ).
      </p>

      <h2>11. Cambios</h2>
      <p>
        Si modificamos esta política te avisamos por mail al menos 15 días antes
        de la fecha de vigencia.
      </p>

      <h2>12. Contacto</h2>
      <p>
        Digital Amenities S.A.S. ·{' '}
        <a href="mailto:digitalamenitiessas@gmail.com">digitalamenitiessas@gmail.com</a>
      </p>
    </>
  )
}
