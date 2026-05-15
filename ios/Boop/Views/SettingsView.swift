import SwiftUI

struct SettingsView: View {
    let onUnpair: () -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppSettings.self) private var settings
    @State private var draftURL: String = ""
    @State private var confirmUnpair = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("Server URL", text: $draftURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button("Save") {
                        settings.serverURL = draftURL.trimmingCharacters(in: .whitespacesAndNewlines)
                        dismiss()
                    }
                    .disabled(draftURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                Section("Device") {
                    HStack {
                        Text("Device ID")
                        Spacer()
                        Text(String(settings.deviceId.prefix(8)) + "…")
                            .font(.system(.body, design: .monospaced))
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    Button("Unpair this device", role: .destructive) {
                        confirmUnpair = true
                    }
                } footer: {
                    Text("Removes the local bearer token. You'll need to pair again to reconnect. The server-side device row stays until you revoke it from the dashboard.")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .onAppear { draftURL = settings.serverURL }
            .confirmationDialog(
                "Unpair this device?",
                isPresented: $confirmUnpair,
                titleVisibility: .visible,
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
