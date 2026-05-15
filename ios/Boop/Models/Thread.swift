import Foundation

struct BoopThread: Identifiable, Equatable {
    let id: String              // Convex doc id, used as threadId everywhere
    var icon: String?           // Lucide name; nil until the agent picks one
    var label: String?
    var lastMessageAt: Date?
    var unread: Bool = false    // local-only flag for UI

    /// Convenience that resolves the bundled Lucide icon name, falling
    /// back to .sparkles when the agent hasn't set one yet.
    var lucide: LucideName {
        guard let icon else { return .fallback }
        return LucideName.knownByName(icon)
    }
}

/// Wire shape returned by GET /channels/ios/threads.
struct ServerThread: Decodable {
    let _id: String
    let icon: String?
    let label: String?
    let lastMessageAt: Double?

    func toThread() -> BoopThread {
        BoopThread(
            id: _id,
            icon: icon,
            label: label,
            lastMessageAt: lastMessageAt.map { Date(timeIntervalSince1970: $0 / 1000) },
        )
    }
}

struct ThreadsResponse: Decodable {
    let threads: [ServerThread]
}

struct CreateThreadResponse: Decodable {
    let threadId: String
}
