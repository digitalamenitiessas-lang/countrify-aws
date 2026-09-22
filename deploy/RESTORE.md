# Restaurar Countrify desde un backup

Probado de punta a punta el 2026-09-22. La base restaurada quedó idéntica a la
original: 50 tablas, 14 migraciones, 45 funciones, 31 capacidades.

Los backups están en `/var/backups/countrify/<fecha>-<hora>/`, uno por día, se
guardan 14. Cada uno tiene:

```
db.dump              la base (formato custom de pg_dump)
objetos/
  countrify-public/    logos, imágenes de promos y del marketplace
  countrify-private/   comprobantes de gastos y de pago
config.tar.gz        /etc/countrify, /etc/garage.toml, units y bloque de Caddy
MANIFIESTO.txt       qué había adentro: tablas, cantidad de objetos, commit
```

Empezá siempre leyendo el manifiesto. Si dice 0 objetos en un bucket que debería
tenerlos, ese backup está mal y hay que usar el anterior.

---

## El detalle que hace fallar el restore

El directorio de backups es **0700 root** a propósito: adentro hay comprobantes
del consorcio y las credenciales de la app.

Eso significa que **el usuario `postgres` no puede leer el archivo**. Un
`sudo -u postgres pg_restore -d base /var/backups/.../db.dump` falla con
`Permission denied`, y como pg_restore igual crea la base, parece que funcionó:
te quedás con una base vacía creyendo que restauraste.

La forma correcta es que **root lea el archivo** y se lo pase por la entrada
estándar:

```bash
cat /var/backups/countrify/<fecha>/db.dump | sudo -u postgres pg_restore -d <base> --no-owner --no-privileges
```

Ese `cat` no es adorno. Es la diferencia entre restaurar y creer que restauraste.

---

## Caso 1 — Se borró algo sin querer

Lo más común. Restaurar a una base aparte, mirar, y recuperar solo lo que falta.

```bash
sudo -u postgres createdb revision
cat /var/backups/countrify/<fecha>/db.dump | sudo -u postgres pg_restore -d revision --no-owner --no-privileges
sudo -u postgres psql -d revision -c "select count(*) from countrify.profiles;"
```

Copiás las filas que necesites de `revision` a `countrify` y después
`sudo -u postgres dropdb revision`. **No se pisa la base de producción.**

---

## Caso 2 — La base se corrompió o quedó inconsistente

Reemplazo completo. Corta el servicio.

```bash
systemctl stop countrify
sudo -u postgres dropdb countrify
sudo -u postgres createdb countrify
cat /var/backups/countrify/<fecha>/db.dump | sudo -u postgres pg_restore -d countrify --no-owner --no-privileges
```

`--no-owner` hace que todo quede de `postgres`, así que hay que devolver la
propiedad a `countrify_admin` o la próxima migración falla con
`permission denied` (ya pasó una vez):

```bash
sudo -u postgres psql -d countrify -c "alter schema countrify owner to countrify_admin; alter schema shared owner to countrify_admin;"
sudo -u postgres psql -q -d countrify -c "do \$\$ declare r record; begin
  for r in select schemaname, tablename from pg_tables where schemaname in ('countrify','shared') loop
    execute format('alter table %I.%I owner to countrify_admin', r.schemaname, r.tablename); end loop;
  for r in select n.nspname s, p.oid::regprocedure x from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname in ('countrify','shared') loop
    execute format('alter function %s owner to countrify_admin', r.x); end loop;
end \$\$;"
systemctl start countrify
curl -s -o /dev/null -w "%{http_code}\n" https://countrify.com.ar/login   # tiene que dar 200
```

---

## Caso 3 — Se perdieron archivos (comprobantes, logos)

Los objetos se devuelven a Garage con rclone, que ya está configurado:

```bash
rclone sync /var/backups/countrify/<fecha>/objetos/countrify-private garage:countrify-private
rclone sync /var/backups/countrify/<fecha>/objetos/countrify-public  garage:countrify-public
rclone ls garage:countrify-private | wc -l    # comparar con el MANIFIESTO
```

**Ojo con `sync`**: deja el destino igual al origen, así que borra lo que se
subió después del backup. Si solo querés reponer lo que falta sin tocar lo
nuevo, usá `copy` en vez de `sync`.

---

## Caso 4 — Se perdió el servidor entero

**Hoy este caso no está cubierto.** Los backups viven en el mismo disco del VPS:
si se pierde la máquina, se pierden con ella.

Cubren borrado accidental y corrupción, que son los casos frecuentes. No cubren
el incendio.

Para cubrirlo hace falta una copia fuera del servidor — a un bucket externo
(R2, Backblaze) o a otra máquina. Está pendiente y decidido a conciencia, no
olvidado.

Si algún día se hace: **el backup contiene secretos en texto plano** (password
de la base, clave de sesión, credenciales de Garage). Cifrarlo antes de sacarlo
del servidor.

---

## Reconstruir desde cero

Si hay que levantar todo en una máquina nueva, el orden es:

1. Postgres 17 y Garage instalados (ver `deploy/README.md`).
2. `config.tar.gz` desempaquetado en `/` — devuelve credenciales y units.
3. Roles y schema: `scripts/db/setup.sh countrify`.
4. La base del backup, con el `cat` de arriba, y la propiedad corregida.
5. Los objetos con rclone.
6. El bloque de Caddy y el DNS apuntando a la máquina nueva.

El repositorio se clona de GitHub; no hace falta que esté en el backup.
