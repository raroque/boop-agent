import SwiftUI

/// "Live Agents" sheet — mirrors the dashboard's view of every sub-agent
/// spawned for the active thread. One Agent Card per run, each with a
/// vertical tool timeline (rail + dot + step badge + args + duration).
///
/// Layout (top → bottom):
///   • Drag handle.
///   • Header row: `Live agents` title, `<N> running` status pill on
///     success-tint, close X circle.
///   • Divider.
///   • Vertical scroll of Agent Cards.
struct AgentView: View {
    /// If set, scrolls the list so this agent is in view on open.
    var focusAgentId: String? = nil

    @Environment(\.dismiss) private var dismiss
    @Environment(AgentsStore.self) private var agentsStore

    var body: some View {
        VStack(spacing: 0) {
            sheetHeader
            divider
            list
        }
        .background(BoopColor.surface.ignoresSafeArea())
        .task { await agentsStore.reload() }
    }

    // MARK: - header

    private var sheetHeader: some View {
        VStack(spacing: 0) {
            RoundedRectangle(cornerRadius: 2)
                .fill(BoopColor.borderStrong)
                .frame(width: 36, height: 4)
                .padding(.top, 9)
                .padding(.bottom, 9)

            HStack {
                Text("Live agents")
                    .font(BoopFont.semibold(14.5))
                    .foregroundStyle(BoopColor.textPrimary)
                Spacer()
                statusPill
                Button(action: { dismiss() }) {
                    LucideIcon(name: .x, size: 16)
                        .foregroundStyle(BoopColor.textSecondary)
                        .frame(width: 32, height: 32)
                        .background(BoopColor.surfaceElev, in: Circle())
                }
                .padding(.leading, 8)
            }
            .padding(.horizontal, 18)
            .frame(height: 44)
        }
    }

    @ViewBuilder
    private var statusPill: some View {
        let running = agentsStore.activeAgents.count
        let label = running == 1 ? "1 running" : "\(running) running"
        HStack(spacing: 6) {
            Circle().fill(running > 0 ? BoopColor.success : BoopColor.textTertiary)
                .frame(width: 7, height: 7)
                .modifier(PulseModifier(active: running > 0))
            Text(label)
                .font(BoopFont.mono(11))
                .foregroundStyle(running > 0 ? BoopColor.success : BoopColor.textTertiary)
        }
        .padding(.horizontal, 10)
        .frame(height: 24)
        .background(
            (running > 0 ? BoopColor.success : BoopColor.textTertiary).opacity(0.10),
            in: Capsule()
        )
    }

    private var divider: some View {
        Rectangle().fill(BoopColor.border).frame(height: 1)
    }

    // MARK: - list

    @ViewBuilder
    private var list: some View {
        if agentsStore.agents.isEmpty {
            emptyView
        } else {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(agentsStore.agents) { agent in
                            AgentCard(agent: agent)
                                .id(agent.agentId)
                        }
                    }
                    .padding(EdgeInsets(top: 16, leading: 18, bottom: 18, trailing: 18))
                }
                .onAppear {
                    if let id = focusAgentId {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
                            withAnimation { proxy.scrollTo(id, anchor: .top) }
                        }
                    }
                }
            }
        }
    }

    private var emptyView: some View {
        VStack(spacing: 8) {
            Spacer()
            LucideIcon(name: .zap, size: 40)
                .foregroundStyle(BoopColor.textTertiary)
            Text("No agents yet")
                .font(BoopFont.semibold(16))
                .foregroundStyle(BoopColor.textPrimary)
            Text("When Boop deploys an agent for a task, it'll show up here with a live tool timeline.")
                .font(BoopFont.bodyMedium)
                .foregroundStyle(BoopColor.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - AgentCard

private struct AgentCard: View {
    let agent: AgentRun

    @Environment(AgentsStore.self) private var agentsStore
    @Environment(ThreadsStore.self) private var threadsStore

    /// Resolved origin thread (looked up from the agent's conversationId
    /// suffix). `nil` if the conversation isn't an iOS thread or the
    /// thread has since been archived.
    private var originThread: BoopThread? {
        guard let conversationId = agent.conversationId,
              let threadId = Self.threadId(fromConversationId: conversationId)
        else { return nil }
        return threadsStore.threads.first { $0.id == threadId }
    }

    /// Shared tint for both discs — keyed on the thread so an agent looks
    /// the same colour family as its dock chip. Falls back to the agent
    /// id if we can't resolve a thread (e.g. archived or non-iOS).
    private var tint: ThreadTint {
        if let originThread {
            return ThreadTint.forThreadId(originThread.id)
        }
        return ThreadTint.forThreadId(agent.agentId)
    }

    private var logs: [AgentLog] { agentsStore.logsByAgent[agent.agentId] ?? [] }
    private var isLoadingLogs: Bool {
        agentsStore.loadingLogsFor.contains(agent.agentId) && logs.isEmpty
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            timeline
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BoopColor.surfaceElev, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(BoopColor.border, lineWidth: 1))
        .task(id: agent.agentId) { await agentsStore.loadLogs(for: agent.agentId) }
    }

    private var header: some View {
        HStack(spacing: 10) {
            iconDisc
            VStack(alignment: .leading, spacing: 2) {
                Text(agent.name)
                    .font(BoopFont.semibold(13.5))
                    .foregroundStyle(BoopColor.textPrimary)
                Text(metaLine)
                    .font(BoopFont.mono(10.5))
                    .foregroundStyle(BoopColor.textTertiary)
            }
            Spacer(minLength: 0)
            originDisc
        }
        .padding(EdgeInsets(top: 12, leading: 14, bottom: 10, trailing: 14))
    }

    private var iconDisc: some View {
        ZStack {
            Circle().fill(tint.fill)
            Circle().strokeBorder(tint.border, lineWidth: 1)
            LucideIcon(name: agent.lucideIcon, size: 14)
                .foregroundStyle(tint.solid)
        }
        .frame(width: 28, height: 28)
    }

    /// Origin disc — shows the THREAD's lucide icon (matches the dock
    /// chip) so the user knows where the agent was spawned from.
    private var originDisc: some View {
        let threadIcon = originThread?.lucide ?? agent.lucideIcon
        return ZStack {
            Circle().fill(tint.fill)
            LucideIcon(name: threadIcon, size: 13)
                .foregroundStyle(tint.solid)
        }
        .frame(width: 28, height: 28)
    }

    private var metaLine: String {
        "\(agent.shortTag) · \(elapsedString)"
    }

    private var elapsedString: String {
        let end = agent.completedAtDate ?? Date()
        let seconds = max(0, end.timeIntervalSince(agent.startedAtDate))
        if seconds < 60 { return "\(Int(seconds))s" }
        if seconds < 3600 {
            let m = Int(seconds / 60)
            let s = Int(seconds.truncatingRemainder(dividingBy: 60))
            return s == 0 ? "\(m)m" : "\(m)m \(s)s"
        }
        return "\(Int(seconds / 3600))h"
    }

    // MARK: - timeline

    @ViewBuilder
    private var timeline: some View {
        if isLoadingLogs {
            HStack(spacing: 8) {
                ProgressView().tint(BoopColor.textTertiary).controlSize(.small)
                Text("Loading steps…")
                    .font(BoopFont.regular(11))
                    .foregroundStyle(BoopColor.textTertiary)
            }
            .padding(EdgeInsets(top: 0, leading: 14, bottom: 14, trailing: 14))
        } else if timelineSteps.isEmpty {
            HStack {
                Text(agent.status.isActive ? "Warming up…" : "No steps recorded.")
                    .font(BoopFont.regular(11))
                    .foregroundStyle(BoopColor.textTertiary)
            }
            .padding(EdgeInsets(top: 0, leading: 14, bottom: 14, trailing: 14))
        } else {
            VStack(spacing: 0) {
                ForEach(Array(timelineSteps.enumerated()), id: \.element.id) { idx, step in
                    AgentTimelineStep(
                        step: step,
                        isLast: idx == timelineSteps.count - 1,
                    )
                }
            }
            .padding(EdgeInsets(top: 0, leading: 14, bottom: 14, trailing: 14))
        }
    }

    /// All steps worth rendering on the rail. We surface every tool_use
    /// (badge style) and also fold in long text/thinking blocks as
    /// inline notes — that way runs that didn't hit MCP still show
    /// *something* (e.g. Skill-only agents). tool_result and error are
    /// merged into the preceding tool_use.
    private var timelineSteps: [TimelineStep] {
        var steps: [TimelineStep] = []
        var pendingStartByStepId: [String: Date] = [:]
        var seq = 0

        func appendNote(_ id: String, content: String, at date: Date) {
            steps.append(TimelineStep(
                id: id,
                seq: seq,
                kind: .note,
                toolName: nil,
                bodyText: trimmedNote(content),
                duration: nil,
                isRunning: false,
                isError: false,
            ))
            seq += 1
        }

        for log in logs {
            switch log.logType {
            case .tool_use:
                let isLast = (log.id == lastToolUseId)
                steps.append(TimelineStep(
                    id: log.id,
                    seq: seq,
                    kind: .toolCall,
                    toolName: log.prettyToolName ?? "tool",
                    bodyText: argsPreview(from: log.content),
                    duration: nil,
                    isRunning: isLast && agent.status.isActive,
                    isError: false,
                ))
                pendingStartByStepId[log.id] = log.createdAtDate
                seq += 1

            case .tool_result:
                if var last = steps.last,
                   last.kind == .toolCall,
                   let start = pendingStartByStepId[last.id]
                {
                    last.duration = durationString(from: start, to: log.createdAtDate)
                    last.isRunning = false
                    steps[steps.count - 1] = last
                    pendingStartByStepId.removeValue(forKey: last.id)
                }

            case .text:
                let cleaned = log.content.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !cleaned.isEmpty else { continue }
                appendNote(log.id, content: cleaned, at: log.createdAtDate)

            case .thinking:
                let cleaned = log.content.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !cleaned.isEmpty else { continue }
                appendNote(log.id, content: cleaned, at: log.createdAtDate)

            case .error:
                let cleaned = log.content.trimmingCharacters(in: .whitespacesAndNewlines)
                if var last = steps.last {
                    last.isError = true
                    last.isRunning = false
                    steps[steps.count - 1] = last
                }
                if !cleaned.isEmpty {
                    steps.append(TimelineStep(
                        id: log.id,
                        seq: seq,
                        kind: .error,
                        toolName: nil,
                        bodyText: trimmedNote(cleaned),
                        duration: nil,
                        isRunning: false,
                        isError: true,
                    ))
                    seq += 1
                }
            }
        }
        return steps
    }

    private var lastToolUseId: String? {
        logs.last(where: { $0.logType == .tool_use })?.id
    }

    private func argsPreview(from raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.count <= 100 { return trimmed }
        return String(trimmed.prefix(98)) + "…"
    }

    private func trimmedNote(_ raw: String) -> String {
        let collapsed = raw
            .replacingOccurrences(of: "\n", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if collapsed.count <= 160 { return collapsed }
        return String(collapsed.prefix(158)) + "…"
    }

    private func durationString(from start: Date, to end: Date) -> String {
        let seconds = max(0, end.timeIntervalSince(start))
        if seconds < 1 { return String(format: "%.0fms", seconds * 1000) }
        if seconds < 60 { return String(format: "%.1fs", seconds) }
        if seconds < 3600 { return "\(Int(seconds / 60))m" }
        return "\(Int(seconds / 3600))h"
    }

    /// `ios:<deviceId>:<threadId>` → `threadId`. Falls back to nil for
    /// non-iOS conversations (e.g. sms / tg-rooted runs).
    private static func threadId(fromConversationId conversationId: String) -> String? {
        let parts = conversationId.split(separator: ":", maxSplits: 2, omittingEmptySubsequences: false)
        guard parts.count == 3, parts[0] == "ios" else { return nil }
        return String(parts[2])
    }

    fileprivate enum StepKind { case toolCall, note, error }

    fileprivate struct TimelineStep {
        let id: String
        let seq: Int
        let kind: StepKind
        let toolName: String?
        let bodyText: String
        var duration: String?
        var isRunning: Bool
        var isError: Bool
    }
}

// MARK: - timeline step view

private struct AgentTimelineStep: View {
    let step: AgentCard.TimelineStep
    let isLast: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            rail
            content
        }
        .padding(.bottom, isLast ? 0 : 14)
    }

    private var rail: some View {
        VStack(spacing: 0) {
            marker
            if !isLast {
                Rectangle()
                    .fill(BoopColor.border)
                    .frame(width: 1.5)
                    .frame(maxHeight: .infinity)
            }
        }
        .frame(width: 14)
    }

    @ViewBuilder
    private var marker: some View {
        if step.isError {
            Circle().fill(BoopColor.error).frame(width: 7, height: 7)
        } else if step.isRunning {
            ZStack {
                Circle().fill(BoopColor.accentGlow).frame(width: 13, height: 13)
                Circle().fill(BoopColor.accent).frame(width: 7, height: 7)
            }
            .modifier(PulseModifier(active: true))
        } else if step.kind == .note {
            Circle().strokeBorder(BoopColor.borderStrong, lineWidth: 1.5)
                .frame(width: 7, height: 7)
        } else {
            Circle().fill(BoopColor.success).frame(width: 7, height: 7)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch step.kind {
        case .toolCall:
            VStack(alignment: .leading, spacing: 4) {
                toolBadge
                metaRow
            }
        case .note:
            Text(step.bodyText)
                .font(BoopFont.regular(11.5))
                .foregroundStyle(BoopColor.textSecondary)
                .lineLimit(3)
                .frame(maxWidth: .infinity, alignment: .leading)
        case .error:
            VStack(alignment: .leading, spacing: 4) {
                Text("error")
                    .font(BoopFont.mono(11))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8)
                    .frame(height: 22)
                    .background(BoopColor.error, in: RoundedRectangle(cornerRadius: 6))
                Text(step.bodyText)
                    .font(BoopFont.mono(10.5))
                    .foregroundStyle(BoopColor.error.opacity(0.85))
                    .lineLimit(3)
            }
        }
    }

    private var toolBadge: some View {
        Text(step.toolName ?? "tool")
            .font(BoopFont.mono(11))
            .foregroundStyle(step.isRunning ? BoopColor.accent : BoopColor.codeFg)
            .padding(.horizontal, 8)
            .frame(height: 22)
            .background(BoopColor.codeBg, in: RoundedRectangle(cornerRadius: 6))
    }

    private var metaRow: some View {
        HStack(alignment: .top, spacing: 8) {
            Text(step.bodyText)
                .font(BoopFont.mono(10.5))
                .foregroundStyle(BoopColor.textTertiary)
                .lineLimit(2)
            Spacer(minLength: 0)
            if let duration = step.duration {
                Text(duration)
                    .font(BoopFont.mono(10.5))
                    .foregroundStyle(BoopColor.textTertiary)
            }
        }
    }
}

// MARK: - PulseModifier

/// Subtle infinite ease pulse — used on the running-step marker and the
/// header status dot when at least one agent is active.
private struct PulseModifier: ViewModifier {
    let active: Bool
    @State private var pulse = false

    func body(content: Content) -> some View {
        content
            .opacity(active ? (pulse ? 0.4 : 1.0) : 1.0)
            .animation(
                active
                    ? .easeInOut(duration: 0.8).repeatForever(autoreverses: true)
                    : .default,
                value: pulse
            )
            .onAppear { if active { pulse = true } }
    }
}
