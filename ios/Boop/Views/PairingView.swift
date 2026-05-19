import SwiftUI

struct PairingView: View {
    @Binding var showMenu: Bool
    @Environment(PairingStore.self) private var pairing
    @Environment(AppSettings.self) private var settings

    var body: some View {
        ZStack {
            BoopColor.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                Spacer()
                VStack(spacing: 24) {
                    Image(systemName: "iphone.gen3.radiowaves.left.and.right")
                        .font(.system(size: 64, weight: .light))
                        .foregroundStyle(BoopColor.accent)
                    Text("Pair this iPhone")
                        .font(BoopFont.semibold(22))
                        .foregroundStyle(BoopColor.textPrimary)
                    Text("Tap **Start pairing**, then enter the 6-digit code in your Boop dashboard's Devices panel.")
                        .font(BoopFont.bodyLarge)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(BoopColor.textSecondary)
                        .padding(.horizontal, 32)

                    content
                        .frame(maxWidth: .infinity)
                }
                Spacer()
                Text("Server: \(settings.serverURL)")
                    .font(BoopFont.meta)
                    .foregroundStyle(BoopColor.textTertiary)
                    .padding(.bottom, 16)
            }
        }
    }

    private var header: some View {
        HStack {
            AnimatedGIFView(name: "boop")
                .frame(width: 47, height: 47)
                .accessibilityLabel("Boop")
                .accessibilityAddTraits(.isHeader)
            Spacer()
            Button(action: { showMenu = true }) {
                DotGrid().foregroundStyle(BoopColor.textPrimary).frame(width: 32, height: 32)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
    }

    @ViewBuilder
    private var content: some View {
        switch pairing.phase {
        case .idle, .error:
            VStack(spacing: 12) {
                if case .error(let message) = pairing.phase {
                    Text(message)
                        .font(BoopFont.bodyMedium)
                        .foregroundStyle(BoopColor.error)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                Button {
                    Task { await pairing.beginPairing() }
                } label: {
                    Text("Start pairing")
                        .font(BoopFont.semibold(16))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(BoopColor.accent, in: RoundedRectangle(cornerRadius: BoopRadius.card))
                }
                .padding(.horizontal, 32)
            }

        case .requesting:
            ProgressView("Asking the server for a code…")
                .foregroundStyle(BoopColor.textSecondary)
                .tint(BoopColor.accent)

        case .awaitingCode(let code, let expiresAt):
            VStack(spacing: 12) {
                Text(code)
                    .font(BoopFont.mono(56))
                    .tracking(8)
                    .foregroundStyle(BoopColor.textPrimary)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 18)
                    .background(
                        BoopColor.surfaceElev,
                        in: RoundedRectangle(cornerRadius: BoopRadius.card)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: BoopRadius.card)
                            .strokeBorder(BoopColor.borderStrong, lineWidth: 1)
                    )
                Text("Enter this in the Boop dashboard → Devices.")
                    .font(BoopFont.bodyMedium)
                    .foregroundStyle(BoopColor.textSecondary)
                ExpiryCountdown(expiresAt: expiresAt)
                Button("Start over", role: .destructive) {
                    pairing.cancel()
                }
                .font(BoopFont.medium(14))
                .foregroundStyle(BoopColor.error)
                .padding(.top, 8)
            }

        case .paired:
            EmptyView()
        }
    }
}

private struct ExpiryCountdown: View {
    let expiresAt: Date
    @State private var now = Date()
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        let remaining = max(0, Int(expiresAt.timeIntervalSince(now)))
        let m = remaining / 60
        let s = remaining % 60
        Text(remaining > 0 ? "Expires in \(m):\(String(format: "%02d", s))" : "Expired")
            .font(BoopFont.meta)
            .foregroundStyle(BoopColor.textTertiary)
            .onReceive(timer) { now = $0 }
    }
}
