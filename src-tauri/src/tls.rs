use std::sync::{Arc, Mutex};

use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::crypto::{verify_tls12_signature, verify_tls13_signature, CryptoProvider};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{DigitallySignedStruct, Error as TlsError, SignatureScheme};
use sha2::{Digest, Sha256};

/// Certificate pinning, the way SSH pins host keys.
///
/// Proxmox and UniFi ship self-signed certificates that no public CA will ever
/// vouch for, so chain validation cannot be the control. Instead the leaf
/// certificate is fingerprinted on first contact, shown to the user, and from
/// then on every single request must present that same certificate. A changed
/// certificate fails the handshake rather than prompting — the same posture the
/// application takes on SSH host keys.
#[derive(Debug)]
pub struct PinnedVerifier {
    /// Lowercase hex SHA-256 of the leaf certificate, or None on first contact.
    pinned: Option<String>,
    /// Fingerprint actually presented, recorded for the trust-on-first-use flow.
    seen: Mutex<Option<String>>,
    provider: Arc<CryptoProvider>,
}

impl PinnedVerifier {
    pub fn new(pinned: Option<String>, provider: Arc<CryptoProvider>) -> Self {
        Self {
            pinned: pinned.map(|p| normalise(&p)),
            seen: Mutex::new(None),
            provider,
        }
    }

    pub fn seen_fingerprint(&self) -> Option<String> {
        self.seen.lock().ok().and_then(|g| g.clone())
    }
}

pub fn fingerprint(der: &CertificateDer<'_>) -> String {
    let digest = Sha256::digest(der.as_ref());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// Accepts `AA:BB:…` and `aabb…` alike.
fn normalise(fp: &str) -> String {
    fp.chars()
        .filter(|c| c.is_ascii_hexdigit())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

/// Groups a fingerprint into colon-separated byte pairs for display.
pub fn format_fingerprint(fp: &str) -> String {
    fp.as_bytes()
        .chunks(2)
        .map(|c| String::from_utf8_lossy(c).to_uppercase())
        .collect::<Vec<_>>()
        .join(":")
}

impl ServerCertVerifier for PinnedVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, TlsError> {
        let presented = fingerprint(end_entity);

        if let Ok(mut seen) = self.seen.lock() {
            *seen = Some(presented.clone());
        }

        match &self.pinned {
            // Trust on first use: the caller shows the fingerprint and asks.
            None => Ok(ServerCertVerified::assertion()),
            Some(expected) if *expected == presented => Ok(ServerCertVerified::assertion()),
            Some(expected) => Err(TlsError::General(format!(
                "a kiszolgáló tanúsítványa megváltozott — várt: {}, kapott: {}",
                format_fingerprint(expected),
                format_fingerprint(&presented)
            ))),
        }
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        verify_tls12_signature(message, cert, dss, &self.provider.signature_verification_algorithms)
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        verify_tls13_signature(message, cert, dss, &self.provider.signature_verification_algorithms)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.provider
            .signature_verification_algorithms
            .supported_schemes()
    }
}

/// Builds an HTTP client that will only talk to the pinned certificate.
///
/// Returns the client together with the verifier, so the caller can read back
/// the fingerprint that was actually presented during the handshake.
pub fn pinned_client(
    pinned: Option<String>,
    timeout_secs: u64,
) -> Result<(reqwest::Client, Arc<PinnedVerifier>), String> {
    let provider = rustls::crypto::ring::default_provider();
    let provider = Arc::new(provider);

    let verifier = Arc::new(PinnedVerifier::new(pinned, provider.clone()));

    let config = rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|e| e.to_string())?
        .dangerous()
        .with_custom_certificate_verifier(verifier.clone())
        .with_no_client_auth();

    let client = reqwest::Client::builder()
        .use_preconfigured_tls(config)
        .cookie_store(true)
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .user_agent("UltimateNetworkAssister/2.4 (read-only survey)")
        .build()
        .map_err(|e| e.to_string())?;

    Ok((client, verifier))
}
