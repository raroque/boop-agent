import SwiftUI

/// Lightweight markdown renderer purpose-built for chat bubbles + .md preview.
/// Supports:
///   • Inline: **bold**, _italic_, [link](href), `inline code`
///   • Block: H1/H2/H3, bullet lists, ordered lists, fenced code (```), blockquote, paragraphs
struct MarkdownView: View {
    let source: String
    var sheetMode: Bool = false   // true in the full file preview, false inside chat bubble

    var body: some View {
        VStack(alignment: .leading, spacing: sheetMode ? 8 : 6) {
            ForEach(Array(parsedBlocks.enumerated()), id: \.offset) { _, block in
                view(for: block)
            }
        }
    }

    @ViewBuilder
    private func view(for block: Block) -> some View {
        switch block {
        case .paragraph(let s):
            Text(inline(s))
                .font(sheetMode ? BoopFont.bodyMedium : BoopFont.bodyLarge)
                .foregroundStyle(BoopColor.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        case .heading(let level, let s):
            Text(inline(s))
                .font(headingFont(level: level))
                .foregroundStyle(BoopColor.textPrimary)
                .padding(.top, sheetMode ? 8 : 4)
        case .bullet(let items):
            VStack(alignment: .leading, spacing: sheetMode ? 3 : 2) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .top, spacing: 8) {
                        Text("•").foregroundStyle(BoopColor.textSecondary)
                        Text(inline(item))
                            .font(sheetMode ? BoopFont.bodyMedium : BoopFont.bodyLarge)
                            .foregroundStyle(BoopColor.textPrimary)
                    }
                }
            }
        case .ordered(let items):
            VStack(alignment: .leading, spacing: sheetMode ? 3 : 2) {
                ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                    HStack(alignment: .top, spacing: 8) {
                        Text("\(i + 1).")
                            .font(BoopFont.monoSmall)
                            .foregroundStyle(BoopColor.textSecondary)
                        Text(inline(item))
                            .font(sheetMode ? BoopFont.bodyMedium : BoopFont.bodyLarge)
                            .foregroundStyle(BoopColor.textPrimary)
                    }
                }
            }
        case .codeBlock(let s):
            Text(s)
                .font(BoopFont.monoBody)
                .foregroundStyle(BoopColor.codeFg)
                .padding(.horizontal, 12).padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(BoopColor.codeBg, in: RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(BoopColor.border, lineWidth: 1))
        case .quote(let s):
            HStack(alignment: .top, spacing: 0) {
                Rectangle().fill(BoopColor.accent).frame(width: 2)
                Text(inline(s))
                    .font(sheetMode ? BoopFont.bodyMedium : BoopFont.bodyLarge)
                    .italic()
                    .foregroundStyle(BoopColor.textSecondary)
                    .padding(.horizontal, 12).padding(.vertical, 2)
            }
        }
    }

    private func headingFont(level: Int) -> Font {
        switch level {
        case 1: return BoopFont.heroH1
        case 2: return BoopFont.heroH2
        default: return BoopFont.heroH3
        }
    }

    private func inline(_ s: String) -> AttributedString {
        do {
            var attr = try AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))
            for run in attr.runs where run.inlinePresentationIntent == .code {
                attr[run.range].foregroundColor = BoopColor.codeKeyword
                attr[run.range].backgroundColor = BoopColor.codeBg
                attr[run.range].font = BoopFont.monoBody
            }
            return attr
        } catch {
            return AttributedString(s)
        }
    }

    // MARK: - Parser

    private enum Block: Equatable {
        case paragraph(String)
        case heading(Int, String)
        case bullet([String])
        case ordered([String])
        case codeBlock(String)
        case quote(String)
    }

    private var parsedBlocks: [Block] {
        Self.parse(source)
    }

    /// One-pass line-based parser. Good enough for chat content; we don't
    /// support nested lists, tables, HTML, or footnotes (deferred).
    private static func parse(_ input: String) -> [Block] {
        let lines = input.components(separatedBy: "\n")
        var blocks: [Block] = []
        var i = 0
        while i < lines.count {
            let line = lines[i]
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            // Fenced code
            if trimmed.hasPrefix("```") {
                var content: [String] = []
                i += 1
                while i < lines.count, !lines[i].trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                    content.append(lines[i])
                    i += 1
                }
                blocks.append(.codeBlock(content.joined(separator: "\n")))
                if i < lines.count { i += 1 }
                continue
            }

            // Headings
            if trimmed.hasPrefix("### ")  { blocks.append(.heading(3, String(trimmed.dropFirst(4)))); i += 1; continue }
            if trimmed.hasPrefix("## ")   { blocks.append(.heading(2, String(trimmed.dropFirst(3)))); i += 1; continue }
            if trimmed.hasPrefix("# ")    { blocks.append(.heading(1, String(trimmed.dropFirst(2)))); i += 1; continue }

            // Blockquote
            if trimmed.hasPrefix("> ") {
                var quoted: [String] = []
                while i < lines.count, lines[i].trimmingCharacters(in: .whitespaces).hasPrefix("> ") {
                    quoted.append(String(lines[i].trimmingCharacters(in: .whitespaces).dropFirst(2)))
                    i += 1
                }
                blocks.append(.quote(quoted.joined(separator: " ")))
                continue
            }

            // Unordered list
            if trimmed.hasPrefix("- ") || trimmed.hasPrefix("* ") {
                var items: [String] = []
                while i < lines.count {
                    let t = lines[i].trimmingCharacters(in: .whitespaces)
                    if t.hasPrefix("- ") {
                        items.append(String(t.dropFirst(2)))
                        i += 1
                    } else if t.hasPrefix("* ") {
                        items.append(String(t.dropFirst(2)))
                        i += 1
                    } else {
                        break
                    }
                }
                blocks.append(.bullet(items))
                continue
            }

            // Ordered list ("1. foo")
            if trimmed.range(of: #"^\d+\.\s"#, options: .regularExpression) != nil {
                var items: [String] = []
                while i < lines.count {
                    let t = lines[i].trimmingCharacters(in: .whitespaces)
                    if let r = t.range(of: #"^\d+\.\s"#, options: .regularExpression) {
                        items.append(String(t[r.upperBound...]))
                        i += 1
                    } else { break }
                }
                blocks.append(.ordered(items))
                continue
            }

            // Blank line
            if trimmed.isEmpty { i += 1; continue }

            // Paragraph — gather adjacent non-blank lines into one
            var paraLines: [String] = []
            while i < lines.count {
                let t = lines[i].trimmingCharacters(in: .whitespaces)
                if t.isEmpty { break }
                if t.hasPrefix("```") { break }
                if t.hasPrefix("- ") || t.hasPrefix("* ") { break }
                if t.hasPrefix("> ") { break }
                if t.hasPrefix("# ") || t.hasPrefix("## ") || t.hasPrefix("### ") { break }
                if t.range(of: #"^\d+\.\s"#, options: .regularExpression) != nil { break }
                paraLines.append(lines[i])
                i += 1
            }
            if !paraLines.isEmpty {
                blocks.append(.paragraph(paraLines.joined(separator: " ")))
            }
        }
        return blocks
    }
}
