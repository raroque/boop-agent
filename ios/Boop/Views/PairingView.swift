import SwiftUI

struct PairingView: View {
    @Binding var showSettings: Bool
    @Environment(PairingStore.self) private var pairing
    @Environment(AppSettings.self) private var settings

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()
                Image(systemName: "iphone.gen3.radiowaves.left.and.right")
                    .font(.system(size: 64, weight: .light))
                    .foregroundStyle(.tint)
                Text("Pair this iPhone")
                    .font(.title.weight(.semibold))
                Text("Tap **Start pairing**, then enter the 6-digit code in your Boop dashboard's Devices panel.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 32)

                content
                    .frame(maxWidth: .infinity)

                Spacer()

                Text("Server: \(settings.serverURL)")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .padding(.bottom, 8)
            }
            .padding()
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch pairing.phase {
        case .idle, .error:
            VStack(spacing: 12) {
                if case .error(let message) = pairing.phase {
                    Text(message)
                        .font(.subheadline)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                Button {
                    Task { await pairing.beginPairing() }
                } label: {
                    Text("Start pairing")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)
                .padding(.horizontal, 32)
            }

        case .requesting:
            ProgressView("Asking the server for a code…")

        case .awaitingCode(let code, let expiresAt):
            VStack(spacing: 12) {
                Text(code)
                    .font(.system(size: 56, weight: .bold, design: .monospaced))
                    .tracking(8)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 18)
                    .background(Color.gray.opacity(0.12), in: RoundedRectangle(cornerRadius: 16))
                Text("Enter this in the Boop dashboard → Devices.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                ExpiryCountdown(expiresAt: expiresAt)
                Button("Start over", role: .destructive) {
                    pairing.cancel()
                }
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
            .font(.footnote)
            .foregroundStyle(.tertiary)
            .onReceive(timer) { now = $0 }
    }
}
