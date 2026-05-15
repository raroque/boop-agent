import SwiftUI

/// Curated, type-safe list of Lucide icons we bundle. The agent's
/// set_thread_icon tool returns one of these names; we match against
/// .knownByName(_:) to validate.
enum LucideName: String, CaseIterable, Sendable {
    // structural
    case menu, x, send, plus, settings, folder, zap, archive, search
    case arrowUp = "arrow-up"
    case arrowLeft = "arrow-left"
    case paperclip
    case moreHorizontal = "more-horizontal"
    case chevronUp = "chevron-up"
    case chevronDown = "chevron-down"
    case download, share, check, circle
    case alertCircle = "alert-circle"

    // thread-topic
    case calendar, clock
    case alarmClock = "alarm-clock"
    case lightbulb, sparkles, palette, brush
    case telescope, microscope
    case mail
    case messageCircle = "message-circle"
    case code, terminal
    case gitBranch = "git-branch"
    case briefcase, building
    case fileText = "file-text"
    case shoppingCart = "shopping-cart"
    case dollarSign = "dollar-sign"
    case creditCard = "credit-card"
    case plane, map, compass
    case book
    case bookOpen = "book-open"
    case bookmark, music, headphones, heart, smile
    case partyPopper = "party-popper"
    case dumbbell, salad, car
    case trainFront = "train-front"
    case graduationCap = "graduation-cap"
    case phoneCall = "phone-call"
    case video, utensils, coffee
    case listTodo = "list-todo"
    case checkSquare = "check-square"
    case globe, languages, baby
    case pawPrint = "paw-print"

    static let fallback: LucideName = .sparkles

    /// Look up by the string the agent (or any caller) passed in.
    /// Returns fallback if unknown — never returns nil.
    static func knownByName(_ name: String) -> LucideName {
        LucideName.allCases.first { $0.rawValue == name } ?? .fallback
    }
}

/// SwiftUI view rendering a Lucide icon from our asset catalog.
/// Uses the asset-catalog template-rendering mode so we can tint with
/// `.foregroundStyle`.
struct LucideIcon: View {
    let name: LucideName
    var size: CGFloat = 22

    var body: some View {
        Image("Lucide/\(name.rawValue)")
            .resizable()
            .renderingMode(.template)
            .scaledToFit()
            .frame(width: size, height: size)
    }
}
