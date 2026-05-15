import SwiftUI

enum ThreadTint: String, CaseIterable, Sendable {
    case amber, sky, emerald, violet, pink, citrine, mint, crimson

    var solid: Color {
        switch self {
        case .amber:   return Color(boopHex: "#ff6432")
        case .sky:     return Color(boopHex: "#7aa2ff")
        case .emerald: return Color(boopHex: "#5dd5a0")
        case .violet:  return Color(boopHex: "#b482f0")
        case .pink:    return Color(boopHex: "#f082b4")
        case .citrine: return Color(boopHex: "#f0c864")
        case .mint:    return Color(boopHex: "#64dcc8")
        case .crimson: return Color(boopHex: "#ff7882")
        }
    }
    var fill: Color   { solid.opacity(0.10) }
    var border: Color { solid.opacity(0.30) }
    var text: Color   { solid.opacity(0.85) }

    /// Deterministic mapping from threadId → tint. FNV-1a 64.
    static func forThreadId(_ id: String) -> ThreadTint {
        var hash: UInt64 = 14695981039346656037
        for b in id.utf8 {
            hash ^= UInt64(b)
            hash &*= 1099511628211
        }
        let idx = Int(hash % UInt64(ThreadTint.allCases.count))
        return ThreadTint.allCases[idx]
    }
}
