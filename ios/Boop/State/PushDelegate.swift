import SwiftUI
import UIKit
import UserNotifications

/// AppDelegate adaptor that owns the APNs lifecycle on the iOS side.
///
/// Responsibilities:
///   • Wires `UNUserNotificationCenter.delegate` so foreground banners
///     get suppressed (the SSE stream already shows the content) and
///     taps deep-link into the right thread.
///   • Receives `didRegisterForRemoteNotificationsWithDeviceToken` from
///     the OS and POSTs the hex token to `/channels/ios/apns/register`
///     when the user is already paired.
///   • Falls through to a no-op when the user denies notification
///     permission — the app keeps working exactly as before.
///
/// The bearer token + server URL are read indirectly via `AppSettings`
/// and the Keychain; the adaptor never holds them directly so a
/// pre-pair launch can still receive a device token (we just defer the
/// POST until a bearer exists).
final class PushDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    /// Most recent hex device token vended by the OS. Held in memory so
    /// `PairingStore` can call `registerWithServerIfNeeded` after pair
    /// completes — Apple sends `didRegisterFor…` once, early in launch,
    /// long before the user has typed their pairing code.
    static var latestDeviceToken: String?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil,
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data,
    ) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        Self.latestDeviceToken = hex
        // Best-effort: if we already have a bearer, fire-and-forget the
        // server-side registration. PushDelegate doesn't own AppSettings,
        // so it reaches into UserDefaults directly — the trade-off is
        // worth it to keep the delegate free of SwiftUI environment.
        Task { @MainActor in
            await Self.registerWithServerIfPaired(token: hex)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error,
    ) {
        // No-op: the simulator can't get tokens, and on real devices the
        // most common reason is missing entitlements. Logging keeps it
        // diagnosable without spamming the user.
        print("[apns] registration failed: \(error.localizedDescription)")
    }

    // MARK: - UNUserNotificationCenter

    /// Called while the app is foregrounded. Returning `[]` suppresses
    /// the banner because the SSE stream is already painting the same
    /// content into the chat. Backgrounded delivery goes through APNs
    /// without ever calling this method.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
    ) async -> UNNotificationPresentationOptions {
        return []
    }

    /// User tapped the banner from the lock screen or banner. Read the
    /// threadId from the payload and stash it as a deep-link hint;
    /// `ThreadsStore` consumes after `loadThreads()`.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
    ) async {
        let userInfo = response.notification.request.content.userInfo
        guard let threadId = userInfo["threadId"] as? String, !threadId.isEmpty else { return }
        UserDefaults.standard.set(threadId, forKey: "boop.pendingDeepLinkThreadId")
    }

    // MARK: - Helpers

    /// POSTs the latest device token to the server. Safe to call before
    /// pairing — if no bearer is in Keychain we just hold onto the token
    /// in `latestDeviceToken` and `PairingStore` calls back here once
    /// pairing succeeds.
    @MainActor
    static func registerWithServerIfPaired(token: String) async {
        guard let bearer = KeychainStore.loadBearer(), !bearer.isEmpty else { return }
        let urlString = UserDefaults.standard.string(forKey: "boop.serverURL") ?? "http://localhost:3456"
        guard let baseURL = URL(string: urlString.trimmingCharacters(in: .whitespacesAndNewlines)) else { return }

        let client = BoopClient(baseURL: baseURL, bearer: bearer)
        #if DEBUG
        let environment = "development"
        #else
        let environment = "production"
        #endif
        do {
            try await client.registerApns(deviceToken: token, environment: environment)
            print("[apns] registered with server (\(environment))")
        } catch {
            // Best-effort: we'll try again on the next launch.
            print("[apns] register failed: \(error.localizedDescription)")
        }
    }

    /// Requests notification permission and (on grant) registers for
    /// remote notifications. Idempotent — UNUserNotificationCenter
    /// returns the existing status if we've already asked.
    @MainActor
    static func requestAuthorizationIfNeeded() async {
        let center = UNUserNotificationCenter.current()
        let current = await center.notificationSettings()
        switch current.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            UIApplication.shared.registerForRemoteNotifications()
            return
        case .denied:
            return
        case .notDetermined:
            break
        @unknown default:
            return
        }
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if granted {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }
}
