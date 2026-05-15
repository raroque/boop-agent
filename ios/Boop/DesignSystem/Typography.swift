import SwiftUI

enum BoopFont {
    static func regular(_ size: CGFloat) -> Font  { .custom("Inter-Regular",  size: size) }
    static func medium(_ size: CGFloat) -> Font   { .custom("Inter-Medium",   size: size) }
    static func semibold(_ size: CGFloat) -> Font { .custom("Inter-SemiBold", size: size) }
    static func mono(_ size: CGFloat) -> Font     { .custom("JetBrainsMono-Regular", size: size) }
    static func monoMedium(_ size: CGFloat) -> Font { .custom("JetBrainsMono-Medium", size: size) }

    // Named tokens (match design brief §3.1)
    static let heroH1     = semibold(22)
    static let heroH2     = semibold(16)
    static let heroH3     = semibold(14)
    static let bodyLarge  = regular(14.5)
    static let bodyMedium = regular(13.5)
    static let label      = medium(12.5)
    static let meta       = regular(11)
    static let metaCaps   = semibold(10.5)
    static let monoSmall  = mono(10.5)
    static let monoBody   = mono(12)
}
