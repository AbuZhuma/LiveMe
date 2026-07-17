use axum::{
    extract::{ConnectInfo, DefaultBodyLimit, Multipart, Path, State},
    http::{header, HeaderMap, StatusCode},
    response::sse::{Event, KeepAlive, Sse},
    response::{IntoResponse, Json},
    routing::{delete, get, post},
    Router,
};
use futures_util::StreamExt;
use rand::RngCore;
use rusqlite::Connection;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio_stream::wrappers::BroadcastStream;

const SESSION_TTL: Duration = Duration::from_secs(7 * 24 * 3600);
const ALLOWED_EMOJI: &[&str] = &["❤️", "🔥", "👏", "😂", "😮", "👍"];
const COOKIE: &str = "lm_session";

struct App {
    db: Mutex<Connection>,
    sessions: Mutex<HashMap<String, Instant>>,
    events: tokio::sync::broadcast::Sender<String>,
    is_live: AtomicBool,
    react_gate: Mutex<HashMap<IpAddr, (Instant, u32)>>,
    password: String,
    data_dir: std::path::PathBuf,
}

type S = State<Arc<App>>;

fn now_ts() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64
}

fn err(status: StatusCode, msg: &str) -> (StatusCode, Json<Value>) {
    (status, Json(json!({ "error": msg })))
}

fn new_token() -> String {
    let mut b = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn cookie_token(headers: &HeaderMap) -> Option<String> {
    let cookies = headers.get(header::COOKIE)?.to_str().ok()?;
    cookies.split(';').find_map(|c| {
        let (k, v) = c.trim().split_once('=')?;
        (k == COOKIE).then(|| v.to_string())
    })
}

fn is_admin(app: &App, headers: &HeaderMap) -> bool {
    let Some(tok) = cookie_token(headers) else { return false };
    let mut sessions = app.sessions.lock().unwrap();
    sessions.retain(|_, t| t.elapsed() < SESSION_TTL);
    if let Some(t) = sessions.get_mut(&tok) {
        *t = Instant::now();
        true
    } else {
        false
    }
}

fn token_valid(app: &App, tok: &str) -> bool {
    let mut sessions = app.sessions.lock().unwrap();
    sessions.retain(|_, t| t.elapsed() < SESSION_TTL);
    sessions.contains_key(tok)
}

#[derive(Deserialize)]
struct Login {
    password: String,
}

async fn login(State(app): S, Json(body): Json<Login>) -> axum::response::Response {
    tokio::time::sleep(Duration::from_millis(300)).await;
    if body.password != app.password {
        return err(StatusCode::UNAUTHORIZED, "wrong password").into_response();
    }
    let tok = new_token();
    app.sessions.lock().unwrap().insert(tok.clone(), Instant::now());
    (
        [(
            header::SET_COOKIE,
            format!("{COOKIE}={tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800"),
        )],
        Json(json!({ "ok": true, "token": tok })),
    )
        .into_response()
}

async fn logout(State(app): S, headers: HeaderMap) -> impl IntoResponse {
    if let Some(tok) = cookie_token(&headers) {
        app.sessions.lock().unwrap().remove(&tok);
    }
    (
        [(header::SET_COOKIE, format!("{COOKIE}=; Path=/; Max-Age=0"))],
        Json(json!({ "ok": true })),
    )
}

async fn me(State(app): S, headers: HeaderMap) -> Json<Value> {
    let admin = is_admin(&app, &headers);
    let token = if admin { cookie_token(&headers) } else { None };
    Json(json!({ "admin": admin, "token": token }))
}

async fn get_content(State(app): S) -> Json<Value> {
    let db = app.db.lock().unwrap();
    let (html, updated): (String, i64) = db
        .query_row(
            "SELECT value, updated_at FROM content WHERE id = 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap_or_default();
    Json(json!({ "html": html, "updated_at": updated }))
}

#[derive(Deserialize)]
struct PutContent {
    html: String,
}

async fn put_content(
    State(app): S,
    headers: HeaderMap,
    Json(body): Json<PutContent>,
) -> axum::response::Response {
    if !is_admin(&app, &headers) {
        return err(StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    if body.html.len() > 2_000_000 {
        return err(StatusCode::PAYLOAD_TOO_LARGE, "too large").into_response();
    }
    app.db
        .lock()
        .unwrap()
        .execute(
            "INSERT INTO content(id, value, updated_at) VALUES (1, ?1, ?2)
             ON CONFLICT(id) DO UPDATE SET value = ?1, updated_at = ?2",
            rusqlite::params![body.html, now_ts()],
        )
        .unwrap();
    let _ = app.events.send(json!({ "type": "content" }).to_string());
    Json(json!({ "ok": true })).into_response()
}

async fn stream_status(State(app): S) -> Json<Value> {
    Json(json!({ "is_live": app.is_live.load(Ordering::Relaxed) }))
}

async fn list_comments(State(app): S) -> Json<Value> {
    let db = app.db.lock().unwrap();
    let mut stmt = db
        .prepare("SELECT id, name, text, created_at FROM comments ORDER BY id DESC LIMIT 200")
        .unwrap();
    let rows: Vec<Value> = stmt
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?,
                "name": r.get::<_, String>(1)?,
                "text": r.get::<_, String>(2)?,
                "created_at": r.get::<_, i64>(3)?,
            }))
        })
        .unwrap()
        .filter_map(Result::ok)
        .collect();
    Json(json!(rows))
}

#[derive(Deserialize)]
struct NewComment {
    #[serde(default)]
    name: String,
    text: String,
}

async fn post_comment(State(app): S, Json(body): Json<NewComment>) -> axum::response::Response {
    let text = body.text.trim();
    if text.is_empty() || text.chars().count() > 500 {
        return err(StatusCode::BAD_REQUEST, "text: 1..500 chars").into_response();
    }
    let name: String = {
        let n: String = body.name.trim().chars().take(40).collect();
        if n.is_empty() { "Гость".into() } else { n }
    };
    let created = now_ts();
    let id: i64 = {
        let db = app.db.lock().unwrap();
        db.execute(
            "INSERT INTO comments(name, text, created_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![name, text, created],
        )
        .unwrap();
        db.last_insert_rowid()
    };
    let comment = json!({ "id": id, "name": name, "text": text, "created_at": created });
    let _ = app
        .events
        .send(json!({ "type": "comment", "comment": comment }).to_string());
    Json(comment).into_response()
}

async fn delete_comment(
    State(app): S,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> axum::response::Response {
    if !is_admin(&app, &headers) {
        return err(StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    app.db
        .lock()
        .unwrap()
        .execute("DELETE FROM comments WHERE id = ?1", [id])
        .unwrap();
    let _ = app
        .events
        .send(json!({ "type": "comment_deleted", "id": id }).to_string());
    Json(json!({ "ok": true })).into_response()
}

async fn get_reactions(State(app): S) -> Json<Value> {
    let db = app.db.lock().unwrap();
    let mut stmt = db.prepare("SELECT emoji, count FROM reactions").unwrap();
    let mut totals = serde_json::Map::new();
    for row in stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
        .unwrap()
        .filter_map(Result::ok)
    {
        totals.insert(row.0, json!(row.1));
    }
    Json(json!(totals))
}

#[derive(Deserialize)]
struct React {
    emoji: String,
}

fn client_ip(headers: &HeaderMap, addr: &SocketAddr) -> IpAddr {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or_else(|| addr.ip())
}

async fn post_react(
    State(app): S,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<React>,
) -> axum::response::Response {
    if !ALLOWED_EMOJI.contains(&body.emoji.as_str()) {
        return err(StatusCode::BAD_REQUEST, "unknown emoji").into_response();
    }
    {
        let mut gate = app.react_gate.lock().unwrap();
        gate.retain(|_, (t, _)| t.elapsed() < Duration::from_secs(5));
        let e = gate
            .entry(client_ip(&headers, &addr))
            .or_insert((Instant::now(), 0));
        if e.0.elapsed() >= Duration::from_secs(1) {
            *e = (Instant::now(), 0);
        }
        e.1 += 1;
        if e.1 > 8 {
            return err(StatusCode::TOO_MANY_REQUESTS, "slow down").into_response();
        }
    }
    app.db
        .lock()
        .unwrap()
        .execute(
            "INSERT INTO reactions(emoji, count) VALUES (?1, 1)
             ON CONFLICT(emoji) DO UPDATE SET count = count + 1",
            [&body.emoji],
        )
        .unwrap();
    let _ = app
        .events
        .send(json!({ "type": "react", "emoji": body.emoji }).to_string());
    Json(json!({ "ok": true })).into_response()
}

async fn events(State(app): S) -> impl IntoResponse {
    let rx = app.events.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|msg| async move {
        msg.ok()
            .map(|m| Ok::<Event, std::convert::Infallible>(Event::default().data(m)))
    });
    (
        [(header::CACHE_CONTROL, "no-cache, no-transform")],
        Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15))),
    )
}

async fn upload(
    State(app): S,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> axum::response::Response {
    if !is_admin(&app, &headers) {
        return err(StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() != Some("file") {
            continue;
        }
        let ext = match field.content_type() {
            Some("image/png") => "png",
            Some("image/jpeg") => "jpg",
            Some("image/webp") => "webp",
            Some("image/gif") => "gif",
            _ => return err(StatusCode::BAD_REQUEST, "only images").into_response(),
        };
        let Ok(bytes) = field.bytes().await else {
            return err(StatusCode::BAD_REQUEST, "read error").into_response();
        };
        let name = format!("{}.{ext}", &new_token()[..16]);
        let dir = app.data_dir.join("uploads");
        std::fs::create_dir_all(&dir).ok();
        if std::fs::write(dir.join(&name), &bytes).is_err() {
            return err(StatusCode::INTERNAL_SERVER_ERROR, "write error").into_response();
        }
        return Json(json!({ "url": format!("/uploads/{name}") })).into_response();
    }
    err(StatusCode::BAD_REQUEST, "no file field").into_response()
}

async fn mtx_auth(State(app): S, Json(body): Json<Value>) -> axum::response::Response {
    let action = body["action"].as_str().unwrap_or("");
    let path = body["path"].as_str().unwrap_or("");
    let query = body["query"].as_str().unwrap_or("");
    let allow = match action {
        "read" | "playback" => true,
        "publish" => {
            let token = query
                .split('&')
                .find_map(|p| p.split_once('=').filter(|(k, _)| *k == "token").map(|(_, v)| v))
                .unwrap_or("");
            path == "live/main" && token_valid(&app, token)
        }
        _ => false,
    };
    if allow {
        Json(json!({ "ok": true })).into_response()
    } else {
        err(StatusCode::UNAUTHORIZED, "unauthorized").into_response()
    }
}

async fn hook_ready(State(app): S) -> Json<Value> {
    app.is_live.store(true, Ordering::Relaxed);
    let _ = app
        .events
        .send(json!({ "type": "live", "is_live": true }).to_string());
    Json(json!({ "ok": true }))
}

async fn hook_notready(State(app): S) -> Json<Value> {
    app.is_live.store(false, Ordering::Relaxed);
    let _ = app
        .events
        .send(json!({ "type": "live", "is_live": false }).to_string());
    Json(json!({ "ok": true }))
}

fn init_db(db: &Connection) {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS content(
            id INTEGER PRIMARY KEY CHECK (id = 1),
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS comments(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            text TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS reactions(
            emoji TEXT PRIMARY KEY,
            count INTEGER NOT NULL DEFAULT 0
        );",
    )
    .unwrap();
    db.execute(
        "INSERT OR IGNORE INTO content(id, value, updated_at)
         VALUES (1, '<h2>Добро пожаловать!</h2><p>Этот текст редактируется в кабинете.</p>', ?1)",
        [now_ts()],
    )
    .unwrap();
}

#[tokio::main]
async fn main() {
    let data_dir = std::path::PathBuf::from(
        std::env::var("LIVEME_DATA").unwrap_or_else(|_| "data".into()),
    );
    std::fs::create_dir_all(data_dir.join("uploads")).unwrap();
    let db = Connection::open(data_dir.join("liveme.db")).unwrap();
    init_db(&db);

    let (tx, _) = tokio::sync::broadcast::channel(256);
    let app = Arc::new(App {
        db: Mutex::new(db),
        sessions: Mutex::new(HashMap::new()),
        events: tx,
        is_live: AtomicBool::new(false),
        react_gate: Mutex::new(HashMap::new()),
        password: std::env::var("ADMIN_PASSWORD").unwrap_or_else(|_| "abdi2008".into()),
        data_dir: data_dir.clone(),
    });

    let router = Router::new()
        .route("/api/login", post(login))
        .route("/api/logout", post(logout))
        .route("/api/me", get(me))
        .route("/api/content", get(get_content).put(put_content))
        .route("/api/stream", get(stream_status))
        .route("/api/comments", get(list_comments).post(post_comment))
        .route("/api/comments/{id}", delete(delete_comment))
        .route("/api/reactions", get(get_reactions))
        .route("/api/react", post(post_react))
        .route("/api/events", get(events))
        .route(
            "/api/upload",
            post(upload).layer(DefaultBodyLimit::max(10 * 1024 * 1024)),
        )
        .route("/internal/mtx-auth", post(mtx_auth))
        .route("/internal/hooks/ready", post(hook_ready))
        .route("/internal/hooks/notready", post(hook_notready))
        .nest_service(
            "/uploads",
            tower_http::services::ServeDir::new(data_dir.join("uploads")),
        )
        .with_state(app);

    let addr: SocketAddr = "127.0.0.1:8080".parse().unwrap();
    println!("liveme-backend on http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(
        listener,
        router.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .unwrap();
}
