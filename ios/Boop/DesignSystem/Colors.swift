import SwiftUI

enum BoopColor {
    // Surface scale (dark mode primary)
    static let bg            = Color(boopHex: "#08090a")
    static let surface       = Color(boopHex: "#0d0e10")
    static let surfaceElev   = Color(boopHex: "#131418")

    // Borders & dividers
    static let border        = Color(boopHex: "#1f2024")
    static let borderStrong  = Color(boopHex: "#2a2b2f")

    // Text
    static let textPrimary   = Color(boopHex: "#f7f8f8")
    static let textSecondary = Color(boopHex: "#8b909a")
    static let textTertiary  = Color(boopHex: "#62666d")

    // Brand
    static let accent        = Color(boopHex: "#ff5a1f")
    static let accentGlow    = Color(boopHex: "#ff5a1f").opacity(0.40)

    // Semantic
    static let success       = Color(boopHex: "#5dd5a0")
    static let error         = Color(boopHex: "#ff7882")

    // Bubble glass
    static let bubbleAgentBg     = Color.white.opacity(0.05)
    static let bubbleAgentBorder = Color.white.opacity(0.08)
    static let glassBg     = Color(boopHex: "#14161a").opacity(0.55)
    static let glassBorder = Color.white.opacity(0.10)

    // Code
    static let codeBg       = Color(boopHex: "#0c0d10")
    static let codeFg       = Color(boopHex: "#c8cad0")
    static let codeKeyword  = Color(boopHex: "#ff8358")
    static let codeString   = Color(boopHex: "#5dd5a0")
    static let codeFunction = Color(boopHex: "#7aa2ff")
    static let codeComment  = Color(boopHex: "#62666d")
}

/// Shared hex initializer used across the design system. Internal to
/// the module — `boopHex` label disambiguates from any user-defined
/// `init(hex:)` extension elsewhere in the app.
extension Color {
    init(boopHex hex: String) {
        let cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "#", with: "")
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)
        let r = Double((value & 0xFF0000) >> 16) / 255
        let g = Double((value & 0x00FF00) >> 8) / 255
        let b = Double(value & 0x0000FF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
