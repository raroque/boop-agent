import Foundation

/// On-disk shape for a single thread's messages. Decoupled from
/// `Message` and `Attachment` (UI models) so a rename in the UI
/// layer doesn't silently break old caches — the cache decodes into
/// these structs first, then converts to UI models.
struct CachedThread: Codable {
    let schemaVersion: Int
    let threadId: String
    let lastSyncedAt: Double      // ms since epoch
    let messages: [CachedMessage]
}

struct CachedMessage: Codable {
    let id: String
    let threadId: String
    let role: String              // "user" | "assistant" | "system"
    let content: String
    let createdAt: Double         // ms since epoch
    let attachments: [CachedAttachment]
}

struct CachedAttachment: Codable {
    let kind: String              // "image" | "pdf" | "doc"
    let mimeType: String
    let sizeBytes: Int
    let storageId: String
    let signedUrl: String?
    let filename: String?
    let description: String?
}

/// On-disk shape for the threads list (open + archived).
struct CachedThreadsList: Codable {
    let schemaVersion: Int
    let lastSyncedAt: Double
    let open: [CachedThreadRow]
    let archived: [CachedThreadRow]
    /// Last active thread id, so cold launch can pick it back up.
    let activeThreadId: String?
}

struct CachedThreadRow: Codable {
    let id: String                // matches ServerThread._id
    let deviceId: String
    let icon: String?
    let label: String?
    let archived: Bool
    let createdAt: Double
    let lastMessageAt: Double?
}

enum CacheSchema {
    /// Bump this when CachedThread / CachedThreadsList shape changes
    /// in a backwards-incompatible way. `MessageCache.read*` returns
    /// nil on mismatch and the server fetch refills.
    static let currentVersion: Int = 1
}
