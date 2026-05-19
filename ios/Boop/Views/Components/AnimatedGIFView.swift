import SwiftUI
import UIKit
import ImageIO

/// Plays a bundled animated GIF inside SwiftUI. Decodes once with
/// `CGImageSource`, builds a `UIImage.animatedImage(with:duration:)`,
/// and renders through a `UIImageView`. Per-frame delays are summed
/// into the total duration; UIKit plays the frames at an averaged
/// frame rate, which is fine for short, mostly-uniform GIFs like our
/// 440×440 logo.
struct AnimatedGIFView: UIViewRepresentable {
    /// Bundle resource name, without `.gif`.
    let name: String

    func makeUIView(context: Context) -> UIImageView {
        let view = UIImageView()
        view.contentMode = .scaleAspectFit
        view.clipsToBounds = true
        view.image = AnimatedGIFCache.image(for: name)
        // High hugging + compression resistance so SwiftUI's surrounding
        // .frame() is what determines our size rather than the underlying
        // UIImage's (much larger) intrinsic content size.
        view.setContentHuggingPriority(.required, for: .horizontal)
        view.setContentHuggingPriority(.required, for: .vertical)
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        return view
    }

    func updateUIView(_ uiView: UIImageView, context: Context) {}

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UIImageView, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? 47, height: proposal.height ?? 47)
    }
}

private enum AnimatedGIFCache {
    private static var cache: [String: UIImage] = [:]
    private static let lock = NSLock()

    static func image(for name: String) -> UIImage? {
        lock.lock(); defer { lock.unlock() }
        if let cached = cache[name] { return cached }
        guard let url = Bundle.main.url(forResource: name, withExtension: "gif"),
              let source = CGImageSourceCreateWithURL(url as CFURL, nil)
        else { return nil }
        let count = CGImageSourceGetCount(source)
        var frames: [UIImage] = []
        var duration: TimeInterval = 0
        for i in 0..<count {
            guard let cg = CGImageSourceCreateImageAtIndex(source, i, nil) else { continue }
            frames.append(UIImage(cgImage: cg))
            duration += frameDelay(source: source, index: i)
        }
        guard !frames.isEmpty else { return nil }
        let animated = UIImage.animatedImage(with: frames, duration: duration > 0 ? duration : Double(frames.count) * 0.1)
        cache[name] = animated
        return animated
    }

    private static func frameDelay(source: CGImageSource, index: Int) -> TimeInterval {
        guard let props = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [String: Any],
              let gif = props[kCGImagePropertyGIFDictionary as String] as? [String: Any]
        else { return 0.1 }
        if let unclamped = gif[kCGImagePropertyGIFUnclampedDelayTime as String] as? TimeInterval, unclamped > 0 {
            return unclamped
        }
        if let clamped = gif[kCGImagePropertyGIFDelayTime as String] as? TimeInterval, clamped > 0 {
            return clamped
        }
        return 0.1
    }
}
