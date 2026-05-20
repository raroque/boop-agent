import SwiftUI
import CoreText

@main
struct BoopApp: App {
    @State private var settings = AppSettings()
    @UIApplicationDelegateAdaptor(PushDelegate.self) private var pushDelegate
    @Environment(\.scenePhase) private var scenePhase

    init() {
        Self.registerBundledFonts()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(settings)
                .preferredColorScheme(.dark)        // M1 ships dark-only
                .onChange(of: scenePhase) { _, newPhase in
                    if newPhase == .background {
                        // Persist anything pending in MessageCache before
                        // iOS suspends the process. fire-and-forget — the
                        // scene-phase change may run synchronously w/ the
                        // suspension request, so we can't await here.
                        Task { await MessageCache.shared.flushAll() }
                    }
                }
        }
    }

    /// Registers the bundled .otf / .ttf font files so SwiftUI's
    /// `.custom(...)` can resolve them. Logs which files succeed / fail
    /// so font references can be debugged at runtime.
    private static func registerBundledFonts() {
        let names = [
            "Inter-Regular",
            "Inter-Medium",
            "Inter-SemiBold",
            "JetBrainsMono-Regular",
            "JetBrainsMono-Medium",
        ]
        for name in names {
            for ext in ["otf", "ttf"] {
                guard let url = Bundle.main.url(forResource: name, withExtension: ext) else { continue }
                var error: Unmanaged<CFError>?
                if CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) {
                    print("[fonts] registered \(name).\(ext)")
                } else {
                    print("[fonts] FAILED \(name).\(ext): \(error?.takeRetainedValue().localizedDescription ?? "?")")
                }
                break
            }
        }
    }
}
