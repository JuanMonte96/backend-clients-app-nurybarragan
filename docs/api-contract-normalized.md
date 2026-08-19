# Contrato API Normalizado

Este documento normaliza el contrato entre frontend y backend para facilitar verificación, integración y futuras pruebas.

## Convenciones normalizadas

- Auth: todas las rutas protegidas usan `Authorization: Bearer <token>`.
- Respuesta exitosa: `status`, `message` y un payload principal consistente en `data` o en el nombre del recurso cuando el backend actual ya lo devuelve así.
- Respuesta de error: `status`, `message` y, si aplica, `errors`.
- IDs: se tratan como `string` UUID.
- Timezone: se espera un identificador IANA, por ejemplo `Europe/Paris`.

## Usuarios

| Módulo | Método HTTP | Endpoint | Parámetros de ruta | Query parameters | Body esperado | Respuesta exitosa | Respuesta de error | Autenticación requerida | Rol requerido |
|---|---|---|---|---|---|---|---|---|---|
| Usuarios | POST | /api/users/login | Ninguno | Ninguno | `{ email, password, timezone }` | `200 { status, message, token, user }` | `400` validación, `401` contraseña inválida, `403` cuenta bloqueada o suscripción expirada, `404` usuario no existe, `500` | No | Ninguno |
| Usuarios | GET | /api/users/allUsers | Ninguno | `page`, `limit` | Ninguno | `200 { total, page, pages, users }` | `401`, `403`, `500` | Sí | admin |
| Usuarios | GET | /api/users/profile/:id_user | `id_user` | Ninguno | Ninguno | `200 { status, message, user, subscriptionByUser? }` | `401`, `403`, `404`, `500` | Sí | owner, admin o teacher |
| Usuarios | PUT | /api/users/changePassword | Ninguno | Ninguno | `{ currentPassword, newPassword }` | `200 { status, message }` | `400` validación, `401` contraseña actual incorrecta, `404` usuario no existe, `500` | Sí | autenticado |
| Usuarios | PUT | /api/users/editProfile/:id_user | `id_user` | Ninguno | `{ name_user?, email_user?, phone? }` | `200 { status, message }` | `401`, `403`, `404`, `500` | Sí | owner o admin |
| Usuarios | PATCH | /api/users/blockUser/:id_user | `id_user` | Ninguno | Ninguno | `200 { status, message, name }` | `401`, `403`, `404`, `500` | Sí | owner o admin según lógica actual |
| Usuarios | POST | /api/users/register | Ninguno | Ninguno | `{ name, email, phone, role }` | `201 { status, message, user }` | `400` usuario existente o datos inválidos, `403`, `500` | Sí | admin |
| Usuarios | GET | /api/users/classRemaining | Ninguno | Ninguno | Ninguno | `200 { status, totalClassLimit, classesUsed, classesRemaining, activeSubscriptions }` | `401`, `403`, `404`, `500` | Sí | autenticado |
| Usuarios | PATCH | /api/users/upload-certificated | Ninguno | Ninguno | `multipart/form-data` con `certificate` | `200 { status, message, certificated }` | `400` archivo faltante o inválido, `401`, `500` | Sí | autenticado |

## Cursos

| Módulo | Método HTTP | Endpoint | Parámetros de ruta | Query parameters | Body esperado | Respuesta exitosa | Respuesta de error | Autenticación requerida | Rol requerido |
|---|---|---|---|---|---|---|---|---|---|
| Cursos | POST | /api/classes/create | Ninguno | Ninguno | `{ title, descriptionEnglish, descriptionSpanish, descriptionFrench, level, teacherId }` | `201 { status, message, class }` | `400` título duplicado o profesor inválido, `403` rol no permitido, `404` profesor no existe, `500` | Sí | teacher, admin |
| Cursos | GET | /api/classes/all | Ninguno | Ninguno | Ninguno | `200 { status, message, classes }` | `401`, `404` sin clases, `500` | Sí | autenticado |
| Cursos | PUT | /api/classes/update | Ninguno | Ninguno | `{ id, title, descriptionEnglish, descriptionSpanish, descriptionFrench, level, teacherId, isBlocked }` | `200 { status, message, class }` | `401`, `403`, `404`, `500` | Sí | teacher, admin |
| Cursos | DELETE | /api/classes/delete/:id | `id` | Ninguno | Ninguno | `200 { status, message }` | `401`, `403`, `404`, `500` | Sí | teacher, admin |
| Cursos | GET | /api/classes/available | Ninguno | Ninguno | Ninguno | `200 { status, totalAvailable, subscriptions }` | `401`, `500` | Sí | autenticado |

## Horarios

| Módulo | Método HTTP | Endpoint | Parámetros de ruta | Query parameters | Body esperado | Respuesta exitosa | Respuesta de error | Autenticación requerida | Rol requerido |
|---|---|---|---|---|---|---|---|---|---|
| Horarios | POST | /api/schedule/create-schedule-unic | Ninguno | Ninguno | `{ idClass, dateClass, startHour, endHour, timeZone }` | `201 { status, message, scheduleId, date_class, start_time, end_time, time_zone }` | `401`, `403`, `404` clase, `500` | Sí | teacher, admin |
| Horarios | GET | /api/schedule/scheduleBy/:id | `id` | Ninguno | Ninguno | `200 { status, message, schedule }` | `401`, `400`, `404`, `500` | Sí | autenticado |
| Horarios | GET | /api/schedule/schedulesByClass/:classId | `classId` | Ninguno | Ninguno | `200 { status, message, total, schedules }` | `401`, `400`, `404`, `204` sin horarios, `500` | Sí | autenticado |
| Horarios | POST | /api/schedule/class-schedule-template | Ninguno | Ninguno | `{ idClass, startDate, startHour, endHour, timeZone?, intervaleDays?, isEnable? }` | `201 { status, message, templateId, scheduleId, firstDate, startHour, endHour, timeZone }` | `401`, `403`, `404`, `409` plantilla duplicada, `500` | Sí | teacher, admin |
| Horarios | GET | /api/schedule/qr-schedule/:scheduleId | `scheduleId` | Ninguno | Ninguno | `200 { status, message, qrImage }` | `401`, `403`, `404`, `500` | Sí | admin, teacher |

## Inscripciones

| Módulo | Método HTTP | Endpoint | Parámetros de ruta | Query parameters | Body esperado | Respuesta exitosa | Respuesta de error | Autenticación requerida | Rol requerido |
|---|---|---|---|---|---|---|---|---|---|
| Inscripciones | POST | /api/enrollments/enroll | Ninguno | Ninguno | `{ scheduleId }` | `201 { status, message, newEnrollment }` | `400` ya inscrito o sin suscripción, `401`, `403` bloqueado o fuera de tiempo, `404` horario no existe, `500` | Sí | autenticado |
| Inscripciones | GET | /api/enrollments/enrollsById | Ninguno | Ninguno | Ninguno | `200 { status, message, enrollments }` | `204` sin inscripciones, `401`, `403`, `500` | Sí | autenticado |
| Inscripciones | DELETE | /api/enrollments/dropById/:id | `id` | Ninguno | Ninguno | `200 { status, message }` | `401`, `403`, `404`, `500` | Sí | admin |
| Inscripciones | PATCH | /api/enrollments/change-status/:id | `id` | Ninguno | `{ newStatus }` | `200 { status, message, enrollment }` | `400` estado faltante, `401`, `403`, `404` implícito, `500` | Sí | owner o admin |

## Pagos y suscripción

| Módulo | Método HTTP | Endpoint | Parámetros de ruta | Query parameters | Body esperado | Respuesta exitosa | Respuesta de error | Autenticación requerida | Rol requerido |
|---|---|---|---|---|---|---|---|---|---|
| Pagos | POST | /api/payments/start-payment | Ninguno | Ninguno | `{ stripe_price_id, name, email, id_package, telephone }` | `200 { status, url }` | `400` validación, `403` compra duplicada para paquetes no recurrentes, `404` paquete no existe, `500` | No | Ninguno |
| Webhook Stripe | POST | /api/webhooks/stripe-webhook | Ninguno | Ninguno | Raw JSON de Stripe + `stripe-signature` | `200 { received: true, user, payment, subscription }` o texto `Evento no manejado` | `400` firma inválida, `500` | No | Ninguno |

## Paquetes

| Módulo | Método HTTP | Endpoint | Parámetros de ruta | Query parameters | Body esperado | Respuesta exitosa | Respuesta de error | Autenticación requerida | Rol requerido |
|---|---|---|---|---|---|---|---|---|---|
| Paquetes | POST | /api/packages/create | Ninguno | Ninguno | `{ name, descriptionEnglish, descriptionSpanish, descriptionFrench, price, duration, class_limit, is_recurrent, category }` | `201 { status, message, package, stripeProduct }` | `401`, `403`, `500` | Sí | admin |
| Paquetes | GET | /api/packages/all | Ninguno | Ninguno | Ninguno | `200 { status, packages }` | `204` sin paquetes, `500` | No | Ninguno |
| Paquetes | PATCH | /api/packages/availability/:id | `id` | Ninguno | Ninguno | `200 { status, message, package }` | `401`, `403`, `404`, `500` | Sí | admin |

## Asistencia

| Módulo | Método HTTP | Endpoint | Parámetros de ruta | Query parameters | Body esperado | Respuesta exitosa | Respuesta de error | Autenticación requerida | Rol requerido |
|---|---|---|---|---|---|---|---|---|---|
| Asistencia | GET | /api/attendance/admin/roster/:scheduleId | `scheduleId` | `page`, `limit`, `enrollment_status`, `attendance_status`, `name`, `email` | Ninguno | `200 { status, message, page, limit, total, pages, summary, schedule, roster[] }` | `401`, `403`, `404`, `500` | Sí | admin, teacher |
| Asistencia | POST | /api/attendance/scan-qr/:scheduleId | `scheduleId` | Ninguno | `{ status? }` (default `attended`) | `201 { status, message, newAttendance }` | `400` fuera de ventana o duplicada, `401`, `403`, `404`, `409`, `500` | Sí | autenticado (el usuario marca su propia asistencia; identidad tomada de `req.user.id`) |
| Asistencia | POST | /api/attendance/manual-attendance | Ninguno | Ninguno | `{ enrollmentId, userId, status? }` | `201 { status, message, attendance }` | `400` duplicado, `401`, `403`, `404`, `409`, `500` | Sí | teacher, admin |
| Asistencia | GET | /api/attendance/attendance-records | Ninguno | Ninguno | Ninguno | `200 { status, message, attenadanceByUser }` | `401`, `403`, `404`, `500` | Sí | student |

Cada fila de `roster[]` contiene: `id_enrollment`, `id_user`, `user_name`, `user_email`, `enrollment_status`, `enrolled_at`, `attendance_status` (`pending|attended|no_show|excused`), `attendance_id`, `attendance_registered_at`, `registration_method` (`manual|qr|-`), `package_name`, `subscription_id`.

## Contacto

| Módulo | Método HTTP | Endpoint | Parámetros de ruta | Query parameters | Body esperado | Respuesta exitosa | Respuesta de error | Autenticación requerida | Rol requerido |
|---|---|---|---|---|---|---|---|---|---|
| Contacto | POST | /api/contactUs/contact | Ninguno | Ninguno | `{ name_client, email_client, telephone_client, subject, description }` | `201 { status, message, newContact }` | `400` campos faltantes o inválidos, `500` | No | Ninguno |

## Respuestas y esquemas normalizados recomendados

### Éxito

```json
{
  "status": "success",
  "message": "string",
  "data": {}
}
```

### Error

```json
{
  "status": "error",
  "message": "string",
  "errors": []
}
```

## Inconsistencias actuales detectadas

- Algunos endpoints usan `204` con cuerpo JSON, lo cual no es estándar.
- La escritura de `status` varía entre `success`, `Success`, `Created`, `created`, `error` y otras variantes.
- `attenadanceByUser` tiene un typo en la respuesta de asistencia.
- `blockUser` no tiene un guard explícito de `admin` en la ruta, aunque el flujo interno lo permite por condición.
- `changePassword` recibe `newPassword` en el body, pero el controlador final usa `password` ya validada por middleware.
- `scan-qr/:scheduleId` usa el body completo como `status`; conviene normalizarlo a `{ status }`.
- `create-schedule-unic` crea un horario sin `id_template`, aunque el modelo lo declara obligatorio.
- `classRemaining` depende de `req.user.id`, pero el controlador intenta leer también `req.params.id_user` que la ruta no expone.
- `telephone_user` está modelado como `NUMBER`, pero el frontend y los validadores trabajan como cadena.
- El contacto del frontend y backend coincide en la práctica, pero el nombre del service frontend está escrito como `contacService.js`.

## Correcciones aplicadas (iteración módulo de asistencias/inscripciones)

- **QR apuntaba al backend:** `scheduleController.buildQrAttendanceUrl` leía `FRONTEND_URL`/`APP_URL`, pero la variable real del `.env` es `URL_FRONTEND_BASE`. Se añadió esa variable con máxima prioridad, de modo que el QR ahora codifica `${URL_FRONTEND_BASE}/attendance/scan/:scheduleId` (ruta SPA de `QrAttendancePage`).
- **QR se auto-regenera:** `qrAttendaceShow` (`GET /api/schedule/qr-schedule/:scheduleId`) ahora regenera el QR desde la URL correcta en cada consulta, auto-corrigiendo QRs antiguos y horarios creados por plantilla que se guardaron sin `qr_code_url`.
- **Fecha de asistencia:** el modelo `Attendance` tenía `timestamps: false` sin declarar `created_at`/`updated_at`, por lo que el roster devolvía `attendance_registered_at: null`. Se habilitó `timestamps: true` mapeado a las columnas reales `created_at`/`updated_at`.
- **Enum de inscripción:** el modelo `ClassEnrollment.status` se alineó con la DB (`active | blocked | removed`).
- **`registration_method`** se infiere del estado de la inscripción (`removed` ⇒ `manual`, si hay asistencia con inscripción `active` ⇒ `qr`). Robusto para el flujo actual; para máxima trazabilidad futura convendría una columna `method` en `attendance` (requiere migración aditiva).
