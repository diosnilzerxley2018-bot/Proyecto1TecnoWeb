# Laboratorio de máquinas virtuales — Tecnología Web

> Documento de traspaso. Describe el estado completo de las dos máquinas virtuales,
> la red que las une y todo lo configurado en cada una.
> **Última actualización:** 26 de agosto de 2026.

---

## 1. Resumen: qué hay y para qué sirve cada máquina

Hay **dos máquinas virtuales** en VirtualBox sobre un anfitrión Windows 11, más el propio Windows que actúa como tercer equipo (cliente de correo).

| Máquina | Papel | IP interna | Qué corre |
|---|---|---|---|
| **TecnoCorreo** | Servidor de **correo + DNS** | `192.168.56.10` | Postfix, Dovecot, BIND9 |
| **UbuntuTW** | Servidor **web** (proyectos PHP) | `192.168.56.11` | Apache, PHP, MySQL, Postfix satélite |
| **Windows (anfitrión)** | Cliente | `192.168.56.1` | Thunderbird, navegador, VirtualBox |

**La separación es deliberada:** una máquina hace de servidor de correo y de nombres; la otra aloja los proyectos web de la materia. Se comunican por una red privada de VirtualBox.

### Dominio

Todo el laboratorio usa el dominio **`tecnologia.web`** (inventado, solo existe dentro de esta red).

> Antes se llamaba `empresa.lan`. Se renombró el 26-ago-2026. Quedan respaldos con extensión `.dom.bak` y el archivo de zona antiguo `db.empresa.lan` en el servidor.

---

## 2. Red

### Topología

```
   Windows 11 (anfitrión)  192.168.56.1
            │
   ┌────────┴─────────────────────────────┐
   │   Red solo-anfitrión 192.168.56.0/24 │
   └────┬──────────────────────┬──────────┘
        │                      │
  TecnoCorreo             UbuntuTW
  192.168.56.10           192.168.56.11
  correo + DNS            web (Apache/PHP/MySQL)
        │                      │
     NAT (salida a internet, para apt)
```

### Adaptadores de cada VM

Ambas máquinas tienen **dos tarjetas de red**:

| Adaptador | Modo | Interfaz Linux | Para qué |
|---|---|---|---|
| 1 | NAT | `enp0s3` (10.0.2.15) | Salida a internet: `apt install` |
| 2 | Solo-anfitrión | `enp0s8` | Red privada entre las máquinas |

La red solo-anfitrión se llama `VirtualBox Host-Only Ethernet Adapter`, rango `192.168.56.0/24`, **con el servidor DHCP desactivado** (todas las IPs son fijas).

> **Importante:** con NAT solo, las VMs no se ven entre sí. El adaptador 2 es lo que permite la comunicación.

### Nombres de las conexiones de red

En **ambas** VMs las conexiones de NetworkManager se renombraron para que los comandos sean iguales y no lleven tildes (el teclado de las VMs está en inglés):

| Nombre | Interfaz | Uso |
|---|---|---|
| `red` | `enp0s8` | Red interna del laboratorio |
| `internet` | `enp0s3` | NAT |

### Reenvío de puertos (solo UbuntuTW)

| Nombre | Protocolo | Puerto anfitrión | Puerto invitado |
|---|---|---|---|
| SSH | TCP | 2222 | 22 |
| WEB | TCP | 8080 | 80 |

Desde Windows: `ssh -p 2222 <usuario-web>@localhost` y `http://localhost:8080/`.

`TecnoCorreo` **no tiene reenvío**: se accede por su IP directa `192.168.56.10`.

---

## 3. Credenciales

| Máquina | Usuario del sistema | Contraseña |
|---|---|---|
| TecnoCorreo | `<usuario-correo>` | `<contrasena-correo-vm>` |
| UbuntuTW | `<usuario-web>` | `<contrasena-web-vm>` |

**Cuentas de correo** (todas con contraseña `<contrasena-buzones>`):
`gerencia`, `ventas`, `soporte`, `contabilidad`

**MySQL** (en UbuntuTW): usuario `root`, **sin contraseña**, autenticación `mysql_native_password`. Se entra con `mysql -u root`, **sin `sudo`**.

> **Los valores reales no están en el repositorio.** Son credenciales de un
> laboratorio en red aislada, pero publicarlas no aporta nada y sí deja pistas
> sobre las claves que usa quien las escribió. Los marcadores `<...>` se
> sustituyen por los valores propios al montar las máquinas.

---

# MÁQUINA 1 — TecnoCorreo (correo + DNS)

**Ubuntu 22.04.5 LTS · hostname `mail` · 4096 MB RAM · 2 CPU · 128 MB vídeo · 15 GB disco**

## 4. Servidor de correo

### Componentes

| Programa | Papel | Protocolo | Puerto |
|---|---|---|---|
| **Postfix 3.6.4** | Recibe y envía mensajes (MTA) | SMTP | 25 |
| **Dovecot 2.3.16** | Permite leer los buzones | IMAP / POP3 | 143 / 110 |

Instalación original:

```bash
sudo apt install -y postfix dovecot-imapd dovecot-pop3d mailutils
```

### Configuración de Postfix

Los valores que se cambiaron respecto al original (`postconf -n`):

```
myhostname   = mail.tecnologia.web
mydomain     = tecnologia.web
myorigin     = $mydomain
mydestination = $myhostname, $mydomain, mail, localhost
inet_interfaces = all
mynetworks   = 127.0.0.0/8 192.168.56.0/24
home_mailbox = Maildir/
sender_canonical_maps = regexp:/etc/postfix/sender_canonical
```

Se aplican con `sudo postconf -e "clave = valor"` y luego `sudo systemctl restart postfix`.

**Qué significan los dos críticos:**

- **`mynetworks`** — quién puede enviar a través del servidor. Sin la red `192.168.56.0/24`, los clientes reciben *"Relay access denied"*. Es también lo que impide que sea un *open relay*.
- **`home_mailbox = Maildir/`** — guarda cada mensaje como un archivo en `/home/usuario/Maildir/`. Debe coincidir con lo que Dovecot espera leer.

Otros archivos:

- `/etc/mailname` → contiene `tecnologia.web`
- `/etc/postfix/sender_canonical` → reescribe remitentes `@mail` a `@tecnologia.web`:
  ```
  /^(.*)@mail$/    ${1}@tecnologia.web
  ```

### Configuración de Dovecot

```
mail_location = maildir:~/Maildir          # /etc/dovecot/conf.d/10-mail.conf
disable_plaintext_auth = no                # /etc/dovecot/conf.d/10-auth.conf
auth_mechanisms = plain login              # idem
ssl = no                                   # /etc/dovecot/conf.d/10-ssl.conf
```

> **Sin cifrado y con contraseñas en claro**: aceptable en una red virtual aislada, y simplifica la práctica. En producción haría falta TLS con certificados.

### Cuentas de correo

**Cada cuenta de correo es un usuario de Linux.** No hay base de datos de usuarios aparte.

```bash
sudo adduser gerencia          # crea la cuenta gerencia@tecnologia.web
```

La dirección se forma sola porque `myorigin` vale `tecnologia.web`. El buzón (`~/Maildir`) aparece con el primer mensaje recibido.

Cuentas existentes: `gerencia`, `ventas`, `soporte`, `contabilidad`.

### Listas de distribución

Definidas en `/etc/aliases`:

```
todos: gerencia, ventas, soporte
departamentos: gerencia, ventas
```

Tras editar ese archivo hay que ejecutar **`sudo newaliases`**, o Postfix seguirá usando la versión anterior. Comprobar con `postalias -q todos /etc/aliases`.

Enviar a toda la lista:

```bash
echo "Comunicado" | mail -s "Aviso general" todos@tecnologia.web
```

Un solo envío genera **tres entregas** en el log, una por miembro.

## 5. Servidor DNS (BIND9)

**BIND 9.18** está instalado en esta misma máquina y sirve la zona `tecnologia.web` a toda la red.

### Zonas declaradas — `/etc/bind/named.conf.local`

```
zone "tecnologia.web" {
    type master;
    file "/etc/bind/db.tecnologia.web";
};

zone "56.168.192.in-addr.arpa" {
    type master;
    file "/etc/bind/db.192.168.56";
};
```

### Zona directa — `/etc/bind/db.tecnologia.web`

```
$TTL    604800
@       IN      SOA     mail.tecnologia.web. admin.tecnologia.web. (
                    2026082510     ; Serial (subir al editar)
                         604800    ; Refresh
                          86400    ; Retry
                        2419200    ; Expire
                         604800 )  ; Negative Cache TTL
@       IN      NS      mail.tecnologia.web.
@       IN      MX      10      mail.tecnologia.web.
@       IN      A       192.168.56.10
mail    IN      A       192.168.56.10
cliente IN      A       192.168.56.11
smtp    IN      CNAME   mail
imap    IN      CNAME   mail
webmail IN      CNAME   cliente
```

### Zona inversa — `/etc/bind/db.192.168.56`

```
@       IN      NS      mail.tecnologia.web.
10      IN      PTR     mail.tecnologia.web.
11      IN      PTR     cliente.tecnologia.web.
```

### Opciones — `/etc/bind/named.conf.options`

```
listen-on-v6 { none; };
listen-on { any; };
allow-query { localhost; 192.168.56.0/24; };
recursion yes;
allow-recursion { localhost; 192.168.56.0/24; };
```

> **`listen-on { any; }` es deliberado.** Antes estaba fijado a `192.168.56.10`, y al cambiar la IP del servidor el DNS seguía activo pero solo respondía a sí mismo. Con `any` no depende de la dirección.

### Al editar una zona, siempre

1. **Subir el `Serial`** en uno (le indica a otros servidores que la zona cambió)
2. Validar: `sudo named-checkzone tecnologia.web /etc/bind/db.tecnologia.web`
3. Aplicar: `sudo rndc reload`

Si `named-checkzone` no dice `OK`, **no recargar**.

---

# MÁQUINA 2 — UbuntuTW (servidor web)

**Ubuntu 22.04.5 LTS · hostname `<usuario-web>-VirtualBox` · 4040 MB RAM · 2 CPU · 16 MB vídeo · 30 GB disco**

## 6. Pila web

| Componente | Versión |
|---|---|
| Apache | 2.4.52 |
| PHP | 8.1.2 (con `mysqli`, módulo `php8.1` en Apache) |
| MySQL | 8.0.46 |

Instalación original:

```bash
sudo apt install -y apache2 php libapache2-mod-php php-mysql mysql-server openssh-server
```

Ajuste de MySQL para que PHP pueda conectarse como `root` sin contraseña:

```sql
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '';
FLUSH PRIVILEGES;
```

> Tras esto, `sudo mysql` deja de funcionar. Se entra con `mysql -u root`, sin `sudo`.

## 7. Proyectos alojados

En `/var/www/html/`:

| Carpeta | Qué es | Base de datos | Tablas |
|---|---|---|---|
| `ejemplo3` | CRUD de personas | `ejemplo3` | `persona` |
| `ejemplo4` | Países y ciudades (combos enlazados) | `bd_pais` | `pais`, `ciudad` |
| `ejemplo5` | Categorías y productos | `ejemplo5` | `categoria`, `producto` |
| `maestro-detalle` | Registro de ventas con carrito | `bd_ventas` | `cliente`, `categoria`, `producto`, `venta`, `detalle_venta` |

Se acceden desde Windows en `http://localhost:8080/<carpeta>/<archivo>.php`.

**Los originales están en Windows**, en `C:\Users\flore\OneDrive\Escritorio\EJEMPLOS\`, y se suben con `scp`. Son **copias independientes**: editar en Windows no actualiza el servidor hasta volver a subirlas.

### Correcciones aplicadas a los ejemplos

Son de 2013-2020, escritos para PHP 5, y fallaban en PHP 8. Los patrones corregidos:

1. **Constructores estilo PHP 4** (`public function Conexion()`) → `__construct()`, y `parent::Conexion()` → `parent::__construct()`. Eliminados en PHP 8, hacían que la conexión quedara sin base de datos seleccionada y las consultas fallaran en silencio.
2. **Lecturas de `$_GET`/`$_POST` sin comprobar** → envueltas en `?? ''`. En PHP 8 pasaron de aviso silencioso a warning visible, que además rompe el HTML si ocurre dentro de un `value="..."`.
3. **Claves sin comillas** (`$_POST[grupo]`) → error fatal en PHP 8.
4. **Short open tags** (`<? echo`) → `<?php echo`.
5. **`header("Location: http://localhost/...")` absoluto** → ruta relativa (rompía al servir por el puerto 8080).
6. **Bugs de lógica**: un setter que asignaba a una propiedad inexistente, un UPDATE que omitía una columna, un `$clientes` sin definir que provocaba error fatal.

## 8. Formulario de contacto (correo desde la web)

`/var/www/html/maestro-detalle/contacto.php` — enlazado desde `frmVenta.php`.

Envía a **`gerencia@tecnologia.web`** con `From: web@tecnologia.web` y el correo del visitante en `Reply-To`.

> El remitente es del propio dominio a propósito: un servidor rechaza mensajes que dicen venir de un dominio ajeno. La dirección del visitante va en `Reply-To` para poder responderle.

### Postfix en modo satélite

La función `mail()` de PHP **no habla SMTP**: entrega el mensaje al programa de correo local. Por eso esta máquina tiene Postfix instalado, pero configurado para **no guardar nada y reenviar todo** al servidor de correo:

```
relayhost      = [mail.tecnologia.web]
myorigin       = tecnologia.web
inet_interfaces = loopback-only
mydestination  = cliente.tecnologia.web, $myhostname, localhost.localdomain, localhost
```

Se instaló eligiendo **"Satellite system"** en la pantalla de configuración de Postfix.

## 9. DNS en esta máquina

**UbuntuTW es cliente DNS, no servidor.** Consulta al BIND de TecnoCorreo:

```
ipv4.dns        = 192.168.56.10
ipv4.dns-search = tecnologia.web
```

Configurado con:

```bash
sudo nmcli con mod red ipv4.dns 192.168.56.10
sudo nmcli con mod red ipv4.dns-search tecnologia.web
sudo nmcli con up red
```

Además, **sus líneas de `/etc/hosts` están comentadas a propósito** (marcadas con `#RESPALDO`), para que la resolución ocurra de verdad por DNS y se pueda demostrar. El respaldo está en `/etc/hosts.bak`.

> Linux consulta primero `/etc/hosts` y después el DNS — el orden lo define `/etc/nsswitch.conf` (`hosts: files dns`). Por eso, mientras esas líneas estén activas, el DNS no se usa.

### Si se quisiera un DNS propio en esta máquina

No está montado. Haría falta instalar `bind9` aquí y crear una zona distinta (por ejemplo `proyectos.web`) para los nombres de las aplicaciones. **Antes de hacerlo**, conviene decidir cuál de los dos sería el DNS principal de la red, porque cada cliente apunta a uno solo (o a uno primario y otro secundario).

---

## 10. Resolución de nombres — resumen

| Máquina | Cómo resuelve | Motivo |
|---|---|---|
| **TecnoCorreo** | `/etc/hosts` activo | Red de seguridad: si BIND cae, el correo sigue funcionando |
| **UbuntuTW** | **DNS** (hosts comentado) | Para demostrar que el DNS funciona de verdad |
| **Windows** | IP directa en Thunderbird | Editar su `hosts` exige permisos de administrador |

Contenido de `/etc/hosts` en TecnoCorreo:

```
192.168.56.10   mail.tecnologia.web     mail
192.168.56.11   cliente.tecnologia.web  cliente
```

En Windows, el archivo equivalente sería `C:\Windows\System32\drivers\etc\hosts` (requiere abrir el Bloc de notas como administrador).

---

## 11. Clientes de correo (Thunderbird)

| Máquina | Cuenta |
|---|---|
| Windows (anfitrión) | `soporte@tecnologia.web` |
| UbuntuTW | `ventas@tecnologia.web` |

Configuración manual (la detección automática **falla siempre**, porque el dominio no existe en internet):

| Campo | Entrante | Saliente |
|---|---|---|
| Protocolo | IMAP | SMTP |
| Servidor | `mail.tecnologia.web` (o `192.168.56.10`) | igual |
| Puerto | 143 | 25 |
| Seguridad de la conexión | **Ninguna** | **Ninguna** |
| Autenticación | **Contraseña normal** | **Sin autenticación** |
| Usuario | solo el nombre (`ventas`) | — |

**Dos detalles que hacen fallar la configuración:**

- El saliente debe ir **"Sin autenticación"**: Postfix no tiene SASL configurado y acepta el envío porque la red está en `mynetworks`. Si se elige "Contraseña normal", falla.
- El usuario es `ventas`, **no** `ventas@tecnologia.web`: Dovecot autentica contra usuarios de Linux.
- El cliente de Windows usa la **IP directa** porque no se pudo editar su archivo `hosts`.

> Tras el cambio de dominio, las cuentas de Thunderbird hay que **crearlas de nuevo**: no permite editar la dirección de una cuenta existente. Los buzones conservan los mensajes, porque el usuario del sistema no cambió.

---

## 12. Comandos de operación habitual

### Encender y apagar

```powershell
# Desde PowerShell en Windows
cd "C:\Program Files\Oracle\VirtualBox"
.\VBoxManage.exe startvm TecnoCorreo --type headless
.\VBoxManage.exe startvm UbuntuTW --type gui
.\VBoxManage.exe list runningvms
```

### Acceso remoto

```bash
ssh <usuario-correo>@192.168.56.10        # TecnoCorreo (correo + DNS)
ssh -p 2222 <usuario-web>@localhost     # UbuntuTW (web)
```

### Comprobar que todo está arriba

```bash
# En TecnoCorreo
systemctl is-active postfix@-.service dovecot named ssh
sudo ss -lntp | grep -E ':25|:53|:143'

# En UbuntuTW
systemctl is-active apache2 mysql postfix ssh
```

> **Ojo con `systemctl is-active postfix`**: en Ubuntu esa unidad es un envoltorio que ejecuta `/bin/true` y puede decir `inactive` aunque el correo funcione. La unidad real es **`postfix@-.service`**. La prueba definitiva es que el puerto 25 responda.

### Diagnóstico

```bash
sudo tail -f /var/log/mail.log        # el correo, en vivo
mailq                                 # mensajes en cola
sudo postqueue -f                     # reintentar la cola
postconf -n                           # configuración de Postfix
sudo journalctl -u named -f           # consultas DNS en vivo
sudo tail -f /var/log/apache2/error.log   # errores PHP (en UbuntuTW)
```

### Pruebas de correo

```bash
# Enviar
echo "cuerpo" | mail -s "asunto" gerencia@tecnologia.web

# Ver que llegó
sudo ls -l /home/gerencia/Maildir/new/
sudo doveadm mailbox status -A messages INBOX

# Probar el login IMAP de una cuenta
sudo doveadm auth test ventas <contrasena-buzones>

# Hablar SMTP a mano
telnet localhost 25
```

### Pruebas de DNS

```bash
dig @192.168.56.10 mail.tecnologia.web       # nombre → IP
dig @192.168.56.10 MX tecnologia.web         # quién recibe el correo
dig @192.168.56.10 -x 192.168.56.10          # IP → nombre
sudo rndc status                             # estado de BIND
```

### Cambiar una IP

```bash
sudo nmcli con mod red ipv4.addresses 192.168.56.XX/24
sudo nmcli con up red
ip -4 -brief a show enp0s8
```

> **El `/24` no es opcional.** Sin él, la máscara queda en `255.255.255.255` y la máquina se queda aislada.
> Y no confundir **`ipv4.addresses`** (mi propia IP) con **`ipv4.dns`** (a qué servidor DNS pregunto).

---

## 13. Problemas conocidos y sus causas

| Síntoma | Causa | Solución |
|---|---|---|
| Las VMs no se hacen ping | Cable virtual desconectado del adaptador 2 | `VBoxManage controlvm <vm> setlinkstate2 on` |
| La máquina queda aislada tras cambiar la IP | Se escribió sin `/24` → máscara `/32` | Repetir con `/24` |
| `Relay access denied` al enviar | La red no está en `mynetworks` | Añadir `192.168.56.0/24` |
| El DNS responde solo a sí mismo | `listen-on` fijado a una IP que cambió | `listen-on { any; }` |
| Postfix no arranca al reiniciar | `postfix@-.service` quedó en `enabled-runtime` | `sudo systemctl enable postfix@-.service` |
| `mail()` de PHP devuelve `false` | No hay Postfix en el servidor web | Instalarlo en modo satélite |
| Thunderbird no envía | Saliente con autenticación activada | Ponerlo en "Sin autenticación" |
| La VM va lenta | Firefox abierto dentro de la VM, o una instantánea activa | Cerrar Firefox; eliminar la instantánea (fusiona el disco diferencial) |
| Alias de correo que no funciona | Se editó `/etc/aliases` sin `newaliases` | Ejecutar `sudo newaliases` |

### Optimizaciones ya aplicadas a TecnoCorreo

- RAM 3 GB → **4 GB**, vídeo 16 MB → **128 MB**
- `vm.swappiness` de 60 → **10** (usa menos el disco como memoria)
- Servicios desactivados por innecesarios: `cups`, `cups-browsed`, `bluetooth`, `ModemManager`, `avahi-daemon`
- Instantánea eliminada (el disco diferencial había crecido a 3,4 GB y ralentizaba el acceso)

---

## 14. Diferencias clave entre las dos máquinas

| | TecnoCorreo | UbuntuTW |
|---|---|---|
| **Función** | Correo y nombres | Aplicaciones web |
| **IP** | `192.168.56.10` | `192.168.56.11` |
| **Acceso SSH** | IP directa | Puerto 2222 reenviado |
| **Servicios propios** | Postfix (completo), Dovecot, BIND9 | Apache, PHP, MySQL |
| **Postfix** | Servidor completo: recibe y guarda | **Satélite**: solo reenvía |
| **DNS** | **Servidor** (BIND9) | **Cliente** (pregunta al .10) |
| **Resolución** | `/etc/hosts` | DNS |
| **Base de datos** | ninguna | MySQL con 4 bases |
| **Usuario** | `<usuario-correo>` | `<usuario-web>` |

**En una frase:** *TecnoCorreo sabe quién es quién (DNS) y guarda el correo; UbuntuTW sirve las páginas y le pide a TecnoCorreo que entregue los correos que generan.*

---

## 15. Estado verificado

Comprobado el 26 de agosto de 2026:

- Los tres servicios de TecnoCorreo activos; SMTP responde `220 mail.tecnologia.web ESMTP Postfix`
- DNS resolviendo: `A`, `MX`, `CNAME` e inversa correctos
- Envío por consola, entre clientes en ambos sentidos, y a la lista `todos@tecnologia.web` (tres entregas por envío)
- Formulario web enviando correctamente a `gerencia@tecnologia.web`, con el mensaje viajando **por SMTP entre las dos máquinas** (aparece como `ESMTPS` en el log)
- Las cuatro aplicaciones PHP respondiendo HTTP 200 sin avisos

**Pendiente:** recrear las cuentas de Thunderbird con el dominio `tecnologia.web` en los dos clientes.
