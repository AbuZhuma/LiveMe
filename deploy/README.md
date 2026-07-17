# Деплой LiveMe на abuzhuma.com

## Что нужно на сервере (один раз)

Ubuntu/Debian с настроенным DNS (A-запись abuzhuma.com уже указывает на сервер).

```bash
# базовые пакеты
sudo apt update
sudo apt install -y nginx certbot ffmpeg curl build-essential pkg-config libssl-dev

# node >= 20 (nodesource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
```

## Деплой

```bash
git clone <репозиторий> liveme && cd liveme   # или rsync каталога проекта
sudo ./deploy/deploy.sh
```

Скрипт сам: соберёт бэкенд и фронтенд, скачает MediaMTX (пин версии + SHA-256),
создаст пользователя `liveme`, сгенерирует пароль кабинета (выведет его и
сохранит в `/etc/liveme/env`), поставит systemd-юниты, настроит nginx и
выпустит TLS-сертификат.

Обновление после правок кода: `git pull && sudo ./deploy/deploy.sh` - тот же
скрипт, повторный запуск безопасен.

## Управление

```bash
systemctl status liveme-backend liveme-mediamtx liveme-frontend
journalctl -u liveme-backend -f        # логи бэкенда
sudo systemctl restart liveme-frontend # рестарт по отдельности
```

## Порты

| Порт      | Что                              | Наружу?              |
|-----------|----------------------------------|----------------------|
| 80, 443   | nginx (сайт, api, hls, whip)     | да                   |
| 8189/udp  | WebRTC-медиа (WHIP из кабинета)  | да                   |
| 3000/8080/8888/8889/8554 | next/бэкенд/hls/whip/rtsp | нет, только loopback |

WebRTC-кандидаты анонсируются с публичного адреса через
`MTX_WEBRTCADDITIONALHOSTS` (задан в юните mediamtx). Если сервер за NAT -
проверьте, что UDP 8189 проброшен.

## Секреты

`/etc/liveme/env`: `ADMIN_PASSWORD` (пароль кабинета) и `LIVEME_DATA`
(каталог с SQLite-базой и загрузками). База: `data/liveme.db` - её и
`data/uploads/` стоит бэкапить.
