import SwiftUI

/// Transient banner used for non-error messages (e.g. "Attachments
/// coming soon"). Parallel to BannerView in ChatView but rendered in
/// `$text-secondary` on `$surface-elev` rather than the error palette.
/// Auto-dismiss is handled by the caller (ChatStore.sendError is
/// reused as the source-of-truth; the toast caller clears it after
/// the delay).
struct ToastView: View {
    let text: String

    var body: some View {
        Text(text)
            .font(BoopFont.meta)
            .foregroundStyle(BoopColor.textSecondary)
            .padding(.horizontal, BoopSpacing.edge).padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(BoopColor.surfaceElev)
    }
}
