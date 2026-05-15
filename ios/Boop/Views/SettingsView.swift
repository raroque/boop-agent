import SwiftUI

struct SettingsView: View {
    let onUnpair: () -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppSettings.self) private var settings
    @State private var draftURL: String = ""
    @State private var confirmUnpair = false

    var body: some View {
        NavigationStack {
            ZStack {
                BoopColor.bg.ignoresSafeArea()
                Form {
                    Section("Server") {
                        TextField("Server URL", text: $draftURL)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .foregroundStyle(BoopColor.textPrimary)
                        Button("Save") {
                            settings.serverURL = draftURL.trimmingCharacters(in: .whitespacesAndNewlines)
                            dismiss()
                        }
                        .foregroundStyle(BoopColor.accent)
                        .disabled(draftURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }

                    Section("Device") {
                        HStack {
                            Text("Device ID")
                                .foregroundStyle(BoopColor.textPrimary)
                            Spacer()
                            Text(String(settings.deviceId.prefix(8)) + "…")
                                .font(BoopFont.monoBody)
                                .foregroundStyle(BoopColor.textSecondary)
                        }
                    }

                    Section {
                        Button("Unpair this device", role: .destructive) {
                            confirmUnpair = true
                        }
                        .foregroundStyle(BoopColor.error)
                    } footer: {
                        Text("Removes the local bearer token. You'll need to pair again to reconnect. The server-side device row stays until you revoke it from the dashboard.")
                            .font(BoopFont.meta)
                            .foregroundStyle(BoopColor.textTertiary)
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(BoopColor.accent)
                }
            }
            .onAppear { draftURL = settings.serverURL }
            .confirmationDialog(
                "Unpair this device?",
                isPresented: $confirmUnpair,
                titleVisibility: .visible
            ) {
                Button("Unpair", role: .destructive) {
                    onUnpair()
                    dismiss()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("You'll be returned to the pairing screen.")
            }
        }
    }
}
