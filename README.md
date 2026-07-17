# LiveMe

Личный телеканал: один прямой эфир (WebRTC → LL-HLS, задержка ~2-3с), чат, реакции и редактируемая страница под эфиром. Эфир ведётся из браузера в кабинете `/admin` (камера, экран или экран + камера).

Стек: Next.js + Rust (axum) + MediaMTX + SQLite.

## Запуск

```bash
./scripts/dev.sh
```

- главная: http://localhost:3000
- кабинет: http://localhost:3000/admin (пароль: `abdi2008`, меняется через env `ADMIN_PASSWORD`)

## Тесты

```bash
./scripts/e2e.sh
```

## Деплой

```bash
sudo ./deploy/deploy.sh
```

Подробности: [deploy/README.md](deploy/README.md)
