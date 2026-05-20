import Foundation
import Observation

/// User-configurable settings backed by UserDefaults. Server URL is the
/// only piece a user *should* edit; deviceId is generated once per
/// install and persisted so re-pairing reuses the same identity.
@Observable
final class AppSettings {
    private let defaults = UserDefaults.standard

    private enum Keys {
        static let serverURL = "boop.serverURL"
        static let deviceId = "boop.deviceId"
        static let pendingDeepLink = "boop.pendingDeepLinkThreadId"
    }

    var serverURL: String {
        didSet { defaults.set(serverURL, forKey: Keys.serverURL) }
    }

    /// Stable per-install UUID. Generated lazily, never overwritten —
    /// re-pairing the same install reuses the same row in Convex.
    var deviceId: String {
        didSet { defaults.set(deviceId, forKey: Keys.deviceId) }
    }

    /// Set by the notification delegate when the user taps a push that
    /// carries `threadId`. `ThreadsStore` consumes + clears this after
    /// `loadThreads`, so taps survive cold-start.
    var pendingDeepLinkThreadId: String? {
        get { defaults.string(forKey: Keys.pendingDeepLink) }
        set {
            if let v = newValue { defaults.set(v, forKey: Keys.pendingDeepLink) }
            else { defaults.removeObject(forKey: Keys.pendingDeepLink) }
        }
    }

    init() {
        serverURL = defaults.string(forKey: Keys.serverURL) ?? "http://localhost:3456"
        if let existing = defaults.string(forKey: Keys.deviceId) {
            deviceId = existing
        } else {
            let fresh = UUID().uuidString.lowercased()
            deviceId = fresh
            defaults.set(fresh, forKey: Keys.deviceId)
        }
    }

    var serverBaseURL: URL? {
        URL(string: serverURL.trimmingCharacters(in: .whitespacesAndNewlines))
    }
}
