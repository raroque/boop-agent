import Foundation

/// A file attached to a message. Agent-generated PDFs / images land here
/// via the channel-side post-turn lookup (server/channels/index.ts). The
/// shape mirrors `attachmentElementValidator` on the Convex schema —
/// keep them in sync.
struct Attachment: Identifiable, Equatable, Decodable {
    enum Kind: String, Codable {
        case image, pdf, doc
    }

    let kind: Kind
    let mimeType: String
    let sizeBytes: Int
    let storageId: String
    let signedUrl: String?
    let filename: String?
    let description: String?

    /// Convex doesn't surface a stable per-attachment id; pair the storage
    /// id with the kind so SwiftUI's ForEach keeps rows stable.
    var id: String { "\(kind.rawValue):\(storageId)" }

    /// Best-effort short extension used as the colored glyph on FileCard.
    var displayKind: String {
        if let dotted = filename?.split(separator: ".").last, !dotted.isEmpty {
            return String(dotted).lowercased()
        }
        switch kind {
        case .image: return mimeType.split(separator: "/").last.map(String.init) ?? "img"
        case .pdf:   return "pdf"
        case .doc:   return "doc"
        }
    }

    var displayName: String {
        filename ?? "\(kind.rawValue).\(displayKind)"
    }
}

struct Message: Identifiable, Equatable {
    enum Role: String, Codable {
        case user
        case assistant
        case system
    }

    let id: String
    let threadId: String              // ← NEW
    let role: Role
    var content: String
    let createdAt: Date
    var isStreaming: Bool = false
    var attachments: [Attachment] = []
}

/// Decoded shape of `convex.query(api.messages.list, ...)` returned by
/// `GET /channels/ios/messages`. The server returns newest-first; the
/// client reverses for chronological display.
struct ServerMessage: Decodable {
    let _id: String
    let threadId: String?             // ← NEW (optional for back-compat)
    let role: String
    let content: String
    let _creationTime: Double
    let attachments: [Attachment]?

    func toMessage(defaultThreadId: String) -> Message {
        Message(
            id: _id,
            threadId: threadId ?? defaultThreadId,
            role: Message.Role(rawValue: role) ?? .system,
            content: content,
            createdAt: Date(timeIntervalSince1970: _creationTime / 1000.0),
            isStreaming: false,
            attachments: attachments ?? [],
        )
    }
}

struct MessagesResponse: Decodable {
    let threadId: String              // ← NEW (was conversationId)
    let messages: [ServerMessage]
}

/// One row from `GET /channels/ios/files` — a file attached to some message
/// somewhere in the device's thread set, plus the thread icon for the chip.
struct FileEntry: Identifiable, Decodable {
    let messageId: String
    let threadId: String
    let threadIcon: String?
    let role: String
    let createdAt: Double
    let attachment: Attachment

    var id: String { "\(messageId):\(attachment.id)" }
    var createdAtDate: Date { Date(timeIntervalSince1970: createdAt / 1000.0) }
}

struct FilesResponse: Decodable {
    let files: [FileEntry]
}

struct PairCreateResponse: Decodable {
    let deviceId: String
    let code: String
    let expiresAt: Double
}

struct PairCheckResponse: Decodable {
    let paired: Bool
    let bearerToken: String?
}

struct InboundResponse: Decodable {
    let ok: Bool
    let conversationId: String
}

struct ServerError: Decodable, Error {
    let error: String
}
