import SwiftUI

@main
struct BoopApp: App {
    @State private var settings = AppSettings()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(settings)
        }
    }
}
