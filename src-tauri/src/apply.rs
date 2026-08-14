use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::collect::{now_iso, Profile};

/*
 * The write path.
 *
 * Everything that changes a live system goes through this file, and it is
 * built to be boring and narrow:
 *
 * - The frontend never supplies a URL or an HTTP method. It names an object
 *   kind from a fixed list, and this module decides the endpoint.
 * - Only two kinds of write exist: create an object, or merge managed fields
 *   into one that already exists. There is no general-purpose request.
 * - Deletion happens only during rollback, and only for objects this run
 *   created in the first place.
 * - No shell execution, ever. Destructive storage work is a printed command
 *   the user runs, and that stays true.
 */

/// Object kinds this module knows how to write, and where they live.
///
/// A kind that is not in this table cannot be written at all — there is no
/// fallback branch.
fn endpoint_for(kind: &str) -> Result<&'static str, String> {
    match kind {
        "unifi.network" => Ok("rest/networkconf"),
        // Port profiles only. Assigning one to a physical port is a PUT on the
        // device object, and on the wrong port it severs the controller's own
        // uplink — so it is deliberately absent from this list.
        "unifi.portconf" => Ok("rest/portconf"),
        other => Err(format!(
            "a(z) „{other}” objektumtípus írása nincs engedélyezve"
        )),
    }
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WriteOp {
    pub id: String,
    pub kind: String,
    pub label: String,
    /// "create" or "update"; nothing else is accepted.
    pub verdict: String,
    /// Controller-side id, required for an update.
    pub existing_id: Option<String>,
    /// Fields the applier owns.
    pub desired: Map<String, Value>,
    /// Fields written only when the object is created.
    pub create_only: Map<String, Value>,
    pub managed_fields: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub operation_id: String,
    pub kind: String,
    pub label: String,
    pub verdict: String,
    /// "applied" | "skipped" | "failed" | "rolled-back"
    pub outcome: String,
    pub object_id: Option<String>,
    pub previous: Option<Value>,
    pub created: bool,
    pub error: Option<String>,
    pub at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ApplyRun {
    pub id: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub profile_id: String,
    pub dry_run_token: String,
    pub backup_path: Option<String>,
    pub entries: Vec<JournalEntry>,
    pub aborted_reason: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    pub path: String,
    pub bytes: u64,
    pub taken_at: String,
}

/* --------------------------------------------------------------- session */

/// An authenticated, CSRF-bearing session against one controller.
pub struct Session {
    client: reqwest::Client,
    base: String,
    site: String,
    csrf: Option<String>,
}

impl Session {
    pub async fn open(
        client: reqwest::Client,
        profile: &Profile,
        secret: &str,
    ) -> Result<Self, String> {
        let base = profile.base_url.trim_end_matches('/').to_string();
        let site = if profile.site.trim().is_empty() {
            "default".to_string()
        } else {
            profile.site.trim().to_string()
        };

        // An API key needs no login, but then there is no CSRF token either —
        // the key itself authorises the request.
        if profile.username.trim().is_empty() {
            return Ok(Self {
                client,
                base,
                site,
                csrf: None,
            });
        }

        let res = client
            .post(format!("{base}/api/auth/login"))
            .json(&json!({ "username": profile.username, "password": secret }))
            .send()
            .await
            .map_err(|e| format!("bejelentkezés: {e}"))?;

        if !res.status().is_success() {
            return Err(match res.status().as_u16() {
                400 | 401 => "a felhasználónév vagy a jelszó nem megfelelő".to_string(),
                429 => "túl sok próbálkozás, a vezérlő ideiglenesen tilt".to_string(),
                other => format!("bejelentkezés sikertelen ({other})"),
            });
        }

        // UniFi OS requires this header on every mutating request.
        let csrf = res
            .headers()
            .get("x-csrf-token")
            .or_else(|| res.headers().get("x-updated-csrf-token"))
            .and_then(|v| v.to_str().ok())
            .map(str::to_string);

        Ok(Self {
            client,
            base,
            site,
            csrf,
        })
    }

    fn api(&self, path: &str) -> String {
        format!("{}/proxy/network/api/s/{}/{}", self.base, self.site, path)
    }

    fn with_headers(&self, req: reqwest::RequestBuilder, secret: &str) -> reqwest::RequestBuilder {
        let mut req = req.header("Accept", "application/json");
        if let Some(token) = &self.csrf {
            req = req.header("X-CSRF-Token", token);
        }
        if self.csrf.is_none() {
            req = req.header("X-API-KEY", secret);
        }
        req
    }

    async fn get_list(&self, path: &str, secret: &str) -> Result<Vec<Value>, String> {
        let res = self
            .with_headers(self.client.get(self.api(path)), secret)
            .send()
            .await
            .map_err(|e| format!("{path}: {e}"))?;

        if !res.status().is_success() {
            return Err(format!("{path}: a vezérlő {} kóddal válaszolt", res.status()));
        }
        let body: Value = res.json().await.map_err(|e| format!("{path}: {e}"))?;
        Ok(body
            .get("data")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default())
    }

    async fn send_object(
        &self,
        path: &str,
        id: Option<&str>,
        body: &Value,
        secret: &str,
    ) -> Result<Value, String> {
        let url = match id {
            Some(existing) => self.api(&format!("{path}/{existing}")),
            None => self.api(path),
        };
        let req = match id {
            Some(_) => self.client.put(url),
            None => self.client.post(url),
        };

        let res = self
            .with_headers(req, secret)
            .json(body)
            .send()
            .await
            .map_err(|e| format!("írás: {e}"))?;

        let status = res.status();
        let payload: Value = res.json().await.unwrap_or(Value::Null);

        if !status.is_success() {
            let detail = payload
                .get("meta")
                .and_then(|m| m.get("msg"))
                .and_then(Value::as_str)
                .unwrap_or("ismeretlen hiba");
            return Err(match status.as_u16() {
                400 => format!("a vezérlő elutasította: {detail}"),
                401 | 403 => "nincs jogosultság az íráshoz".to_string(),
                other => format!("a vezérlő {other} kóddal válaszolt: {detail}"),
            });
        }

        Ok(payload
            .get("data")
            .and_then(Value::as_array)
            .and_then(|a| a.first().cloned())
            .unwrap_or(Value::Null))
    }

    /// Rollback only. Never called from the apply path.
    async fn delete_object(&self, path: &str, id: &str, secret: &str) -> Result<(), String> {
        let res = self
            .with_headers(self.client.delete(self.api(&format!("{path}/{id}"))), secret)
            .send()
            .await
            .map_err(|e| format!("törlés: {e}"))?;

        if !res.status().is_success() {
            return Err(format!(
                "a visszaállítás nem tudta törölni a létrehozott objektumot ({})",
                res.status()
            ));
        }
        Ok(())
    }
}

/* ---------------------------------------------------------------- backup */

/// Asks the controller for a site backup and writes it next to the database.
///
/// This is the one gate that cannot be waived: without a file on disk here,
/// `apply` refuses to start.
pub async fn take_backup(
    session: &Session,
    secret: &str,
    dir: &std::path::Path,
) -> Result<BackupResult, String> {
    let res = session
        .with_headers(session.client.post(session.api("cmd/backup")), secret)
        .json(&json!({ "cmd": "backup", "days": 0 }))
        .send()
        .await
        .map_err(|e| format!("mentés kérése: {e}"))?;

    if !res.status().is_success() {
        return Err(format!(
            "a vezérlő nem készített mentést ({}). Írás nem indulhat.",
            res.status()
        ));
    }

    let body: Value = res.json().await.map_err(|e| format!("mentés: {e}"))?;
    let rel = body
        .get("data")
        .and_then(Value::as_array)
        .and_then(|a| a.first())
        .and_then(|d| d.get("url"))
        .and_then(Value::as_str)
        .ok_or("a vezérlő nem adott vissza letöltési útvonalat")?;

    let download = format!("{}{}", session.base, rel);
    let file = session
        .with_headers(session.client.get(&download), secret)
        .send()
        .await
        .map_err(|e| format!("mentés letöltése: {e}"))?;

    if !file.status().is_success() {
        return Err(format!("a mentés letöltése sikertelen ({})", file.status()));
    }

    let bytes = file
        .bytes()
        .await
        .map_err(|e| format!("mentés olvasása: {e}"))?;

    if bytes.is_empty() {
        return Err("a letöltött mentés üres, ezért nem fogadható el".to_string());
    }

    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let stamp = now_iso().replace(':', "-");
    let path = dir.join(format!("unifi-{}-{stamp}.unf", session.site));
    std::fs::write(&path, &bytes).map_err(|e| format!("mentés írása: {e}"))?;

    Ok(BackupResult {
        path: path.to_string_lossy().to_string(),
        bytes: bytes.len() as u64,
        taken_at: now_iso(),
    })
}

/* ----------------------------------------------------------------- apply */

fn merge_managed(previous: &Value, op: &WriteOp) -> Value {
    // Start from what the controller has, so unmanaged settings survive.
    let mut object = previous.as_object().cloned().unwrap_or_default();
    for field in &op.managed_fields {
        if let Some(value) = op.desired.get(field) {
            object.insert(field.clone(), value.clone());
        }
    }
    Value::Object(object)
}

fn build_create(op: &WriteOp) -> Value {
    let mut object = Map::new();
    for (k, v) in &op.create_only {
        object.insert(k.clone(), v.clone());
    }
    for (k, v) in &op.desired {
        object.insert(k.clone(), v.clone());
    }
    Value::Object(object)
}

/// Confirms the managed fields actually took the values we asked for.
fn verify(applied: &Value, op: &WriteOp) -> Result<(), String> {
    for field in &op.managed_fields {
        let Some(want) = op.desired.get(field) else {
            continue;
        };
        let got = applied.get(field);
        let matches = match (want, got) {
            (Value::Number(a), Some(Value::Number(b))) => a.as_f64() == b.as_f64(),
            (a, Some(b)) => a == b,
            (_, None) => false,
        };
        if !matches {
            return Err(format!(
                "a(z) „{field}” mező nem a kért értéket vette fel (kért: {want}, kapott: {})",
                got.unwrap_or(&Value::Null)
            ));
        }
    }
    Ok(())
}

pub struct ApplyRequest<'a> {
    pub profile: &'a Profile,
    pub secret: &'a str,
    pub dry_run_token: &'a str,
    pub confirm_token: &'a str,
    pub backup_path: &'a str,
    pub operations: Vec<WriteOp>,
}

pub async fn apply(session: &Session, req: ApplyRequest<'_>) -> Result<ApplyRun, String> {
    // --- gates -------------------------------------------------------------
    if req.dry_run_token.is_empty() || req.dry_run_token != req.confirm_token {
        return Err(
            "a megerősítés nem ehhez a dry-runhoz tartozik. Futtasd újra, és nézd át a változásokat."
                .to_string(),
        );
    }
    let backup = std::path::Path::new(req.backup_path);
    if !backup.is_file() {
        return Err("nincs érvényes mentés a megadott útvonalon. Írás nem indulhat.".to_string());
    }
    if std::fs::metadata(backup).map(|m| m.len()).unwrap_or(0) == 0 {
        return Err("a mentés üres. Írás nem indulhat.".to_string());
    }
    if req.operations.is_empty() {
        return Err("nincs alkalmazandó művelet".to_string());
    }
    for op in &req.operations {
        endpoint_for(&op.kind)?;
        if op.verdict != "create" && op.verdict != "update" {
            return Err(format!(
                "a(z) „{}” művelet állapota nem írható: {}",
                op.label, op.verdict
            ));
        }
        if op.verdict == "update" && op.existing_id.is_none() {
            return Err(format!("„{}”: módosításhoz hiányzik az azonosító", op.label));
        }
    }

    let mut run = ApplyRun {
        id: format!("apply-{}", now_iso()),
        started_at: now_iso(),
        finished_at: None,
        profile_id: req.profile.id.clone(),
        dry_run_token: req.dry_run_token.to_string(),
        backup_path: Some(req.backup_path.to_string()),
        entries: Vec::new(),
        aborted_reason: None,
    };

    for op in &req.operations {
        let path = endpoint_for(&op.kind)?;

        // Read the object back before touching it, so rollback has something
        // exact to restore rather than a reconstruction.
        let previous = match &op.existing_id {
            Some(id) => session
                .get_list(path, req.secret)
                .await
                .ok()
                .and_then(|list| {
                    list.into_iter()
                        .find(|o| o.get("_id").and_then(Value::as_str) == Some(id.as_str()))
                }),
            None => None,
        };

        if op.verdict == "update" && previous.is_none() {
            run.entries.push(JournalEntry {
                operation_id: op.id.clone(),
                kind: op.kind.clone(),
                label: op.label.clone(),
                verdict: op.verdict.clone(),
                outcome: "failed".to_string(),
                object_id: op.existing_id.clone(),
                previous: None,
                created: false,
                error: Some(
                    "a módosítandó objektum eltűnt a dry-run óta. Futtasd újra a felmérést."
                        .to_string(),
                ),
                at: now_iso(),
            });
            run.aborted_reason = Some("az élő állapot eltért a dry-runtól".to_string());
            break;
        }

        let body = match &previous {
            Some(prev) => merge_managed(prev, op),
            None => build_create(op),
        };

        let result = session
            .send_object(path, op.existing_id.as_deref(), &body, req.secret)
            .await;

        let entry = match result {
            Ok(applied) => match verify(&applied, op) {
                Ok(()) => JournalEntry {
                    operation_id: op.id.clone(),
                    kind: op.kind.clone(),
                    label: op.label.clone(),
                    verdict: op.verdict.clone(),
                    outcome: "applied".to_string(),
                    object_id: applied
                        .get("_id")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                        .or_else(|| op.existing_id.clone()),
                    previous: previous.clone(),
                    created: op.verdict == "create",
                    error: None,
                    at: now_iso(),
                },
                Err(e) => JournalEntry {
                    operation_id: op.id.clone(),
                    kind: op.kind.clone(),
                    label: op.label.clone(),
                    verdict: op.verdict.clone(),
                    outcome: "failed".to_string(),
                    object_id: applied.get("_id").and_then(Value::as_str).map(str::to_string),
                    previous: previous.clone(),
                    created: op.verdict == "create",
                    error: Some(e),
                    at: now_iso(),
                },
            },
            Err(e) => JournalEntry {
                operation_id: op.id.clone(),
                kind: op.kind.clone(),
                label: op.label.clone(),
                verdict: op.verdict.clone(),
                outcome: "failed".to_string(),
                object_id: op.existing_id.clone(),
                previous: previous.clone(),
                created: false,
                error: Some(e),
                at: now_iso(),
            },
        };

        let failed = entry.outcome == "failed";
        run.entries.push(entry);

        // Stop at the first failure. Half a policy is worse than none, and the
        // journal so far is what rollback needs.
        if failed {
            run.aborted_reason = Some(
                "a futás az első hibánál megállt; a már alkalmazott lépések visszaállíthatók"
                    .to_string(),
            );
            break;
        }
    }

    run.finished_at = Some(now_iso());
    Ok(run)
}

/* -------------------------------------------------------------- rollback */

pub async fn rollback(session: &Session, secret: &str, run: &mut ApplyRun) -> Result<(), String> {
    // Reverse order: the last change is the first to undo.
    let indices: Vec<usize> = run
        .entries
        .iter()
        .enumerate()
        .filter(|(_, e)| e.outcome == "applied")
        .map(|(i, _)| i)
        .rev()
        .collect();

    for i in indices {
        let entry = run.entries[i].clone();
        let path = endpoint_for(&entry.kind)?;

        let outcome = if entry.created {
            match entry.object_id.as_deref() {
                Some(id) => session.delete_object(path, id, secret).await.map(|_| ()),
                None => Err("a létrehozott objektum azonosítója hiányzik".to_string()),
            }
        } else {
            match (&entry.previous, entry.object_id.as_deref()) {
                (Some(previous), Some(id)) => session
                    .send_object(path, Some(id), previous, secret)
                    .await
                    .map(|_| ()),
                _ => Err("nincs eltárolt korábbi állapot a visszaállításhoz".to_string()),
            }
        };

        match outcome {
            Ok(()) => {
                run.entries[i].outcome = "rolled-back".to_string();
                run.entries[i].at = now_iso();
            }
            Err(e) => {
                run.entries[i].error = Some(e.clone());
                return Err(format!(
                    "a visszaállítás megakadt a(z) „{}” lépésnél: {e}. A többi lépés érintetlen; a site backup visszatöltése a biztos út.",
                    entry.label
                ));
            }
        }
    }

    Ok(())
}
