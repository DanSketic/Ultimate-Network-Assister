use keyring::Entry;

/// Secrets live in the Windows Credential Manager, never in the application's
/// own database.
///
/// Nothing here ever returns a secret to the frontend: the value goes in from
/// the input the user typed, and comes back out only inside this process, on
/// its way to an Authorization header. The UI can ask *whether* a secret
/// exists, never what it is.
const SERVICE: &str = "UltimateNetworkAssister";

fn entry(profile_id: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, profile_id).map_err(|e| format!("hitelesítési tár nem elérhető: {e}"))
}

pub fn store(profile_id: &str, secret: &str) -> Result<(), String> {
    entry(profile_id)?
        .set_password(secret)
        .map_err(|e| format!("titok mentése sikertelen: {e}"))
}

pub fn read(profile_id: &str) -> Result<String, String> {
    entry(profile_id)?.get_password().map_err(|e| match e {
        keyring::Error::NoEntry => {
            "ehhez a profilhoz nincs mentett titok a Credential Managerben".to_string()
        }
        other => format!("titok olvasása sikertelen: {other}"),
    })
}

pub fn exists(profile_id: &str) -> bool {
    entry(profile_id)
        .and_then(|e| e.get_password().map_err(|err| err.to_string()))
        .is_ok()
}

pub fn delete(profile_id: &str) -> Result<(), String> {
    match entry(profile_id)?.delete_credential() {
        Ok(()) => Ok(()),
        // Removing a profile that never had a secret is not a failure.
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("titok törlése sikertelen: {e}")),
    }
}
