import SwiftUI
import UIKit
import CoreGraphics

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
    case ellipsis
    case chevronUp = "chevron-up"
    case chevronDown = "chevron-down"
    case chevronLeft = "chevron-left"
    case messageSquare = "message-square"
    case download, share, check, circle
    case alertCircle = "alert-circle"
    case bot, user, image, filter

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

/// Renders a Lucide icon from its bundled PDF. Uses `CGPDFDocument` + a
/// cached `UIImage` so the work happens once per icon name. We bypass
/// `Assets.xcassets` for the Lucide set because actool refuses to thin
/// a 26.5-SDK asset catalog against a 26.4 simulator runtime. PDFs live
/// directly under `Boop/Resources/Lucide/<name>.pdf` and get bundled as
/// raw resources.
struct LucideIcon: View {
    let name: LucideName
    var size: CGFloat = 22

    var body: some View {
        if let image = LucideIconCache.image(for: name.rawValue) {
            Image(uiImage: image)
                .resizable()
                .renderingMode(.template)
                .scaledToFit()
                .frame(width: size, height: size)
        } else {
            // Missing asset — render an empty slot of the right size so
            // layout doesn't shift. Useful signal in dev too.
            Color.clear.frame(width: size, height: size)
                .accessibilityLabel("missing icon: \(name.rawValue)")
        }
    }
}

/// Process-wide cache of rasterized Lucide PDFs.
private enum LucideIconCache {
    private static var cache: [String: UIImage] = [:]
    private static let lock = NSLock()

    static func image(for name: String) -> UIImage? {
        lock.lock(); defer { lock.unlock() }
        if let cached = cache[name] { return cached }
        guard let url = Bundle.main.url(forResource: name, withExtension: "pdf"),
              let document = CGPDFDocument(url as CFURL),
              let page = document.page(at: 1)
        else { return nil }

        // PDFs from rsvg-convert are 24×24pt at PDF coordinates. Rasterize
        // at 3× for retina; the SwiftUI Image then scales DOWN to the
        // requested .frame size, which preserves sharpness across all the
        // sizes the design system uses (16, 18, 20, 22, 24, 26 pt).
        let pageRect = page.getBoxRect(.mediaBox)
        let scale: CGFloat = 3.0
        let renderSize = CGSize(width: pageRect.width * scale, height: pageRect.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: renderSize, format: format)
        let rendered = renderer.image { ctx in
            let cg = ctx.cgContext
            cg.translateBy(x: 0, y: renderSize.height)
            cg.scaleBy(x: scale, y: -scale)
            cg.drawPDFPage(page)
        }
        let templated = rendered.withRenderingMode(.alwaysTemplate)
        cache[name] = templated
        return templated
    }
}
