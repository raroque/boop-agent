import Foundation
import Observation

/// Drives the pairing flow. Phase machine:
/// .idle -> .requesting -> .awaitingCode(code, expiresAt) -> .paired(bearer)
/// (any phase can fall back to .error(message))
@MainActor
@Observable
final class PairingStore {
    enum Phase: Equatable {
        case idle
        case requesting
        case awaitingCode(code: String, expiresAt: Date)
        case paired(bearer: String)
        case error(String)
    }

    private(set) var phase: Phase = .idle

    private let settings: AppSettings
    private var pollTask: Task<Void, Never>?

    init(settings: AppSettings) {
        self.settings = settings
        // Restore prior pairing if the bearer is in Keychain.
        if let bearer = KeychainStore.loadBearer(), !bearer.isEmpty {
            phase = .paired(bearer: bearer)
            return
        }
        #if DEBUG
        // Simulator-only shortcut: if a bearer is staged in UserDefaults
        // (boop.debug.bearer), promote it to Keychain and enter .paired.
        // Useful for `simctl` driven UI fine-tuning without driving the
        // actual pairing dance.
        if let staged = UserDefaults.standard.string(forKey: "boop.debug.bearer"),
           !staged.isEmpty {
            KeychainStore.saveBearer(staged)
            UserDefaults.standard.removeObject(forKey: "boop.debug.bearer")
            phase = .paired(bearer: staged)
        }
        #endif
    }

    /// Kick off a new pairing attempt: POST /pair/create, then begin
    /// polling /pair/check every 2s until paired or aborted.
    func beginPairing() async {
        pollTask?.cancel()
        guard let baseURL = settings.serverBaseURL else {
            phase = .error("Server URL is not a valid URL")
            return
        }
        phase = .requesting
        let client = BoopClient(baseURL: baseURL, bearer: nil)
        do {
            let response = try await client.pairCreate(deviceId: settings.deviceId)
            let expiresAt = Date(timeIntervalSince1970: response.expiresAt / 1000.0)
            phase = .awaitingCode(code: response.code, expiresAt: expiresAt)
            pollTask = Task { [weak self] in await self?.pollLoop(baseURL: baseURL) }
        } catch BoopClient.ClientError.http(409, _) {
            phase = .error("This device is already paired on the server. Revoke it from the dashboard's Devices panel, then try again.")
        } catch {
            phase = .error("Couldn't start pairing: \(error.localizedDescription)")
        }
    }

    func cancel() {
        pollTask?.cancel()
        pollTask = nil
        if case .paired = phase { return } // don't clobber a successful pair
        phase = .idle
    }

    func reset() {
        pollTask?.cancel()
        pollTask = nil
        KeychainStore.clear()
        phase = .idle
    }

    private func pollLoop(baseURL: URL) async {
        let client = BoopClient(baseURL: baseURL, bearer: nil)
        let deadline = Date().addingTimeInterval(10 * 60) // 10 min
        while !Task.isCancelled, Date() < deadline {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            if Task.isCancelled { return }
            do {
                let result = try await client.pairCheck(deviceId: settings.deviceId)
                if result.paired, let bearer = result.bearerToken, !bearer.isEmpty {
                    KeychainStore.saveBearer(bearer)
                    phase = .paired(bearer: bearer)
                    return
                }
            } catch {
                // Transient — keep polling until deadline.
            }
        }
        if !Task.isCancelled {
            phase = .error("Pairing code expired. Tap Start over to try again.")
        }
    }
}
