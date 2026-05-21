import SwiftUI
import PhotosUI
import UIKit
import UniformTypeIdentifiers

/// Presents the attach picker action sheet and the three native
/// pickers (Photos / Camera / Files) it routes to. Use as a view
/// modifier on the dock — the dock owns the `isPresented` Bool that
/// drives the confirmationDialog.
///
/// Each picker calls `onPicked(DraftAttachment)` when an item is
/// successfully picked. Cancellation is a no-op.
///
/// See spec §3.5.1.
struct AttachPicker: ViewModifier {
    @Binding var isPresented: Bool
    var onPicked: (DraftAttachment) -> Void

    @State private var showPhotos = false
    @State private var showCamera = false
    @State private var showFiles = false
    @State private var photoItems: [PhotosPickerItem] = []

    private var cameraAvailable: Bool {
        UIImagePickerController.isSourceTypeAvailable(.camera)
    }

    func body(content: Content) -> some View {
        content
            .confirmationDialog("Add to message", isPresented: $isPresented, titleVisibility: .visible) {
                Button("Photo Library") { showPhotos = true }
                Button("Take Photo") { showCamera = true }
                    .disabled(!cameraAvailable)
                Button("Choose File") { showFiles = true }
                Button("Cancel", role: .cancel) { }
            }
            .photosPicker(isPresented: $showPhotos, selection: $photoItems, maxSelectionCount: 1, matching: .images)
            .onChange(of: photoItems) { _, items in
                Task { await handlePhotosPick(items) }
            }
            .fullScreenCover(isPresented: $showCamera) {
                CameraPicker { url, filename, mime in
                    showCamera = false
                    let chip = DraftAttachment(
                        localURL: url,
                        filename: filename,
                        mimeType: mime,
                        sizeBytes: (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0,
                        kind: .image
                    )
                    onPicked(chip)
                } onCancel: { showCamera = false }
            }
            .fileImporter(isPresented: $showFiles, allowedContentTypes: [.item], allowsMultipleSelection: false) { result in
                if case let .success(urls) = result, let url = urls.first {
                    handleFilePick(url)
                }
            }
    }

    // MARK: - Photo Library

    @MainActor
    private func handlePhotosPick(_ items: [PhotosPickerItem]) async {
        defer { photoItems = [] }
        guard let item = items.first else { return }
        guard let data = try? await item.loadTransferable(type: Data.self) else { return }
        // Persist to a temp URL so the chip has a usable filename + URL.
        let tmpDir = FileManager.default.temporaryDirectory
        let filename = "image-\(Int(Date().timeIntervalSince1970)).jpg"
        let url = tmpDir.appendingPathComponent(filename)
        guard (try? data.write(to: url, options: .atomic)) != nil else { return }
        let chip = DraftAttachment(
            localURL: url,
            filename: filename,
            mimeType: "image/jpeg",
            sizeBytes: data.count,
            kind: .image
        )
        onPicked(chip)
    }

    // MARK: - File Importer

    private func handleFilePick(_ url: URL) {
        // Security-scoped resource: need to start/stop access for files
        // picked from the user's iCloud Drive / Files app. The picked
        // URL is only readable while scope is held, so copy the bytes
        // into our own temp directory before releasing — the chip's
        // localURL will be valid for the rest of the session even
        // after scope drops.
        let didStart = url.startAccessingSecurityScopedResource()
        defer { if didStart { url.stopAccessingSecurityScopedResource() } }

        guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path) else { return }
        let size = (attrs[.size] as? Int) ?? 0
        let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        let kind: DraftAttachment.Kind = mime.hasPrefix("image/") ? .image : .file

        // Copy into our own sandbox while scope is still held.
        let filename = url.lastPathComponent
        let tmpURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(Int(Date().timeIntervalSince1970))-\(filename)")
        do {
            try FileManager.default.copyItem(at: url, to: tmpURL)
        } catch {
            return
        }

        let chip = DraftAttachment(
            localURL: tmpURL,
            filename: filename,
            mimeType: mime,
            sizeBytes: size,
            kind: kind
        )
        onPicked(chip)
    }
}

/// UIKit-bridged camera picker for the "Take Photo" option. Saves to
/// a temp URL and reports filename + mimeType back.
private struct CameraPicker: UIViewControllerRepresentable {
    var onPicked: (URL, String, String) -> Void
    var onCancel: () -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let pc = UIImagePickerController()
        pc.sourceType = .camera
        pc.delegate = context.coordinator
        return pc
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            guard let image = info[.originalImage] as? UIImage,
                  let data = image.jpegData(compressionQuality: 0.9) else {
                parent.onCancel()
                return
            }
            let tmpDir = FileManager.default.temporaryDirectory
            let filename = "photo-\(Int(Date().timeIntervalSince1970)).jpg"
            let url = tmpDir.appendingPathComponent(filename)
            try? data.write(to: url, options: .atomic)
            parent.onPicked(url, filename, "image/jpeg")
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.onCancel()
        }
    }
}

extension View {
    /// Convenience modifier — applies AttachPicker.
    func attachPicker(isPresented: Binding<Bool>, onPicked: @escaping (DraftAttachment) -> Void) -> some View {
        modifier(AttachPicker(isPresented: isPresented, onPicked: onPicked))
    }
}
