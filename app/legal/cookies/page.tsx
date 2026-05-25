export const metadata = {
  title: 'Política de Cookies — Countrify',
}

export default function CookiesPage() {
  return (
    <>
      <h1>Política de Cookies</h1>
      <p className="text-sm text-muted-foreground">
        Última actualización: 2026-05-25 ·{' '}
        <span className="font-medium text-amber-700 dark:text-amber-400">
          Borrador inicial — pendiente de revisión legal
        </span>
      </p>

      <h2>1. Qué son las cookies</h2>
      <p>
        Las cookies son pequeños archivos que tu navegador guarda al visitar un
        sitio web. Sirven para recordar tu sesión, tus preferencias, o para
        analizar uso.
      </p>

      <h2>2. Qué cookies usamos en Countrify</h2>
      <p>
        Countrify usa <strong>únicamente cookies estrictamente necesarias</strong> para
        el funcionamiento del servicio. <strong>No usamos cookies de publicidad
        ni de tracking de terceros.</strong>
      </p>

      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Propósito</th>
            <th>Duración</th>
            <th>Tipo</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>countrify_session</code></td>
            <td>Mantiene tu sesión iniciada después del login.</td>
            <td>12 horas</td>
            <td>Necesaria</td>
          </tr>
          <tr>
            <td><code>theme</code></td>
            <td>Recuerda si elegiste modo claro u oscuro.</td>
            <td>1 año</td>
            <td>Preferencia</td>
          </tr>
        </tbody>
      </table>

      <h2>3. Cookies de terceros</h2>
      <p>
        Countrify <strong>no usa</strong> servicios de analítica de terceros
        (Google Analytics, Hotjar, etc.) ni redes publicitarias. Si en el
        futuro lo hacemos, te avisaremos y te pediremos consentimiento
        explícito.
      </p>

      <h2>4. Cómo gestionarlas</h2>
      <p>
        Todos los navegadores te permiten ver, eliminar y bloquear cookies desde
        sus opciones. Tené en cuenta que si bloqueás las cookies necesarias, no
        podrás iniciar sesión en Countrify.
      </p>
      <ul>
        <li>
          <a
            href="https://support.google.com/chrome/answer/95647"
            target="_blank"
            rel="noreferrer noopener"
          >
            Cómo gestionar cookies en Chrome
          </a>
        </li>
        <li>
          <a
            href="https://support.mozilla.org/es/kb/proteccion-mejorada-contra-rastreo-firefox-escritorio"
            target="_blank"
            rel="noreferrer noopener"
          >
            Cómo gestionar cookies en Firefox
          </a>
        </li>
        <li>
          <a
            href="https://support.apple.com/es-ar/guide/safari/sfri11471/mac"
            target="_blank"
            rel="noreferrer noopener"
          >
            Cómo gestionar cookies en Safari
          </a>
        </li>
      </ul>

      <h2>5. Cambios</h2>
      <p>
        Si actualizamos esta política, lo reflejaremos en la fecha al inicio. Si
        agregamos cookies nuevas que no sean estrictamente necesarias, te
        avisaremos.
      </p>

      <h2>6. Contacto</h2>
      <p>
        Para consultas:{' '}
        <a href="mailto:digitalamenitiessas@gmail.com">digitalamenitiessas@gmail.com</a>.
      </p>
    </>
  )
}
